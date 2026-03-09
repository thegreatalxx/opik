# Experiments Retrieval Optimization via Denormalization

## Context

The current experiments retrieval endpoint suffers from performance issues at scale due to:

- Complex aggregations at query time: Computing feedback scores, duration quantiles (p50, p90, p99), comment counts, and costs on every request
- Multiple table joins: Experiments → experiment_items → traces → spans → feedback_scores → comments
- Expensive CTEs: 9+ Common Table Expressions with window functions, quantile calculations, and map aggregations
- Poor scalability: Performance degrades linearly with dataset size

<aside>
💡

**Performance Impact:**
- 100 experiments: ~1s (complex aggregations)
- 1000+ experiments: ~3s seconds (scales poorly)
- 1M+ experiments items: ~15s seconds (scales poorly)

</aside>

## Goals

1. Denormalize aggregated metrics at both experiment and experiment_items levels
2. Enable efficient sorting on denormalized columns for pagination
3. Handle large-scale experiments (2M+ experiment items) efficiently
4. Optimize batch updates for large experiments using incremental aggregation
5. Target: Below 5s performance improvement for paginated sorted results for 2M+ experiment items

## Solution Overview

**Why Denormalization?**

The root cause of our performance problem is **recalculating metrics every time someone views experiments**. This worked fine for small workspaces, but at scale, we're redoing the same calculations hundreds of times.

**The Issue:** Our data model stores experiment information across multiple tables. To show a list of experiments, we must join 5+ tables and calculate averages, percentiles, and counts every single time—even if nothing changed.

**The Solution:** Calculate metrics once when the experiment finishes, store the results, then read them directly.

<aside>
💡

**Current approach (slow):**
Every view → Join 5 tables → Calculate averages → Calculate percentiles → Return results

**New approach (fast):**
Finish experiment → Calculate once → Store results
Every view → Read stored results → Return results

</aside>

**Why this makes sense:**

1. **One calculation, many views**: Experiments are finished once but viewed dozens or hundreds of times
2. **Most experiments are stable**: After finish, most don't change (so pre-calculated metrics stay accurate)
3. **Automatic updates when needed**: If users add feedback after finish, we recalculate automatically

**What We're Denormalizing**

We'll pre-compute and store metrics at two levels:

**Experiments Table:** Aggregated metrics across all experiment items

- Feedback scores
- Duration quantiles
- Estimated Cost
- Usage totals
- Project Ids (List)

**Experiment_Items Table:** Per-trace metrics

- Project Id
- Estimated Cost
- Usage totals

## How It Works

**Example: User finishes an experiment with 10,000 traces**

**Step 1: User clicks "Finish Experiment"**
- Backend marks experiment as finished
- Publishes an event: "Experiment XYZ is ready for metric calculation"

**Step 2: Background worker picks up the event**
- Calculates average feedback scores across all 10,000 traces
- Calculates duration percentiles (p50, p90, p99)
- Counts total comments, costs, usage
- User doesn't wait—this happens in the background

**Step 3: Store the calculated results**
- Saves metrics to database as new columns
- Example: `feedback_scores_avg = {"accuracy": 0.85, "hallucination": 0.12}`

**Step 4: User views experiment list later**
- Query reads pre-calculated values directly
- Much faster than recalculating every time

**Key Benefits:**

- **Faster queries**: Reading stored values instead of recalculating
- **Handles large experiments**: 2M+ items process in background without blocking users
- **Automatic updates**: If users add feedback after finish, metrics recalculate automatically
- **Safe rollout**: Can enable gradually and rollback instantly if needed

## Implementation Details

### Lazy Migration Strategy

We'll migrate experiments on-demand when accessed, not via batch backfill.

**Process:**

1. When **GET experiment by ID** endpoint is called:
    - Check if experiment has denormalized metrics populated
    - If NOT migrated: Publish event for async calculation
    - Return current computed metrics (existing query path) immediately
2. Background consumer processes stream event and INSERTs denormalized metrics
3. Subsequent requests use denormalized metrics

**Benefits:**

- No upfront backfill needed
- Only actively accessed experiments are migrated
- Zero downtime migration
- Incremental migration over time

### Handling Updates After Finish

Users can continue adding feedback scores, or updating traces after an experiment finishes, which could make pre-computed metrics stale. We handle this through **debounced re-computation** triggered by:

- New feedback scores or Updates on experiment traces
- Trace or span data updates affecting experiment items

The critical challenge is **write amplification**: adding 10 feedback scores in 2 minutes shouldn't trigger 10 separate re-computations and ClickHouse writes. Instead, we use Redis-based debouncing:

1. When a metrics-affecting change occurs, set Redis key `experiment:denorm:pending:{experiment_id}` → `expiry_timestamp`
2. Every update set's a new value for `expiry_timestamp`
3. Periodic Job posts the experiments pending update to the steam
4. Background consumer processes all accumulated changes at once and INSERTs updated metrics

This approach reduces 10 updates to 1 re-computation, significantly lowering ClickHouse load and costs while remaining configurable:

```yaml
experimentDenormalization:
  debounceDelay: 1m  # Adjust based on usage patterns
```

Re-computation works asynchronously without blocking user operations, experiments remain mostly stable after finishing (reads >> updates), and ClickHouse's ReplacingMergeTree handles deduplication automatically. A feature flag allows falling back to computed metrics if needed.

## Key Decisions

**Architecture:**

- **Event-driven denormalization**: When experiment finishes → publish to a stream → background consumer processes → INSERT denormalized metrics
- **Distributed locking**: Prevent concurrent updates for same experiment using distributed lock
- **Lazy migration**: On-demand migration instead of batch backfill

**Technical Choices:**

- **Debounced re-computation**: Redis-based debouncing to prevent write amplification from frequent updates
- **ReplacingMergeTree**: ClickHouse engine handles automatic deduplication of metrics
- **Feature flag fallback**: Ability to fall back to computed metrics if denormalized values are unavailable