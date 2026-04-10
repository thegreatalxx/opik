package com.comet.opik.api.runner;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.Getter;
import lombok.RequiredArgsConstructor;

import java.util.Arrays;

@Getter
@RequiredArgsConstructor
public enum PakeStep {

    SPAKE2("spake2"),
    CONFIRMATION("confirmation"),
    COMPLETION("completion");

    @JsonValue
    private final String value;

    @JsonCreator
    public static PakeStep fromValue(String value) {
        return Arrays.stream(values())
                .filter(step -> step.value.equals(value))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Unknown PakeStep: " + value));
    }
}
