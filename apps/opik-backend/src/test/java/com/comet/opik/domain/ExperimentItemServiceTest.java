package com.comet.opik.domain;

import com.comet.opik.api.ExecutionPolicy;
import com.comet.opik.api.ExperimentItem;
import com.comet.opik.infrastructure.FeatureFlags;
import com.comet.opik.podam.PodamFactoryUtils;
import com.google.common.eventbus.EventBus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;
import uk.co.jemos.podam.api.PodamFactory;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static com.comet.opik.infrastructure.auth.RequestContext.USER_NAME;
import static com.comet.opik.infrastructure.auth.RequestContext.WORKSPACE_ID;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anySet;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ExperimentItemServiceTest {

    private static final String TEST_WORKSPACE_ID = "test-workspace";
    private static final String TEST_USER_NAME = "test-user";

    private final PodamFactory podamFactory = PodamFactoryUtils.newPodamFactory();

    private ExperimentItemService experimentItemService;

    @Mock
    private ExperimentItemDAO experimentItemDAO;

    @Mock
    private ExperimentService experimentService;

    @Mock
    private DatasetItemDAO datasetItemDAO;

    @Mock
    private DatasetItemVersionDAO datasetItemVersionDAO;

    @Mock
    private TraceDAO traceDAO;

    @Mock
    private ProjectService projectService;

    @Mock
    private FeatureFlags featureFlags;

    @Mock
    private EventBus eventBus;

    @BeforeEach
    void setUp() {
        experimentItemService = new ExperimentItemService(
                experimentItemDAO,
                experimentService,
                datasetItemDAO,
                datasetItemVersionDAO,
                traceDAO,
                projectService,
                featureFlags,
                eventBus);
    }

    @Nested
    @DisplayName("Execution Policy Resolution")
    class ExecutionPolicyResolution {

        @Test
        @DisplayName("when experiments have no datasetVersionId (on-prem without versioning), " +
                "datasetItemVersionDAO is not queried and items get default policy")
        void populateExecutionPolicyWhenNoDatasetVersionIdDoesNotQueryVersionDAO() {
            var experimentId = podamFactory.manufacturePojo(UUID.class);
            var datasetItemId = podamFactory.manufacturePojo(UUID.class);
            var traceId = podamFactory.manufacturePojo(UUID.class);
            var itemId = podamFactory.manufacturePojo(UUID.class);

            var item = ExperimentItem.builder()
                    .id(itemId)
                    .experimentId(experimentId)
                    .datasetItemId(datasetItemId)
                    .traceId(traceId)
                    .build();

            // Experiment has no datasetVersionId (on-prem without versioning)
            var policyInfo = new ExperimentDAO.ExperimentPolicyInfo(
                    experimentId,
                    null,
                    null);

            // Validation mocks
            when(experimentService.validateExperimentWorkspace(any(), anySet()))
                    .thenReturn(Mono.just(true));
            when(datasetItemDAO.getDatasetItemWorkspace(anySet()))
                    .thenReturn(Mono.just(
                            List.of(new WorkspaceAndResourceId(TEST_WORKSPACE_ID, datasetItemId))));

            // Execution policy resolution
            when(experimentService.getExecutionPolicies(Set.of(experimentId)))
                    .thenReturn(Mono.just(Map.of(experimentId, policyInfo)));

            // Trace lookup (no project resolution needed)
            when(traceDAO.getProjectIdsByTraceIds(any()))
                    .thenReturn(Mono.just(Map.of()));

            // Capture inserted items to verify policy
            when(experimentItemDAO.insert(any()))
                    .thenAnswer(invocation -> {
                        @SuppressWarnings("unchecked")
                        Set<ExperimentItem> insertedItems = invocation.getArgument(0);

                        assertThat(insertedItems).hasSize(1);
                        var insertedItem = insertedItems.iterator().next();
                        assertThat(insertedItem.executionPolicy()).isEqualTo(ExecutionPolicy.DEFAULT);

                        return Mono.empty();
                    });

            StepVerifier.create(
                    experimentItemService.create(Set.of(item))
                            .contextWrite(ctx -> ctx
                                    .put(WORKSPACE_ID, TEST_WORKSPACE_ID)
                                    .put(USER_NAME, TEST_USER_NAME)))
                    .verifyComplete();

            verifyNoInteractions(datasetItemVersionDAO);
            verify(experimentItemDAO).insert(any());
        }
    }
}
