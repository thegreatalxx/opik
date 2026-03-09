# Experiment Aggregates Hybrid Query Strategy

## Overview

During the migration period where experiment aggregates are being populated into denormalized tables (`experiment_aggregates` and `experiment_item_aggregates`), we need a hybrid query strategy that:

1. Uses pre-computed aggregates for migrated experiments (fast path)
2. Computes metrics on-the-fly for non-migrated experiments (slow path)
3. Maintains 100% accuracy and backwards compatibility
4. Optimizes for performance as migration progresses

## Problem Statement

### Query Complexity

The `SELECT_DATASET_ITEM_VERSIONS_WITH_EXPERIMENT_ITEMS` query returns extensive data:

**Aggregated fields (expensive to compute):**
- `duration` - from traces
- `total_estimated_cost` - SUM aggregation from spans
- `usage` - sumMap aggregation from spans
- `feedback_scores` - complex aggregation with deduplication from feedback_scores

**Raw fields (need JOINs):**
- `input`, `output`, `metadata` - from traces
- `feedback_scores_array` - detailed array with reason, author, category
- `comments_array_agg` - from comments
- `visibility_mode` - from traces

**Complex structures:**
- `experiment_items_array` - groupArray with nested tuples containing both raw and aggregated data

### Challenge

Both fast path (migrated) and slow path (non-migrated) must return **ALL fields** with identical structure for UNION ALL to work, but they source data differently:

- **Fast path**: Read from `experiment_item_aggregates` + JOIN for raw fields
- **Slow path**: Compute everything on-the-fly with expensive CTEs

### Filters

The query supports multiple filter types:
- `experiment_item_filters` - on trace fields (duration, input, output, metadata)
- `feedback_scores_filters` - HAVING clauses on aggregated feedback scores
- `feedback_scores_empty_filters` - items with no feedback scores
- `dataset_item_filters` - on dataset item data

Both paths must apply the same filters correctly.

## Solution: UNION ALL with Partitioned CTEs

### High-Level Structure

```sql
WITH
-- Step 1: Identify which items are migrated
migrated_ids AS (...),

-- Step 2: Build expensive CTEs ONLY for non-migrated items
experiment_items_non_migrated AS (...),
trace_data_non_migrated AS (...),
spans_aggregated_non_migrated AS (...),
feedback_scores_aggregated_non_migrated AS (...),

-- Step 3: Fast path for migrated items
fast_path AS (...),

-- Step 4: Slow path for non-migrated items
slow_path AS (...)

-- Step 5: Combine results
SELECT * FROM fast_path
UNION ALL
SELECT * FROM slow_path
ORDER BY id
LIMIT :limit OFFSET :offset
```

### Performance Characteristics

**What we SAVE in fast path:**
- ✅ Skip `sumMap(usage)` aggregation on spans (potentially millions of rows)
- ✅ Skip `SUM(total_estimated_cost)` aggregation on spans
- ✅ Skip complex feedback score aggregation:
  - UNION ALL (feedback_scores + authored_feedback_scores)
  - ROW_NUMBER() OVER (PARTITION BY ...) for deduplication
  - groupArray + arrayMap transformations
  - IF(count() = 1, any(value), avg(value)) logic
- ✅ Skip argMax computations
- ✅ Use pre-computed values instantly

**What we still do in fast path:**
- Simple JOINs to traces (for input, output, metadata)
- Simple JOINs to feedback_scores (for detailed array, no aggregation)
- Simple JOINs to comments

**Performance comparison:**
```
Slow path (100 items):
- Scan spans: 10,000 rows + sumMap + SUM aggregations
- Scan feedback_scores: 5,000 rows + complex aggregation
- Total: ~500ms

Fast path (100 items):
- Read experiment_item_aggregates: 100 rows (pre-computed)
- JOIN traces: 100 rows (simple)
- JOIN feedback_scores: 5,000 rows (no aggregation, just fetch)
- Total: ~50ms

Result: 10x faster even with JOINs
```

As migration progresses:
- **0% migrated**: 100% slow path (current state)
- **50% migrated**: 50% fast + 50% slow = ~5x faster overall
- **100% migrated**: 100% fast path = 10x faster

## Detailed Query Structure

### Step 1: Identify Migrated Items

```sql
WITH migrated_ids AS (
    SELECT id
    FROM experiment_item_aggregates
    WHERE workspace_id = :workspace_id
    AND experiment_id IN (SELECT id FROM experiments_resolved)
)
```

### Step 2: Build CTEs for Non-Migrated Items Only

```sql
-- Partition experiment items
experiment_items_non_migrated AS (
    SELECT *
    FROM experiment_items_scope
    WHERE id NOT IN (SELECT id FROM migrated_ids)
),

-- Trace IDs for non-migrated items
experiment_items_trace_scope_non_migrated AS (
    SELECT DISTINCT trace_id
    FROM experiment_items_non_migrated
),

-- Fetch trace data only for non-migrated
trace_data_non_migrated AS (
    SELECT
        id,
        duration,
        input,
        output,
        metadata,
        visibility_mode
    FROM traces FINAL
    WHERE workspace_id = :workspace_id
    AND id IN (SELECT trace_id FROM experiment_items_trace_scope_non_migrated)
    ORDER BY (workspace_id, project_id, id) DESC, last_updated_at DESC
    LIMIT 1 BY id
),

-- EXPENSIVE: Spans aggregation only for non-migrated
spans_aggregated_non_migrated AS (
    SELECT
        trace_id,
        sumMap(usage) as usage,
        SUM(total_estimated_cost) as total_estimated_cost
    FROM spans FINAL
    WHERE workspace_id = :workspace_id
    AND trace_id IN (SELECT trace_id FROM experiment_items_trace_scope_non_migrated)
    GROUP BY trace_id
),

-- EXPENSIVE: Feedback aggregation only for non-migrated
feedback_scores_combined_raw_non_migrated AS (
    SELECT
        workspace_id,
        project_id,
        entity_id,
        name,
        category_name,
        value,
        reason,
        source,
        created_by,
        last_updated_by,
        created_at,
        last_updated_at,
        last_updated_by AS author
    FROM feedback_scores FINAL
    WHERE entity_type = 'trace'
    AND workspace_id = :workspace_id
    AND entity_id IN (SELECT trace_id FROM experiment_items_trace_scope_non_migrated)
    UNION ALL
    SELECT
        workspace_id,
        project_id,
        entity_id,
        name,
        category_name,
        value,
        reason,
        source,
        created_by,
        last_updated_by,
        created_at,
        last_updated_at,
        author
    FROM authored_feedback_scores FINAL
    WHERE entity_type = 'trace'
    AND workspace_id = :workspace_id
    AND entity_id IN (SELECT trace_id FROM experiment_items_trace_scope_non_migrated)
),

-- Deduplication for non-migrated feedback
feedback_scores_with_ranking_non_migrated AS (
    SELECT *,
           ROW_NUMBER() OVER (
               PARTITION BY workspace_id, project_id, entity_id, name, author
               ORDER BY last_updated_at DESC
           ) as rn
    FROM feedback_scores_combined_raw_non_migrated
),

feedback_scores_combined_non_migrated AS (
    SELECT *
    FROM feedback_scores_with_ranking_non_migrated
    WHERE rn = 1
),

-- Aggregate feedback scores for non-migrated
feedback_scores_final_non_migrated AS (
    SELECT
        entity_id,
        name,
        category_name,
        value,
        reason,
        source,
        groupArray(value) AS values,
        groupArray(reason) AS reasons,
        groupArray(category_name) AS categories,
        groupArray(author) AS authors,
        groupArray(source) AS sources,
        IF(length(values) = 1, arrayElement(values, 1), toDecimal64(arrayAvg(values), 9)) AS aggregated_value,
        mapFromArrays(
            groupArray(name),
            groupArray(aggregated_value)
        ) AS feedback_scores_map,
        groupUniqArray(tuple(
            entity_id, name, category_name, value, reason, source,
            created_at, last_updated_at, created_by, last_updated_by, author
        )) AS feedback_scores_array
    FROM feedback_scores_combined_non_migrated
    GROUP BY entity_id, name
),

-- Comments for non-migrated
comments_non_migrated AS (
    SELECT
        id AS comment_id,
        text,
        created_at AS comment_created_at,
        last_updated_at AS comment_last_updated_at,
        created_by AS comment_created_by,
        last_updated_by AS comment_last_updated_by,
        entity_id
    FROM comments FINAL
    WHERE workspace_id = :workspace_id
    AND entity_id IN (SELECT trace_id FROM experiment_items_trace_scope_non_migrated)
    ORDER BY (workspace_id, project_id, entity_id, id) DESC, last_updated_at DESC
    LIMIT 1 BY id
)
```

### Step 3: Fast Path for Migrated Items

```sql
fast_path AS (
    SELECT
        ei.dataset_item_id AS id,
        :datasetId AS dataset_id,
        COALESCE(di.data, map()) AS data,
        di.description AS description,
        di.trace_id AS trace_id,
        di.span_id AS span_id,
        di.source AS source,
        di.tags AS tags,
        di.evaluators AS evaluators,
        di.execution_policy AS execution_policy,
        di.item_created_at AS created_at,
        di.item_last_updated_at AS last_updated_at,
        di.item_created_by AS created_by,
        di.item_last_updated_by AS last_updated_by,

        -- Pre-computed aggregates (instant)
        argMax(agg.duration, ei.id) AS duration,
        argMax(agg.total_estimated_cost, ei.id) AS total_estimated_cost,
        argMax(agg.usage, ei.id) AS usage,
        argMax(agg.feedback_scores, ei.id) AS feedback_scores,

        -- Raw fields from simple JOINs (no aggregation)
        argMax(t.input, ei.id) AS input,
        argMax(t.output, ei.id) AS output,
        argMax(t.metadata, ei.id) AS metadata,
        argMax(t.visibility_mode, ei.id) AS visibility_mode,

        -- Detailed feedback array (JOIN, no aggregation)
        argMax(
            groupUniqArray(tuple(
                fs.entity_id,
                fs.name,
                fs.category_name,
                fs.value,
                fs.reason,
                fs.source,
                fs.created_at,
                fs.last_updated_at,
                fs.created_by,
                fs.last_updated_by,
                fs.value_by_author
            )),
            ei.id
        ) AS feedback_scores_array,

        -- Comments
        argMax(groupUniqArray(tuple(c.*)), ei.id) AS comments,

        -- Experiment items array
        groupArray(tuple(
            ei.id,
            ei.experiment_id,
            ei.dataset_item_id,
            ei.trace_id,
            t.input,
            t.output,
            fs.feedback_scores_array,
            ei.created_at,
            ei.last_updated_at,
            ei.created_by,
            ei.last_updated_by,
            c.comments_array_agg,
            agg.duration,              -- Pre-computed
            agg.total_estimated_cost,  -- Pre-computed
            agg.usage,                 -- Pre-computed
            t.visibility_mode,
            t.metadata
        )) AS experiment_items_array

    FROM experiment_items_scope ei
    INNER JOIN experiment_item_aggregates agg
        ON ei.id = agg.id AND ei.workspace_id = agg.workspace_id
    LEFT JOIN dataset_items_resolved di
        ON ei.dataset_item_id = di.id

    -- Simple JOINs for raw data (no aggregation)
    LEFT JOIN (
        SELECT id, input, output, metadata, visibility_mode
        FROM traces FINAL
        WHERE workspace_id = :workspace_id
        AND id IN (SELECT trace_id FROM experiment_items_scope WHERE id IN (SELECT id FROM migrated_ids))
        ORDER BY (workspace_id, project_id, id) DESC, last_updated_at DESC
        LIMIT 1 BY id
    ) t ON ei.trace_id = t.id

    LEFT JOIN (
        SELECT entity_id, groupUniqArray(tuple(...)) AS feedback_scores_array
        FROM feedback_scores FINAL
        WHERE workspace_id = :workspace_id
        AND entity_id IN (SELECT trace_id FROM experiment_items_scope WHERE id IN (SELECT id FROM migrated_ids))
        GROUP BY entity_id
    ) fs ON ei.trace_id = fs.entity_id

    LEFT JOIN (
        SELECT entity_id, groupUniqArray(tuple(c.*)) AS comments_array_agg
        FROM comments FINAL
        WHERE workspace_id = :workspace_id
        AND entity_id IN (SELECT trace_id FROM experiment_items_scope WHERE id IN (SELECT id FROM migrated_ids))
        GROUP BY entity_id
    ) c ON ei.trace_id = c.entity_id

    WHERE ei.id IN (SELECT id FROM migrated_ids)

    -- Apply filters (same as slow path)
    <if(experiment_item_filters)>
    AND <experiment_item_filters>
    <endif>
    <if(feedback_scores_filters)>
    AND ei.trace_id IN (
        SELECT entity_id FROM feedback_scores FINAL
        WHERE workspace_id = :workspace_id
        AND entity_id IN (SELECT trace_id FROM experiment_items_scope WHERE id IN (SELECT id FROM migrated_ids))
        GROUP BY entity_id
        HAVING <feedback_scores_filters>
    )
    <endif>
    <if(dataset_item_filters)>
    AND <dataset_item_filters>
    <endif>

    GROUP BY ei.dataset_item_id, di.data, di.description, di.trace_id, di.span_id,
             di.source, di.tags, di.evaluators, di.execution_policy,
             di.item_created_at, di.item_last_updated_at, di.item_created_by, di.item_last_updated_by
)
```

### Step 4: Slow Path for Non-Migrated Items

```sql
slow_path AS (
    SELECT
        ei.dataset_item_id AS id,
        :datasetId AS dataset_id,
        COALESCE(di.data, map()) AS data,
        di.description AS description,
        di.trace_id AS trace_id,
        di.span_id AS span_id,
        di.source AS source,
        di.tags AS tags,
        di.evaluators AS evaluators,
        di.execution_policy AS execution_policy,
        di.item_created_at AS created_at,
        di.item_last_updated_at AS last_updated_at,
        di.item_created_by AS created_by,
        di.item_last_updated_by AS last_updated_by,

        -- Computed aggregates (expensive)
        argMax(t.duration, ei.id) AS duration,
        argMax(s.total_estimated_cost, ei.id) AS total_estimated_cost,
        argMax(s.usage, ei.id) AS usage,
        argMax(fs.feedback_scores_map, ei.id) AS feedback_scores,

        -- Raw fields (same as fast path)
        argMax(t.input, ei.id) AS input,
        argMax(t.output, ei.id) AS output,
        argMax(t.metadata, ei.id) AS metadata,
        argMax(t.visibility_mode, ei.id) AS visibility_mode,

        -- Detailed feedback array (computed)
        argMax(fs.feedback_scores_array, ei.id) AS feedback_scores_array,

        -- Comments
        argMax(groupUniqArray(tuple(c.*)), ei.id) AS comments,

        -- Experiment items array
        groupArray(tuple(
            ei.id,
            ei.experiment_id,
            ei.dataset_item_id,
            ei.trace_id,
            t.input,
            t.output,
            fs.feedback_scores_array,
            ei.created_at,
            ei.last_updated_at,
            ei.created_by,
            ei.last_updated_by,
            c.comments_array_agg,
            t.duration,              -- Computed
            s.total_estimated_cost,  -- Computed
            s.usage,                 -- Computed
            t.visibility_mode,
            t.metadata
        )) AS experiment_items_array

    FROM experiment_items_non_migrated ei
    LEFT JOIN dataset_items_resolved di ON ei.dataset_item_id = di.id
    LEFT JOIN trace_data_non_migrated t ON ei.trace_id = t.id
    LEFT JOIN spans_aggregated_non_migrated s ON ei.trace_id = s.trace_id
    LEFT JOIN feedback_scores_final_non_migrated fs ON ei.trace_id = fs.entity_id
    LEFT JOIN comments_non_migrated c ON ei.trace_id = c.entity_id

    WHERE 1=1

    -- Apply filters (same as fast path)
    <if(experiment_item_filters)>
    AND <experiment_item_filters>
    <endif>
    <if(feedback_scores_filters)>
    AND ei.trace_id IN (
        SELECT entity_id FROM feedback_scores_final_non_migrated
        GROUP BY entity_id
        HAVING <feedback_scores_filters>
    )
    <endif>
    <if(dataset_item_filters)>
    AND <dataset_item_filters>
    <endif>

    GROUP BY ei.dataset_item_id, di.data, di.description, di.trace_id, di.span_id,
             di.source, di.tags, di.evaluators, di.execution_policy,
             di.item_created_at, di.item_last_updated_at, di.item_created_by, di.item_last_updated_by
)
```

### Step 5: Combine Results

```sql
SELECT * FROM fast_path
UNION ALL
SELECT * FROM slow_path
ORDER BY id
<if(sorting)><sorting><endif>
LIMIT :limit OFFSET :offset
SETTINGS log_comment = '<log_comment>'
```

## Filter Handling

Both paths must apply identical filters. Filters reference:

**Aggregated fields (easy):**
- `duration > 1000` → Fast path uses `agg.duration`, slow path uses computed `t.duration`
- `feedback_scores['accuracy'] > 0.8` → Both can filter on the map

**Raw fields (need JOINs in fast path):**
- `input LIKE '%text%'` → Both JOIN traces and filter on `t.input`
- `metadata['key'] = 'value'` → Both JOIN traces and filter on `t.metadata`

**Complex aggregations (need subqueries):**
- `HAVING AVG(score) > 0.5` → Both use subquery on feedback_scores with GROUP BY ... HAVING

## Implementation Notes

### Java Integration

```java
public Flux<DatasetItemVersion> getDatasetItemVersionsWithExperimentItems(
        String datasetId,
        UUID versionId,
        List<UUID> experimentIds,
        SearchCriteria criteria) {

    // Use hybrid query during migration
    var template = getSTWithLogComment(
        SELECT_DATASET_ITEM_VERSIONS_WITH_EXPERIMENT_ITEMS_HYBRID,
        "getDatasetItemVersionsHybrid",
        workspaceId,
        datasetId
    );

    // Add filter flags
    template.add("experiment_item_filters", criteria.hasExperimentItemFilters());
    template.add("feedback_scores_filters", criteria.hasFeedbackScoresFilters());
    template.add("dataset_item_filters", criteria.hasDatasetItemFilters());

    // Execute query
    return asyncTemplate.stream(connection -> {
        var statement = connection.createStatement(template.render())
            .bind("workspace_id", workspaceId)
            .bind("datasetId", datasetId)
            .bind("versionId", versionId)
            .bind("limit", criteria.getLimit())
            .bind("offset", criteria.getOffset());

        // Bind filter parameters
        if (criteria.hasExperimentItemFilters()) {
            bindExperimentItemFilters(statement, criteria);
        }
        if (criteria.hasFeedbackScoresFilters()) {
            bindFeedbackScoresFilters(statement, criteria);
        }

        return Flux.from(statement.execute())
            .flatMap(result -> result.map((row, metadata) ->
                mapDatasetItemVersion(row)));
    });
}
```

### Monitoring Migration Progress

Add metrics to track fast vs slow path usage:

```java
// In query execution
if (usedFastPath) {
    metrics.incrementCounter("dataset_items.query.fast_path");
} else {
    metrics.incrementCounter("dataset_items.query.slow_path");
}

// Query execution time
metrics.recordTimer("dataset_items.query.duration", duration);
```

### Post-Migration Cleanup

Once 100% of experiments are migrated:

1. Remove slow path entirely
2. Simplify query to only use fast path
3. Remove UNION ALL
4. Remove migration status checks

```sql
-- Final query after migration (much simpler)
SELECT
    ei.dataset_item_id AS id,
    agg.duration,
    agg.usage,
    agg.feedback_scores,
    t.input,
    t.output,
    ...
FROM experiment_items_scope ei
INNER JOIN experiment_item_aggregates agg ON ei.id = agg.id
LEFT JOIN traces FINAL t ON ei.trace_id = t.id
LEFT JOIN feedback_scores FINAL fs ON ei.trace_id = fs.entity_id
...
```

## Testing Strategy

### Accuracy Testing

Compare results from hybrid query vs. old query:

```java
@Test
void hybridQueryReturnsIdenticalResults() {
    // Execute both queries
    var hybridResults = executeHybridQuery(criteria);
    var oldResults = executeOldQuery(criteria);

    // Compare results
    assertThat(hybridResults)
        .usingRecursiveComparison()
        .isEqualTo(oldResults);
}
```

### Performance Testing

Measure performance improvement as migration progresses:

```java
@Test
void hybridQueryPerformanceImproves() {
    // 0% migrated
    var baseline = measureQueryTime(criteria);

    // Migrate 50%
    migrateHalfOfExperiments();
    var halfMigrated = measureQueryTime(criteria);
    assertThat(halfMigrated).isLessThan(baseline * 0.7); // At least 30% faster

    // Migrate 100%
    migrateAllExperiments();
    var fullyMigrated = measureQueryTime(criteria);
    assertThat(fullyMigrated).isLessThan(baseline * 0.2); // At least 80% faster
}
```

### Filter Testing

Ensure filters work correctly in both paths:

```java
@Test
void filtersApplyCorrectlyInBothPaths() {
    // Create mix of migrated and non-migrated items
    createMigratedItems(50);
    createNonMigratedItems(50);

    // Apply filter
    var criteria = SearchCriteria.builder()
        .durationGreaterThan(1000)
        .feedbackScoreGreaterThan("accuracy", 0.8)
        .build();

    var results = executeHybridQuery(criteria);

    // Verify all results match filter
    assertThat(results).allMatch(r -> r.getDuration() > 1000);
    assertThat(results).allMatch(r -> r.getFeedbackScores().get("accuracy") > 0.8);
}
```

## Trade-offs

### Pros
- ✅ Maintains 100% accuracy
- ✅ Significant performance improvement as migration progresses
- ✅ Gradual migration without breaking changes
- ✅ Clear separation of fast and slow paths
- ✅ Easy to monitor and debug

### Cons
- ❌ SQL query becomes longer (but each path is simpler)
- ❌ Some duplication of SELECT logic (temporary, removed after migration)
- ❌ Need to maintain filter logic in both paths (but shared via StringTemplate)

## Conclusion

The UNION ALL hybrid approach provides the best balance of:
- **Accuracy**: Both paths return identical results
- **Performance**: Significant speedup as migration progresses (10x faster when fully migrated)
- **Maintainability**: Clear separation, easy to remove after migration

The key insight is that **skipping expensive aggregations** (sumMap, complex feedback logic) provides the performance benefit, even though we still need simple JOINs for raw fields.
