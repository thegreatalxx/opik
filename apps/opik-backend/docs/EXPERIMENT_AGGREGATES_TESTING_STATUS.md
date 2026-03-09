# Experiment Aggregates Testing Status

This document tracks the testing status of queries that have been migrated to use the `experiment_aggregates` and `experiment_item_aggregates` tables instead of calculating from raw data.

## Purpose

The experiment aggregates tables store pre-calculated metrics to improve query performance. This document ensures that all queries using these tables have proper test coverage comparing their results against the original calculation methods.

## Test Status

### ✅ Completed Tests

#### 1. ExperimentDAO.FIND Query
**Status**: ✅ Complete
**Test**: `ExperimentAggregatesIntegrationTest.testExperimentDaoFindWithAggregates()`
**Implementation**: Task #6
**Description**: Verifies that the FIND query returns the same results whether calculated from raw data or retrieved from the aggregates table.
**Coverage**:
- Experiment-level aggregations (trace count, total estimated cost, avg cost)
- Feedback score aggregations
- Experiment score aggregations
- Duration percentiles

#### 2. ExperimentDAO.FIND_COUNT Query
**Status**: ✅ Complete
**Test**: Covered by `testExperimentDaoFindWithAggregates()`
**Implementation**: Task #7
**Description**: Count queries implicitly tested through FIND query validation.

#### 3. ExperimentAggregatesService.findGroupsResponse Query
**Status**: ✅ Complete
**Test**: `ExperimentAggregatesIntegrationTest.testFindGroupsFromAggregates()`
**Implementation**: Task #8
**Date**: 2026-02-20
**Description**: Verifies that `experimentAggregatesService.findGroupsResponse()` returns the same `ExperimentGroupResponse` as `experimentService.findGroups()` (raw calculation). Both services now implement the same contract and return the same response format.
**Coverage**:
- Grouping by dataset_id
- Grouping by project_id
- Grouping by multiple fields (dataset_id and project_id)
- Response structure consistency between raw and aggregates paths
- Enrichment with dataset and project metadata

**Implementation Details**:
- Added `findGroupsResponse()` method to `ExperimentAggregatesService` that replicates the contract of `ExperimentService.findGroups()`
- Both methods return `Mono<ExperimentGroupResponse>`
- Uses recursive comparison to verify responses match exactly

**Parameterized Test Cases**:
1. Group by dataset_id
2. Group by project_id
3. Group by dataset_id and project_id

#### 4. ExperimentAggregatesService.findGroupsAggregationsResponse Query
**Status**: ✅ Complete
**Test**: `ExperimentAggregatesIntegrationTest.testFindGroupsAggregationsFromAggregates()`
**Implementation**: Task #9
**Date**: 2026-02-20
**Description**: Verifies that `experimentAggregatesService.findGroupsAggregationsResponse()` returns the same `ExperimentGroupAggregationsResponse` as `experimentService.findGroupsAggregations()` (raw calculation). Both services now implement the same contract and return the same response format.
**Coverage**:
- Group-level aggregations (experiment count, trace count)
- Total estimated cost and avg cost per group
- Feedback score averages per group
- Experiment score averages per group
- Duration percentiles per group
- Response structure consistency between raw and aggregates paths
- Enrichment with dataset and project metadata

**Implementation Details**:
- Added `findGroupsAggregationsResponse()` method to `ExperimentAggregatesService` that replicates the contract of `ExperimentService.findGroupsAggregations()`
- Both methods return `Mono<ExperimentGroupAggregationsResponse>`
- Uses recursive comparison with BigDecimal comparator to verify responses match exactly

**Parameterized Test Cases**:
1. Group aggregations by dataset_id
2. Group aggregations by project_id
3. Group aggregations by dataset_id and project_id

#### 5. SELECT_DATASET_ITEM_VERSIONS_WITH_EXPERIMENT_ITEMS_COUNT
**Status**: ✅ Complete
**Test**: `ExperimentAggregatesIntegrationTest.testDatasetItemCountWithAggregates()`
**Implementation**: Task #2
**Date**: 2026-02-23
**Description**: Verifies that `experimentAggregatesService.countDatasetItemsWithExperimentItemsFromAggregates()` returns the same count as the original `datasetResourceClient.getDatasetItemsWithExperimentItems()`.
**Coverage**:
- No filters (baseline)
- Filter by duration > 0
- Filter by feedback score with key (GREATER_THAN)
- Filter by feedback score is not empty with key
- Filter by feedback score is empty with key
- Filter by output field (dynamic JSON path)
- Search in input/output
- Combined filter and search

#### 6. SELECT_DATASET_ITEM_VERSIONS_WITH_EXPERIMENT_ITEMS
**Status**: ✅ Complete
**Test**: `ExperimentAggregatesIntegrationTest.getDatasetItemsWithExperimentItemsFromAggregates()`
**Implementation**: Task #3
**Date**: 2026-02-23
**Description**: Verifies that `experimentAggregatesService.getDatasetItemsWithExperimentItemsFromAggregates()` returns the same paginated `DatasetItemPage` (total, page, size, and item content) as the original DAO.
**Coverage**:
- Same filter scenarios as the count test
- Full recursive comparison of `DatasetItem` content (ignoring timestamps/IDs)
- Nested `ExperimentItem` comparison with BigDecimal tolerance for cost and epsilon for duration
- Collection order-insensitive comparison for feedback scores

#### 7. SELECT_DATASET_ITEM_VERSIONS_WITH_EXPERIMENT_ITEMS_STATS
**Status**: ✅ Complete
**Test**: `ExperimentAggregatesIntegrationTest.getExperimentItemsStatsFromAggregates()`
**Implementation**: Task #4
**Date**: 2026-02-23
**Description**: Verifies that `experimentAggregatesService.getExperimentItemsStatsFromAggregates()` returns the same `ProjectStats` as `datasetResourceClient.getDatasetExperimentItemsStats()`.
**Coverage**:
- Same filter scenarios as the count/items tests
- BigDecimal comparator tolerance for numeric aggregations
- Double comparator for duration values
- Epsilon comparator for `value` fields
- Collection order-insensitive comparison

## Test Implementation Guidelines

### Test Structure
All tests should follow this pattern:

1. **Setup**: Create test data (experiments, experiment items, traces, spans, feedback scores)
2. **Aggregate Population**: Call `experimentAggregatesService.populateAggregations(experimentId)`
3. **Query Execution**: Execute the query using the aggregates-based method
4. **Comparison**: Compare results with expected values or raw calculation
5. **Assertions**: Verify all aggregate fields match expected values

### Test Data Requirements
- Use PODAM factory for generating random test data
- Create realistic data with proper relationships (experiments → items → traces → spans)
- Include feedback scores and experiment scores
- Test with multiple experiments to verify grouping logic

### Assertion Strategy
- Use `RecursiveComparisonConfiguration` for comparing complex objects
- Ignore timestamp fields and IDs when comparing aggregates
- Use `BigDecimalComparator` for numeric comparisons (tolerance for rounding)
- Test both individual field values and collection aggregations

## Key Files

### Implementation
- `ExperimentAggregatesDAO.java` - DAO interface and implementation for aggregates queries
- `ExperimentAggregatesService.java` - Service layer for aggregates operations
- `ExperimentDAO.java` - Original DAO with raw calculation queries (reference implementation)

### Tests
- `ExperimentAggregatesIntegrationTest.java` - Integration tests for experiment aggregates

### Utilities
- `ExperimentsTestUtils.java` - Helper methods for building expected responses from test data

## Migration Checklist

When migrating a query to use aggregates:

- [ ] Implement aggregate-based query in `ExperimentAggregatesDAO`
- [ ] Add service method in `ExperimentAggregatesService`
- [ ] Create parameterized integration test
- [ ] Test with various grouping scenarios
- [ ] Compare results with raw calculation
- [ ] Update this status document
- [ ] Verify performance improvement (optional, but recommended for large datasets)

## Notes

### Performance Considerations
- Aggregates tables use ReplacingMergeTree engine in ClickHouse
- Queries must use FINAL or LIMIT 1 BY for deduplication
- Pre-aggregated data significantly improves query performance for complex calculations

### Data Consistency
- Aggregates are populated asynchronously after experiment creation
- Tests verify that aggregate values match raw calculations
- Background jobs keep aggregates up-to-date as data changes

## Last Updated
2026-02-23

## Contributors
- Claude Code (Implementation and Testing)
