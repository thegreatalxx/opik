package com.comet.opik.domain;

import com.comet.opik.api.Optimization;
import com.comet.opik.domain.attachment.PreSignerService;
import com.comet.opik.domain.optimization.OptimizationLogSyncService;
import com.comet.opik.infrastructure.OpikConfiguration;
import com.comet.opik.infrastructure.queues.QueueProducer;
import com.google.common.eventbus.EventBus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.redisson.api.RedissonReactiveClient;
import reactor.test.StepVerifier;

import java.util.List;
import java.util.UUID;

import static com.comet.opik.infrastructure.auth.RequestContext.USER_NAME;
import static com.comet.opik.infrastructure.auth.RequestContext.WORKSPACE_ID;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anySet;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class OptimizationServiceTest {

    private static final String TEST_WORKSPACE_ID = "test-workspace";
    private static final String TEST_USER_NAME = "test-user";

    private OptimizationServiceImpl optimizationService;

    @Mock
    private OptimizationDAO optimizationDAO;
    @Mock
    private DatasetService datasetService;
    @Mock
    private IdGenerator idGenerator;
    @Mock
    private NameGenerator nameGenerator;
    @Mock
    private EventBus eventBus;
    @Mock
    private PreSignerService preSignerService;
    @Mock
    private QueueProducer queueProducer;
    @Mock
    private WorkspaceNameService workspaceNameService;
    @Mock
    private OpikConfiguration config;
    @Mock
    private OptimizationLogSyncService logSyncService;
    @Mock
    private RedissonReactiveClient redisClient;

    @BeforeEach
    void setUp() {
        optimizationService = new OptimizationServiceImpl(
                optimizationDAO,
                datasetService,
                idGenerator,
                nameGenerator,
                eventBus,
                preSignerService,
                queueProducer,
                workspaceNameService,
                config,
                logSyncService,
                redisClient);
    }

    @Nested
    @DisplayName("resolveDatasetNameFilter via find()")
    class ResolveDatasetNameFilter {

        @Test
        @DisplayName("when datasetName is blank, returns results without name resolution")
        void findWhenDatasetNameIsBlankSkipsNameResolution() {
            var criteria = OptimizationSearchCriteria.builder()
                    .entityType(EntityType.TRACE)
                    .build();

            var page = new Optimization.OptimizationPage(1, 0, 0, List.of(), List.of());

            when(optimizationDAO.find(anyInt(), anyInt(), any()))
                    .thenReturn(reactor.core.publisher.Mono.just(page));
            when(datasetService.findByIds(anySet(), anyString()))
                    .thenReturn(List.of());

            StepVerifier.create(
                    optimizationService.find(1, 10, criteria)
                            .contextWrite(ctx -> ctx
                                    .put(WORKSPACE_ID, TEST_WORKSPACE_ID)
                                    .put(USER_NAME, TEST_USER_NAME)))
                    .assertNext(result -> assertThat(result.content()).isEmpty())
                    .verifyComplete();

            verify(datasetService, never()).findIdsByPartialName(anyString(), anyString());
        }

        @Test
        @DisplayName("when datasetName resolves to no datasets, returns empty page")
        void findWhenDatasetNameMatchesNothingReturnsEmpty() {
            var criteria = OptimizationSearchCriteria.builder()
                    .datasetName("nonexistent")
                    .entityType(EntityType.TRACE)
                    .build();

            when(datasetService.findIdsByPartialName(TEST_WORKSPACE_ID, "nonexistent"))
                    .thenReturn(List.of());

            StepVerifier.create(
                    optimizationService.find(1, 10, criteria)
                            .contextWrite(ctx -> ctx
                                    .put(WORKSPACE_ID, TEST_WORKSPACE_ID)
                                    .put(USER_NAME, TEST_USER_NAME)))
                    .assertNext(result -> {
                        assertThat(result.content()).isEmpty();
                        assertThat(result.total()).isZero();
                    })
                    .verifyComplete();

            verify(optimizationDAO, never()).find(anyInt(), anyInt(), any());
        }

        @Test
        @DisplayName("when datasetName resolves to datasets, passes resolved IDs to DAO")
        void findWhenDatasetNameMatchesPassesResolvedIds() {
            var resolvedId = UUID.randomUUID();
            var criteria = OptimizationSearchCriteria.builder()
                    .datasetName("my-dataset")
                    .entityType(EntityType.TRACE)
                    .build();

            var page = new Optimization.OptimizationPage(1, 0, 0, List.of(), List.of());

            when(datasetService.findIdsByPartialName(TEST_WORKSPACE_ID, "my-dataset"))
                    .thenReturn(List.of(resolvedId));
            when(optimizationDAO.find(anyInt(), anyInt(), any()))
                    .thenReturn(reactor.core.publisher.Mono.just(page));
            when(datasetService.findByIds(anySet(), anyString()))
                    .thenReturn(List.of());

            StepVerifier.create(
                    optimizationService.find(1, 10, criteria)
                            .contextWrite(ctx -> ctx
                                    .put(WORKSPACE_ID, TEST_WORKSPACE_ID)
                                    .put(USER_NAME, TEST_USER_NAME)))
                    .assertNext(result -> assertThat(result.content()).isEmpty())
                    .verifyComplete();

            verify(optimizationDAO).find(eq(1), eq(10), any(OptimizationSearchCriteria.class));
        }

        @Test
        @DisplayName("when both datasetId and datasetName are set, intersects resolved IDs with explicit ID")
        void findWhenBothDatasetIdAndNameIntersectsIds() {
            var explicitId = UUID.randomUUID();
            var resolvedId1 = explicitId;
            var resolvedId2 = UUID.randomUUID();

            var criteria = OptimizationSearchCriteria.builder()
                    .datasetIds(List.of(explicitId))
                    .datasetName("my-dataset")
                    .entityType(EntityType.TRACE)
                    .build();

            var page = new Optimization.OptimizationPage(1, 0, 0, List.of(), List.of());

            when(datasetService.findIdsByPartialName(TEST_WORKSPACE_ID, "my-dataset"))
                    .thenReturn(List.of(resolvedId1, resolvedId2));
            when(optimizationDAO.find(anyInt(), anyInt(), any()))
                    .thenAnswer(invocation -> {
                        OptimizationSearchCriteria resolved = invocation.getArgument(2);
                        // Only the intersecting ID should remain
                        assertThat(resolved.datasetIds()).containsExactly(explicitId);
                        return reactor.core.publisher.Mono.just(page);
                    });
            when(datasetService.findByIds(anySet(), anyString()))
                    .thenReturn(List.of());

            StepVerifier.create(
                    optimizationService.find(1, 10, criteria)
                            .contextWrite(ctx -> ctx
                                    .put(WORKSPACE_ID, TEST_WORKSPACE_ID)
                                    .put(USER_NAME, TEST_USER_NAME)))
                    .assertNext(result -> assertThat(result.content()).isEmpty())
                    .verifyComplete();
        }

        @Test
        @DisplayName("when datasetId and datasetName have no overlap, returns empty page")
        void findWhenDatasetIdAndNameHaveNoOverlapReturnsEmpty() {
            var explicitId = UUID.randomUUID();
            var resolvedId = UUID.randomUUID();

            var criteria = OptimizationSearchCriteria.builder()
                    .datasetIds(List.of(explicitId))
                    .datasetName("other-dataset")
                    .entityType(EntityType.TRACE)
                    .build();

            when(datasetService.findIdsByPartialName(TEST_WORKSPACE_ID, "other-dataset"))
                    .thenReturn(List.of(resolvedId));

            StepVerifier.create(
                    optimizationService.find(1, 10, criteria)
                            .contextWrite(ctx -> ctx
                                    .put(WORKSPACE_ID, TEST_WORKSPACE_ID)
                                    .put(USER_NAME, TEST_USER_NAME)))
                    .assertNext(result -> {
                        assertThat(result.content()).isEmpty();
                        assertThat(result.total()).isZero();
                    })
                    .verifyComplete();

            verify(optimizationDAO, never()).find(anyInt(), anyInt(), any());
        }
    }
}
