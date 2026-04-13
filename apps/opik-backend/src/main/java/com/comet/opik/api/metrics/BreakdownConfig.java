package com.comet.opik.api.metrics;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;
import lombok.Builder;

import java.util.List;

/**
 * Configuration for grouping metrics by a specific dimension.
 * Simplified configuration - always shows top 10 groups by value descending,
 * with remaining groups aggregated into "Others".
 *
 * @param field            The field to group by
 * @param metadataKey      Required when field is METADATA - the key to extract from metadata JSON
 * @param tagValues        Optional list of tag values to include or exclude when field is TAGS
 * @param tagValuesExclude When true, tagValues act as a blacklist; when false (default), as a whitelist
 */
@Builder(toBuilder = true)
@JsonIgnoreProperties(ignoreUnknown = true)
@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public record BreakdownConfig(
        BreakdownField field,
        String metadataKey,
        String subMetric,
        List<String> tagValues,
        Boolean tagValuesExclude) {

    /**
     * Creates a default config with no grouping.
     */
    public static BreakdownConfig none() {
        return BreakdownConfig.builder()
                .field(BreakdownField.NONE)
                .build();
    }
}
