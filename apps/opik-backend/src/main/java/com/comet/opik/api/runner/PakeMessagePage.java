package com.comet.opik.api.runner;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;
import lombok.Builder;

import java.util.List;

@Builder(toBuilder = true)
@JsonIgnoreProperties(ignoreUnknown = true)
@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public record PakeMessagePage(List<PakeMessageResponse> messages) {

    private static final PakeMessagePage EMPTY = PakeMessagePage.builder().messages(List.of()).build();

    /** Shared empty-page instance returned on long-poll timeouts. */
    public static PakeMessagePage empty() {
        return EMPTY;
    }
}
