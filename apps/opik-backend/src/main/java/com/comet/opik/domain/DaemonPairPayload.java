package com.comet.opik.domain;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;
import lombok.Builder;

import java.util.UUID;

/**
 * Persisted PAKE pairing session payload stored in Redis for the duration of
 * the handshake. Workspace/user identify the session owner; runnerId is the
 * runner that will be activated on successful pairing; sessionTtlSeconds is
 * the caller-supplied TTL used to compute expiresAt after completion.
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
        Long sessionTtlSeconds) {

    @JsonCreator
    static DaemonPairPayload fromJson(
            @JsonProperty("runner_id") UUID runnerId,
            @JsonProperty("workspace_id") String workspaceId,
            @JsonProperty("user_name") String userName,
            @JsonProperty("runner_name") String runnerName,
            @JsonProperty("session_ttl_seconds") Long sessionTtlSeconds) {
        return new DaemonPairPayload(runnerId, workspaceId, userName, runnerName, sessionTtlSeconds);
    }
}
