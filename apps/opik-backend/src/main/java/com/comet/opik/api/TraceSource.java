package com.comet.opik.api;

import com.fasterxml.jackson.annotation.JsonValue;
import lombok.Getter;
import lombok.RequiredArgsConstructor;

import java.util.Arrays;
import java.util.Optional;

/**
 * The origin of a trace, set at creation time.
 * <p>
 * The {@code unknown} value (Enum8 = 0) is the ClickHouse DEFAULT for rows that predate this field.
 * It is intentionally absent from this enum so it cannot be explicitly ingested via the API.
 * </p>
 **/
@Getter
@RequiredArgsConstructor
public enum TraceSource {

    SDK("sdk"),
    EXPERIMENT("experiment"),
    PLAYGROUND("playground"),
    OPTIMIZATION("optimization"),
    ;

    @JsonValue
    private final String value;

    public static Optional<TraceSource> fromString(String value) {
        return Arrays.stream(TraceSource.values())
                .filter(v -> v.getValue().equals(value))
                .findFirst();
    }
}
