package com.comet.opik.domain;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;
import lombok.Builder;

import java.util.UUID;

/**
 * Persisted PAKE pairing session payload stored in Redis for the duration of
 * the handshake. Workspace/user identify the session owner; runnerId is the
 * runner that will be activated on successful pairing; connectionTtlSeconds
 * is the caller-supplied TTL used to compute the connection's {@code expiresAt}
 * after completion (NOT the PAKE handshake TTL, which is a fixed 5 minutes).
 */
@Builder(toBuilder = true)
@JsonInclude(JsonInclude.Include.NON_NULL)
@JsonIgnoreProperties(ignoreUnknown = true)
@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
record DaemonPairPayload(
        UUID runnerId,
        String workspaceId,
        String userName,
        String runnerName,
        Long connectionTtlSeconds) {
}
