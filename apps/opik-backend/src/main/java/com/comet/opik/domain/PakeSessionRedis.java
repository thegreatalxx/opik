package com.comet.opik.domain;

import com.comet.opik.api.runner.PakeRole;
import com.comet.opik.api.runner.PakeStep;
import com.comet.opik.infrastructure.redis.StringRedisClient;
import com.comet.opik.utils.JsonUtils;
import lombok.NonNull;
import lombok.RequiredArgsConstructor;
import org.redisson.api.RAtomicLong;
import org.redisson.api.RBlockingDeque;
import org.redisson.api.RBucket;

import java.time.Duration;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

/**
 * Encapsulates all Redis key construction and access for PAKE pairing sessions.
 *
 * <p>The PAKE handshake uses three kinds of Redis primitives per session:
 * <ol>
 *   <li>A bucket storing the {@link DaemonPairPayload} for the life of the handshake</li>
 *   <li>Six {@link RBlockingDeque} inboxes, one per (target role, step) pair, that let
 *       each side long-poll for the next expected message from its peer</li>
 *   <li>An atomic counter tracking failed pairing attempts for rate limiting</li>
 * </ol>
 *
 * <p>Key ordering deliberately puts {@code projectId} before {@code workspaceId:userName}
 * so the higher-cardinality dimension comes first — this improves key dispersion in
 * Redis cluster mode and matches the convention used elsewhere in this service.
 *
 * <p>The inbox-per-(role, step) split means a poller never scans or filters messages
 * it doesn't want: {@code pollAsync} on the exact target queue either returns the
 * next message from that side of the handshake or times out. No in-memory filtering,
 * no {@code readAll} per poll cycle.
 */
@RequiredArgsConstructor
class PakeSessionRedis {

    private static final String KEY_PREFIX = "opik:runners:pake";

    private final @NonNull StringRedisClient redisClient;

    // ---- Key construction -------------------------------------------------

    private static String sessionKey(UUID projectId, String workspaceId, String userName) {
        return KEY_PREFIX + ":session:" + projectId + ":" + workspaceId + ":" + userName;
    }

    private static String inboxKey(UUID projectId, String workspaceId, String userName,
            PakeRole targetRole, PakeStep step) {
        return KEY_PREFIX + ":inbox:" + projectId + ":" + workspaceId + ":" + userName
                + ":" + targetRole.getValue() + ":" + step.getValue();
    }

    private static String attemptsKey(UUID projectId, String workspaceId, String userName) {
        return KEY_PREFIX + ":attempts:" + projectId + ":" + workspaceId + ":" + userName;
    }

    // ---- Session bucket ---------------------------------------------------

    void createSession(UUID projectId, String workspaceId, String userName,
            DaemonPairPayload payload, Duration ttl) {
        // Clean up any stale session for this user+project (crash recovery).
        deleteSession(projectId, workspaceId, userName);

        RBucket<String> bucket = redisClient.getBucket(sessionKey(projectId, workspaceId, userName));
        bucket.set(JsonUtils.writeValueAsString(payload), ttl);
    }

    boolean sessionExists(UUID projectId, String workspaceId, String userName) {
        return redisClient.getBucket(sessionKey(projectId, workspaceId, userName)).isExists();
    }

    Optional<DaemonPairPayload> getSession(UUID projectId, String workspaceId, String userName) {
        String json = redisClient.getBucket(sessionKey(projectId, workspaceId, userName)).get();
        return json == null ? Optional.empty() : Optional.of(JsonUtils.readValue(json, DaemonPairPayload.class));
    }

    Optional<DaemonPairPayload> takeSession(UUID projectId, String workspaceId, String userName) {
        String json = redisClient.getBucket(sessionKey(projectId, workspaceId, userName)).getAndDelete();
        return json == null ? Optional.empty() : Optional.of(JsonUtils.readValue(json, DaemonPairPayload.class));
    }

    void deleteSession(UUID projectId, String workspaceId, String userName) {
        redisClient.getBucket(sessionKey(projectId, workspaceId, userName)).delete();
        for (PakeRole role : PakeRole.values()) {
            for (PakeStep step : PakeStep.values()) {
                redisClient.<String>getBlockingDeque(inboxKey(projectId, workspaceId, userName, role, step)).delete();
            }
        }
        redisClient.getAtomicLong(attemptsKey(projectId, workspaceId, userName)).delete();
    }

    // ---- Inboxes (one RBlockingDeque per (role, step)) --------------------

    void postMessage(UUID projectId, String workspaceId, String userName,
            PakeRole targetRole, PakeStep step, String payload, Duration ttl) {
        RBlockingDeque<String> deque = redisClient.<String>getBlockingDeque(
                inboxKey(projectId, workspaceId, userName, targetRole, step));
        deque.add(payload);
        deque.expire(ttl);
    }

    /**
     * Blocks until a message arrives in the specified inbox or the timeout elapses.
     * Returns an empty {@link Optional} on timeout. The returned string is the
     * opaque payload that was previously {@link #postMessage posted}.
     */
    Optional<String> awaitMessage(UUID projectId, String workspaceId, String userName,
            PakeRole targetRole, PakeStep step, Duration timeout) throws InterruptedException {
        RBlockingDeque<String> deque = redisClient.<String>getBlockingDeque(
                inboxKey(projectId, workspaceId, userName, targetRole, step));
        String payload = deque.poll(timeout.toMillis(), TimeUnit.MILLISECONDS);
        return Optional.ofNullable(payload);
    }

    // ---- Attempts counter -------------------------------------------------

    long incrementAttempts(UUID projectId, String workspaceId, String userName, Duration ttlOnFirstIncrement) {
        RAtomicLong attempts = redisClient.getAtomicLong(attemptsKey(projectId, workspaceId, userName));
        long count = attempts.incrementAndGet();
        if (count == 1L) {
            attempts.expire(ttlOnFirstIncrement);
        }
        return count;
    }
}
