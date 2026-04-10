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
import reactor.core.publisher.Mono;

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

    private static String consumedMarkerKey(UUID projectId, String workspaceId, String userName) {
        return KEY_PREFIX + ":consumed:" + projectId + ":" + workspaceId + ":" + userName;
    }

    private static String inboxKey(UUID projectId, String workspaceId, String userName,
            PakeRole targetRole, PakeStep step) {
        return KEY_PREFIX + ":inbox:" + projectId + ":" + workspaceId + ":" + userName
                + ":" + targetRole.getValue() + ":" + step.getValue();
    }

    /**
     * Per (role, step) marker bucket used to detect and reject duplicate posts. A PAKE
     * handshake expects exactly one message per {@code (targetRole, step)} combination
     * within a session; a second post is either a client retry bug or a relay replay
     * attempt and should be rejected with 409 rather than silently double-queued.
     */
    private static String postedMarkerKey(UUID projectId, String workspaceId, String userName,
            PakeRole targetRole, PakeStep step) {
        return KEY_PREFIX + ":posted:" + projectId + ":" + workspaceId + ":" + userName
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

    /**
     * Returns true if the session is reachable for any purpose — either still active
     * or recently consumed (within the post-consume TTL set by {@link #consumeSession}).
     * Used by long-pollers, which include the daemon's final COMPLETION poll after
     * the active session has been consumed.
     */
    boolean sessionExists(UUID projectId, String workspaceId, String userName) {
        return redisClient.getBucket(sessionKey(projectId, workspaceId, userName)).isExists()
                || redisClient.getBucket(consumedMarkerKey(projectId, workspaceId, userName)).isExists();
    }

    /**
     * Returns true only if the session is still in the active (pre-consume) state.
     * Used by writers (handshake message posters) so a consumed session cannot
     * accept new messages.
     */
    boolean isSessionActive(UUID projectId, String workspaceId, String userName) {
        return redisClient.getBucket(sessionKey(projectId, workspaceId, userName)).isExists();
    }

    Optional<DaemonPairPayload> getSession(UUID projectId, String workspaceId, String userName) {
        String json = redisClient.getBucket(sessionKey(projectId, workspaceId, userName)).get();
        return json == null ? Optional.empty() : Optional.of(JsonUtils.readValue(json, DaemonPairPayload.class));
    }

    /**
     * Atomically removes the active session and writes a short-lived consumed marker.
     * The marker keeps {@link #sessionExists} true so the daemon's final COMPLETION
     * poll still passes the auth check, while {@link #isSessionActive} immediately
     * returns false so no further handshake messages can be posted.
     */
    Optional<DaemonPairPayload> consumeSession(UUID projectId, String workspaceId, String userName,
            Duration postConsumeTtl) {
        String json = redisClient.getBucket(sessionKey(projectId, workspaceId, userName)).getAndDelete();
        if (json == null) {
            return Optional.empty();
        }
        redisClient.getBucket(consumedMarkerKey(projectId, workspaceId, userName))
                .set("1", postConsumeTtl);
        return Optional.of(JsonUtils.readValue(json, DaemonPairPayload.class));
    }

    void deleteSession(UUID projectId, String workspaceId, String userName) {
        redisClient.getBucket(sessionKey(projectId, workspaceId, userName)).delete();
        redisClient.getBucket(consumedMarkerKey(projectId, workspaceId, userName)).delete();
        for (PakeRole role : PakeRole.values()) {
            for (PakeStep step : PakeStep.values()) {
                redisClient.<String>getBlockingDeque(inboxKey(projectId, workspaceId, userName, role, step)).delete();
                redisClient.getBucket(postedMarkerKey(projectId, workspaceId, userName, role, step)).delete();
            }
        }
        redisClient.getAtomicLong(attemptsKey(projectId, workspaceId, userName)).delete();
    }

    // ---- Inboxes (one RBlockingDeque per (role, step)) --------------------

    /**
     * Posts a message into the target inbox. Returns {@code false} if a message
     * for this {@code (targetRole, step)} pair has already been posted in this
     * session — the caller should treat that as a 409 conflict and not append.
     */
    boolean postMessageIfFirst(UUID projectId, String workspaceId, String userName,
            PakeRole targetRole, PakeStep step, String payload, Duration ttl) {
        RBucket<String> marker = redisClient.getBucket(
                postedMarkerKey(projectId, workspaceId, userName, targetRole, step));
        if (!marker.trySet("1", ttl.toMillis(), TimeUnit.MILLISECONDS)) {
            return false;
        }
        RBlockingDeque<String> deque = redisClient.<String>getBlockingDeque(
                inboxKey(projectId, workspaceId, userName, targetRole, step));
        deque.add(payload);
        deque.expire(ttl);
        return true;
    }

    /**
     * Returns a {@link Mono} that emits the next message in the specified inbox
     * or completes empty on timeout. Uses Redisson's async poll so a cancelled
     * subscription (e.g. AsyncResponse timeout, client disconnect) releases the
     * boundedElastic thread immediately rather than blocking until the Redis-side
     * timeout expires — avoiding the orphaned-poll "message stealing" problem.
     *
     * <p>Mirrors the async pattern used by {@code awaitBridgeCommand} in
     * {@link LocalRunnerService}, which drives the bridge long-poll.
     */
    Mono<Optional<String>> awaitMessage(UUID projectId, String workspaceId, String userName,
            PakeRole targetRole, PakeStep step, Duration timeout) {
        RBlockingDeque<String> deque = redisClient.<String>getBlockingDeque(
                inboxKey(projectId, workspaceId, userName, targetRole, step));
        return Mono.fromCompletionStage(() -> deque.pollAsync(timeout.toMillis(), TimeUnit.MILLISECONDS))
                .map(Optional::ofNullable)
                .defaultIfEmpty(Optional.empty());
    }

    // ---- Attempts counter -------------------------------------------------

    /**
     * Increments the attempts counter and refreshes its TTL. The two ops are not
     * atomic — a crash between them leaves an un-TTL'd counter that gets wiped
     * the next time {@link #createSession} runs for this (project, user).
     */
    long incrementAttempts(UUID projectId, String workspaceId, String userName, Duration ttl) {
        RAtomicLong attempts = redisClient.getAtomicLong(attemptsKey(projectId, workspaceId, userName));
        long count = attempts.incrementAndGet();
        attempts.expire(ttl);
        return count;
    }
}
