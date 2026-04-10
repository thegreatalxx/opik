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

    /**
     * Resolves a {@link PakeStep} from its wire value. This is used by BOTH:
     * <ul>
     *   <li>Jackson body deserialization via {@link JsonCreator}</li>
     *   <li>JAX-RS {@link jakarta.ws.rs.QueryParam} / {@link jakarta.ws.rs.PathParam}
     *       conversion via the JAX-RS standard {@code fromString} naming convention</li>
     * </ul>
     * Throwing {@link IllegalArgumentException} on unknown values matches JAX-RS
     * expectations and surfaces as a 404 at the resource layer.
     */
    @JsonCreator
    public static PakeStep fromString(String value) {
        return Arrays.stream(values())
                .filter(step -> step.value.equals(value))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Unknown PakeStep: " + value));
    }
}
