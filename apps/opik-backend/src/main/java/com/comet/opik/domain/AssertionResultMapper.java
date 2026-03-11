package com.comet.opik.domain;

import com.comet.opik.api.AssertionResult;
import com.comet.opik.api.ExecutionPolicy;
import com.comet.opik.api.ExperimentItem;
import com.comet.opik.utils.JsonUtils;
import lombok.experimental.UtilityClass;
import org.apache.commons.lang3.StringUtils;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@UtilityClass
class AssertionResultMapper {

    static final String SUITE_ASSERTION_CATEGORY = "suite_assertion";

    static ExperimentItem enrichWithAssertions(ExperimentItem item) {
        var feedbackScores = item.feedbackScores();
        if (feedbackScores == null || feedbackScores.isEmpty()) {
            return item;
        }

        var partitioned = feedbackScores.stream()
                .collect(Collectors.partitioningBy(
                        fs -> SUITE_ASSERTION_CATEGORY.equals(fs.categoryName())));

        var assertions = partitioned.get(true);
        var regularScores = partitioned.get(false);

        if (assertions.isEmpty()) {
            return item;
        }

        var assertionResults = assertions.stream()
                .map(fs -> AssertionResult.builder()
                        .value(fs.name())
                        .passed(fs.value().compareTo(BigDecimal.ONE) >= 0)
                        .reason(fs.reason())
                        .build())
                .toList();

        boolean allPassed = assertionResults.stream().allMatch(AssertionResult::passed);

        return item.toBuilder()
                .feedbackScores(regularScores.isEmpty() ? null : regularScores)
                .assertionResults(assertionResults)
                .status(allPassed ? "passed" : "failed")
                .build();
    }

    static List<ExperimentItem> enrichWithMultiRunStatus(List<ExperimentItem> items) {
        if (items == null || items.isEmpty()) {
            return items;
        }

        var byExperiment = items.stream()
                .collect(Collectors.groupingBy(ExperimentItem::experimentId));

        return byExperiment.values().stream()
                .flatMap(group -> {
                    boolean hasAssertions = group.stream()
                            .anyMatch(i -> i.assertionResults() != null);

                    if (!hasAssertions || group.size() <= 1) {
                        return group.stream();
                    }

                    long passedRuns = group.stream()
                            .filter(i -> "passed".equals(i.status()))
                            .count();
                    int totalRuns = group.size();

                    int passThreshold = group.stream()
                            .map(ExperimentItem::executionPolicy)
                            .filter(ep -> ep != null)
                            .findFirst()
                            .map(ExecutionPolicy::passThreshold)
                            .orElse(1);

                    String itemStatus = passedRuns >= passThreshold ? "passed" : "failed";

                    return group.stream()
                            .map(i -> i.toBuilder()
                                    .passedRuns((int) passedRuns)
                                    .totalRuns(totalRuns)
                                    .status(itemStatus)
                                    .build());
                })
                .toList();
    }

    static ExecutionPolicy parseExecutionPolicy(Object raw) {
        return Optional.ofNullable(raw)
                .map(Object::toString)
                .filter(StringUtils::isNotBlank)
                .map(s -> JsonUtils.readValue(s, ExecutionPolicy.class))
                .orElse(null);
    }
}
