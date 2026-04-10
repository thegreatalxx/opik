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

    /**
     * Resolves a {@link PakeRole} from its wire value. Used by both Jackson
     * body deserialization ({@link JsonCreator}) and JAX-RS path/query parameter
     * conversion (via the standard {@code fromString} naming convention).
     */
    @JsonCreator
    public static PakeRole fromString(String value) {
        return Arrays.stream(values())
                .filter(role -> role.value.equals(value))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Unknown PakeRole: " + value));
    }
}
