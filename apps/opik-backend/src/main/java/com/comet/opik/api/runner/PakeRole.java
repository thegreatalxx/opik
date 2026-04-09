package com.comet.opik.api.runner;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.Getter;
import lombok.RequiredArgsConstructor;

import java.util.Arrays;

@Getter
@RequiredArgsConstructor
public enum PakeRole {

    DAEMON("daemon"),
    BROWSER("browser");

    @JsonValue
    private final String value;

    @JsonCreator
    public static PakeRole fromValue(String value) {
        return Arrays.stream(values())
                .filter(role -> role.value.equals(value))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Unknown PakeRole: " + value));
    }
}
