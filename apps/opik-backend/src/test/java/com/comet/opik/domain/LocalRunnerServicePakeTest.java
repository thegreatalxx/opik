package com.comet.opik.domain;

import com.comet.opik.api.runner.DaemonPairRegisterRequest;
import com.comet.opik.api.runner.DaemonPairRegisterResponse;
import com.comet.opik.api.runner.PakeMessageRequest;
import com.comet.opik.infrastructure.LocalRunnerConfig;
import com.comet.opik.infrastructure.redis.StringRedisClient;
import jakarta.ws.rs.ClientErrorException;
import jakarta.ws.rs.NotFoundException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.redisson.api.RAtomicLong;
import org.redisson.api.RBucket;
import org.redisson.api.RList;
import org.redisson.api.RMap;
import org.redisson.api.RedissonReactiveClient;

import java.time.Duration;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class LocalRunnerServicePakeTest {

    @Mock
    private StringRedisClient redisClient;
    @Mock
    private RedissonReactiveClient reactiveRedisClient;
    @Mock
    private LocalRunnerConfig runnerConfig;
    @Mock
    private IdGenerator idGenerator;
    @Mock
    private ProjectService projectService;

    private LocalRunnerServiceImpl service;

    private static final String WORKSPACE_ID = "ws-1";
    private static final String USER_NAME = "testuser";
    private static final UUID PROJECT_ID = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        service = new LocalRunnerServiceImpl(redisClient, reactiveRedisClient, runnerConfig, idGenerator,
                projectService);
    }

    private String sessionKey() {
        return "opik:runners:pake-session:" + WORKSPACE_ID + ":" + USER_NAME + ":" + PROJECT_ID;
    }

    private String messagesKey() {
        return "opik:runners:pake-messages:" + WORKSPACE_ID + ":" + USER_NAME + ":" + PROJECT_ID;
    }

    private String attemptsKey() {
        return "opik:runners:pake-attempts:" + WORKSPACE_ID + ":" + USER_NAME + ":" + PROJECT_ID;
    }

    @Nested
    @DisplayName("registerDaemonPair")
    class RegisterDaemonPair {

        @Test
        @DisplayName("cleans stale session and registers new one")
        @SuppressWarnings("unchecked")
        void registersSession() {
            UUID runnerId = UUID.randomUUID();
            when(idGenerator.generateId()).thenReturn(runnerId);

            RBucket<String> staleBucket = mock(RBucket.class);
            RBucket<String> sessionBucket = mock(RBucket.class);
            when(redisClient.getBucket(sessionKey())).thenReturn(staleBucket, sessionBucket);

            RList<String> staleMessages = mock(RList.class);
            doReturn(staleMessages).when(redisClient).getList(messagesKey());

            RAtomicLong staleAttempts = mock(RAtomicLong.class);
            when(redisClient.getAtomicLong(attemptsKey())).thenReturn(staleAttempts);

            RMap<String, String> runnerMap = mock(RMap.class);
            doReturn(runnerMap).when(redisClient).getMap("opik:runners:runner:" + runnerId);

            DaemonPairRegisterRequest request = DaemonPairRegisterRequest.builder()
                    .projectId(PROJECT_ID)
                    .runnerName("test-runner")
                    .build();

            DaemonPairRegisterResponse response = service.registerDaemonPair(WORKSPACE_ID, USER_NAME, request);

            assertThat(response.runnerId()).isEqualTo(runnerId);
            assertThat(response.expiresInSeconds()).isEqualTo(300);
            verify(staleBucket).delete();
            verify(staleMessages).delete();
            verify(staleAttempts).delete();
            verify(sessionBucket).set(anyString(), any());
        }
    }

    @Nested
    @DisplayName("postPakeMessage")
    class PostPakeMessage {

        @Test
        @DisplayName("rejects when no session exists")
        @SuppressWarnings("unchecked")
        void rejectsNoSession() {
            RBucket<String> bucket = mock(RBucket.class);
            when(redisClient.getBucket(sessionKey())).thenReturn(bucket);
            when(bucket.isExists()).thenReturn(false);

            PakeMessageRequest request = PakeMessageRequest.builder()
                    .role("daemon").step(0).payload("data").build();

            assertThatThrownBy(() -> service.postPakeMessage(WORKSPACE_ID, USER_NAME, PROJECT_ID, request))
                    .isInstanceOf(NotFoundException.class);
        }

        @Test
        @DisplayName("burns session after 5 step-0 attempts")
        @SuppressWarnings("unchecked")
        void burnsAfterFiveAttempts() {
            RBucket<String> bucket = mock(RBucket.class);
            when(redisClient.getBucket(sessionKey())).thenReturn(bucket);
            when(bucket.isExists()).thenReturn(true);

            RAtomicLong attempts = mock(RAtomicLong.class);
            when(redisClient.getAtomicLong(attemptsKey())).thenReturn(attempts);
            when(attempts.incrementAndGet()).thenReturn(6L);

            RList<String> messages = mock(RList.class);
            doReturn(messages).when(redisClient).getList(messagesKey());

            PakeMessageRequest request = PakeMessageRequest.builder()
                    .role("browser").step(0).payload("attack").build();

            assertThatThrownBy(() -> service.postPakeMessage(WORKSPACE_ID, USER_NAME, PROJECT_ID, request))
                    .isInstanceOf(ClientErrorException.class);

            verify(bucket).delete();
            verify(messages).delete();
            verify(attempts).delete();
        }

        @Test
        @DisplayName("appends message to list on valid request")
        @SuppressWarnings("unchecked")
        void appendsMessage() {
            RBucket<String> bucket = mock(RBucket.class);
            when(redisClient.getBucket(sessionKey())).thenReturn(bucket);
            when(bucket.isExists()).thenReturn(true);

            RAtomicLong attempts = mock(RAtomicLong.class);
            when(redisClient.getAtomicLong(attemptsKey())).thenReturn(attempts);
            when(attempts.incrementAndGet()).thenReturn(1L);

            RList<String> messages = mock(RList.class);
            doReturn(messages).when(redisClient).getList(messagesKey());

            PakeMessageRequest request = PakeMessageRequest.builder()
                    .role("daemon").step(0).payload("spake2-msg").build();

            service.postPakeMessage(WORKSPACE_ID, USER_NAME, PROJECT_ID, request);

            verify(messages).add(anyString());
            verify(messages).expire(any(Duration.class));
        }

        @Test
        @DisplayName("does not count step-1 messages against rate limit")
        @SuppressWarnings("unchecked")
        void stepOneNotRateLimited() {
            RBucket<String> bucket = mock(RBucket.class);
            when(redisClient.getBucket(sessionKey())).thenReturn(bucket);
            when(bucket.isExists()).thenReturn(true);

            RList<String> messages = mock(RList.class);
            doReturn(messages).when(redisClient).getList(messagesKey());

            PakeMessageRequest request = PakeMessageRequest.builder()
                    .role("daemon").step(1).payload("confirm-A").build();

            service.postPakeMessage(WORKSPACE_ID, USER_NAME, PROJECT_ID, request);

            verify(messages).add(anyString());
        }
    }
}
