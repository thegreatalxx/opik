package com.comet.opik.api.runner;

import com.fasterxml.jackson.annotation.JsonValue;
import lombok.Getter;
import lombok.RequiredArgsConstructor;

@Getter
@RequiredArgsConstructor
public enum BridgeCommandStatus {

    PENDING("pending"),
    PICKED_UP("picked_up"),
    COMPLETED("completed"),
    FAILED("failed"),
    TIMED_OUT("timed_out"),
    CANCELLED("cancelled");

    @JsonValue
    private final String value;
}
