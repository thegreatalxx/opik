package com.comet.opik.api.runner;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Builder;

@Builder(toBuilder = true)
@JsonIgnoreProperties(ignoreUnknown = true)
@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public record PakeMessageRequest(
        @NotNull PakeRole role,
        @Min(STEP_SPAKE2) @Max(STEP_COMPLETION) int step,
        @NotBlank String payload) {

    public static final int STEP_SPAKE2 = 0;
    public static final int STEP_CONFIRMATION = 1;
    public static final int STEP_COMPLETION = 2;
}
