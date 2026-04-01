package com.comet.opik.api.resources.v1.priv;

import com.comet.opik.api.Dataset;
import com.comet.opik.api.DatasetIdentifier;
import com.comet.opik.api.DatasetItemBatch;
import com.comet.opik.api.resources.utils.AuthTestUtils;
import com.comet.opik.api.resources.utils.ClientSupportUtils;
import com.comet.opik.api.resources.utils.TestContainersSetup;
import com.comet.opik.api.resources.utils.TestUtils;
import com.comet.opik.api.resources.utils.resources.DatasetResourceClient;
import com.comet.opik.api.resources.utils.resources.ProjectResourceClient;
import com.comet.opik.extensions.DropwizardAppExtensionProvider;
import com.comet.opik.extensions.RegisterApp;
import com.comet.opik.podam.PodamFactoryUtils;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.api.extension.ExtendWith;
import ru.vyarus.dropwizard.guice.test.ClientSupport;
import ru.vyarus.dropwizard.guice.test.jupiter.ext.TestDropwizardAppExtension;
import uk.co.jemos.podam.api.PodamFactory;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@TestInstance(TestInstance.Lifecycle.PER_CLASS)
@DisplayName("Project-scoped dataset operations")
@ExtendWith(DropwizardAppExtensionProvider.class)
class DatasetsResourceProjectScopedTest {

    private static final String[] DATASET_IGNORED_FIELDS = {"id", "createdAt", "lastUpdatedAt", "createdBy",
            "lastUpdatedBy", "projectName", "experimentCount", "mostRecentExperimentAt", "lastCreatedExperimentAt",
            "datasetItemsCount", "lastCreatedOptimizationAt", "mostRecentOptimizationAt", "optimizationCount",
            "status", "latestVersion"};

    private final TestContainersSetup setup = new TestContainersSetup();

    @RegisterApp
    private final TestDropwizardAppExtension APP = setup.APP;

    private final PodamFactory factory = PodamFactoryUtils.newPodamFactory();

    private String baseURI;
    private DatasetResourceClient datasetResourceClient;
    private ProjectResourceClient projectResourceClient;

    @BeforeAll
    void setUpAll(ClientSupport client) {
        this.baseURI = TestUtils.getBaseUrl(client);
        this.datasetResourceClient = new DatasetResourceClient(client, baseURI);
        this.projectResourceClient = new ProjectResourceClient(client, baseURI, factory);

        ClientSupportUtils.config(client);
    }

    @AfterAll
    void tearDownAll() {
        setup.wireMock.server().stop();
    }

    private void mockTargetWorkspace(String apiKey, String workspaceName, String workspaceId) {
        AuthTestUtils.mockTargetWorkspace(setup.wireMock.server(), apiKey, workspaceName, workspaceId,
                UUID.randomUUID().toString());
    }

    private Dataset buildDataset() {
        return DatasetResourceClient.buildDataset(factory);
    }

    private void assertDataset(Dataset actual, Dataset expected) {
        assertThat(actual)
                .usingRecursiveComparison()
                .ignoringFields(DATASET_IGNORED_FIELDS)
                .isEqualTo(expected);
    }

    @Test
    @DisplayName("Create dataset with project_id persists and returns project_id")
    void createDatasetWithProjectId() {
        String apiKey = UUID.randomUUID().toString();
        String workspaceName = UUID.randomUUID().toString();
        String workspaceId = UUID.randomUUID().toString();
        mockTargetWorkspace(apiKey, workspaceName, workspaceId);

        var projectId = projectResourceClient.createProject("project-" + UUID.randomUUID(), apiKey, workspaceName);

        var dataset = buildDataset().toBuilder()
                .id(null)
                .projectId(projectId)
                .build();

        var id = datasetResourceClient.createDataset(dataset, apiKey, workspaceName);
        var fetchedDataset = datasetResourceClient.getDatasetById(id, apiKey, workspaceName);

        assertDataset(fetchedDataset, dataset);
    }

    @Test
    @DisplayName("Create dataset with non-existing project_id returns not found")
    void createDatasetWithNonExistingProjectId() {
        String apiKey = UUID.randomUUID().toString();
        String workspaceName = UUID.randomUUID().toString();
        String workspaceId = UUID.randomUUID().toString();
        mockTargetWorkspace(apiKey, workspaceName, workspaceId);

        var dataset = buildDataset().toBuilder()
                .id(null)
                .projectId(factory.manufacturePojo(UUID.class))
                .build();

        try (var response = datasetResourceClient.callCreateDataset(dataset, apiKey, workspaceName)) {
            assertThat(response.getStatus()).isEqualTo(404);
        }
    }

    @Test
    @DisplayName("Create dataset with project_name of existing project resolves project_id")
    void createDatasetWithExistingProjectName() {
        String apiKey = UUID.randomUUID().toString();
        String workspaceName = UUID.randomUUID().toString();
        String workspaceId = UUID.randomUUID().toString();
        mockTargetWorkspace(apiKey, workspaceName, workspaceId);

        String projectName = "project-" + UUID.randomUUID();
        var projectId = projectResourceClient.createProject(projectName, apiKey, workspaceName);

        var dataset = buildDataset().toBuilder()
                .id(null)
                .projectName(projectName)
                .build();

        var id = datasetResourceClient.createDataset(dataset, apiKey, workspaceName);
        var fetchedDataset = datasetResourceClient.getDatasetById(id, apiKey, workspaceName);

        var expectedDataset = dataset.toBuilder()
                .projectId(projectId)
                .build();
        assertDataset(fetchedDataset, expectedDataset);
    }

    @Test
    @DisplayName("Create dataset with project_name of non-existing project creates project and resolves project_id")
    void createDatasetWithNonExistingProjectName() {
        String apiKey = UUID.randomUUID().toString();
        String workspaceName = UUID.randomUUID().toString();
        String workspaceId = UUID.randomUUID().toString();
        mockTargetWorkspace(apiKey, workspaceName, workspaceId);

        String projectName = "new-project-" + UUID.randomUUID();

        var dataset = buildDataset().toBuilder()
                .id(null)
                .projectName(projectName)
                .build();

        var id = datasetResourceClient.createDataset(dataset, apiKey, workspaceName);
        var fetchedDataset = datasetResourceClient.getDatasetById(id, apiKey, workspaceName);

        // Verify the project was created and the projectId was resolved
        assertThat(fetchedDataset.projectId()).isNotNull();

        var expectedDataset = dataset.toBuilder()
                .projectId(fetchedDataset.projectId())
                .build();
        assertDataset(fetchedDataset, expectedDataset);
    }

    @Test
    @DisplayName("Find datasets filtered by project_id returns only project datasets")
    void findDatasetsByProjectId() {
        String apiKey = UUID.randomUUID().toString();
        String workspaceName = UUID.randomUUID().toString();
        String workspaceId = UUID.randomUUID().toString();
        mockTargetWorkspace(apiKey, workspaceName, workspaceId);

        var projectId = projectResourceClient.createProject("project-" + UUID.randomUUID(), apiKey, workspaceName);
        var otherProjectId = projectResourceClient.createProject("project-" + UUID.randomUUID(), apiKey,
                workspaceName);

        var projectDataset = buildDataset().toBuilder()
                .id(null)
                .projectId(projectId)
                .build();
        datasetResourceClient.createDataset(projectDataset, apiKey, workspaceName);

        var otherProjectDataset = buildDataset().toBuilder()
                .id(null)
                .projectId(otherProjectId)
                .build();
        datasetResourceClient.createDataset(otherProjectDataset, apiKey, workspaceName);

        var workspaceDataset = buildDataset().toBuilder()
                .id(null)
                .projectId(null)
                .build();
        datasetResourceClient.createDataset(workspaceDataset, apiKey, workspaceName);

        var page = datasetResourceClient.getDatasetsByProjectId(projectId, workspaceName, apiKey);

        assertThat(page.content()).hasSize(1);
        assertDataset(page.content().getFirst(), projectDataset);
    }

    @Test
    @DisplayName("Create dataset with same name in different projects succeeds")
    void createDataset__sameNameDifferentProjects__succeeds() {
        String apiKey = UUID.randomUUID().toString();
        String workspaceName = UUID.randomUUID().toString();
        String workspaceId = UUID.randomUUID().toString();
        mockTargetWorkspace(apiKey, workspaceName, workspaceId);

        var projectIdA = projectResourceClient.createProject("project-" + UUID.randomUUID(), apiKey, workspaceName);
        var projectIdB = projectResourceClient.createProject("project-" + UUID.randomUUID(), apiKey, workspaceName);

        String sharedName = "shared-dataset-" + UUID.randomUUID();

        var datasetA = buildDataset().toBuilder()
                .id(null)
                .name(sharedName)
                .projectId(projectIdA)
                .build();

        var datasetB = buildDataset().toBuilder()
                .id(null)
                .name(sharedName)
                .projectId(projectIdB)
                .build();

        var idA = datasetResourceClient.createDataset(datasetA, apiKey, workspaceName);
        var idB = datasetResourceClient.createDataset(datasetB, apiKey, workspaceName);

        assertThat(idA).isNotEqualTo(idB);

        var fetchedA = datasetResourceClient.getDatasetById(idA, apiKey, workspaceName);
        var fetchedB = datasetResourceClient.getDatasetById(idB, apiKey, workspaceName);
        assertThat(fetchedA.name()).isEqualTo(sharedName);
        assertThat(fetchedB.name()).isEqualTo(sharedName);
        assertThat(fetchedA.projectId()).isEqualTo(projectIdA);
        assertThat(fetchedB.projectId()).isEqualTo(projectIdB);
    }

    @Test
    @DisplayName("Create dataset with same name in same project returns 409")
    void createDataset__sameNameSameProject__returns409() {
        String apiKey = UUID.randomUUID().toString();
        String workspaceName = UUID.randomUUID().toString();
        String workspaceId = UUID.randomUUID().toString();
        mockTargetWorkspace(apiKey, workspaceName, workspaceId);

        var projectId = projectResourceClient.createProject("project-" + UUID.randomUUID(), apiKey, workspaceName);

        String sharedName = "dup-dataset-" + UUID.randomUUID();

        var dataset1 = buildDataset().toBuilder()
                .id(null)
                .name(sharedName)
                .projectId(projectId)
                .build();

        datasetResourceClient.createDataset(dataset1, apiKey, workspaceName);

        var dataset2 = buildDataset().toBuilder()
                .id(null)
                .name(sharedName)
                .projectId(projectId)
                .build();

        try (var response = datasetResourceClient.callCreateDataset(dataset2, apiKey, workspaceName)) {
            assertThat(response.getStatus()).isEqualTo(409);
        }
    }

    @Test
    @DisplayName("Create dataset with same name as workspace-level and project-scoped succeeds")
    void createDataset__sameNameWorkspaceLevelAndProjectScoped__succeeds() {
        String apiKey = UUID.randomUUID().toString();
        String workspaceName = UUID.randomUUID().toString();
        String workspaceId = UUID.randomUUID().toString();
        mockTargetWorkspace(apiKey, workspaceName, workspaceId);

        var projectId = projectResourceClient.createProject("project-" + UUID.randomUUID(), apiKey, workspaceName);

        String sharedName = "mixed-dataset-" + UUID.randomUUID();

        var workspaceDataset = buildDataset().toBuilder()
                .id(null)
                .name(sharedName)
                .projectId(null)
                .build();

        var projectDataset = buildDataset().toBuilder()
                .id(null)
                .name(sharedName)
                .projectId(projectId)
                .build();

        var wsId = datasetResourceClient.createDataset(workspaceDataset, apiKey, workspaceName);
        var projId = datasetResourceClient.createDataset(projectDataset, apiKey, workspaceName);

        assertThat(wsId).isNotEqualTo(projId);
    }

    @Test
    @DisplayName("Create two workspace-level datasets with same name returns 409")
    void createDataset__sameNameBothWorkspaceLevel__returns409() {
        String apiKey = UUID.randomUUID().toString();
        String workspaceName = UUID.randomUUID().toString();
        String workspaceId = UUID.randomUUID().toString();
        mockTargetWorkspace(apiKey, workspaceName, workspaceId);

        String sharedName = "ws-dup-dataset-" + UUID.randomUUID();

        var dataset1 = buildDataset().toBuilder()
                .id(null)
                .name(sharedName)
                .projectId(null)
                .build();

        datasetResourceClient.createDataset(dataset1, apiKey, workspaceName);

        var dataset2 = buildDataset().toBuilder()
                .id(null)
                .name(sharedName)
                .projectId(null)
                .build();

        try (var response = datasetResourceClient.callCreateDataset(dataset2, apiKey, workspaceName)) {
            assertThat(response.getStatus()).isEqualTo(409);
        }
    }

    @Test
    @DisplayName("Put dataset items with project_name implicitly creates dataset scoped to that project")
    void putDatasetItemsWithProjectNameScopesDatasetToProject() {
        String apiKey = UUID.randomUUID().toString();
        String workspaceName = UUID.randomUUID().toString();
        String workspaceId = UUID.randomUUID().toString();
        mockTargetWorkspace(apiKey, workspaceName, workspaceId);

        String projectName = "project-" + UUID.randomUUID();
        var projectId = projectResourceClient.createProject(projectName, apiKey, workspaceName);

        String datasetName = "dataset-" + UUID.randomUUID();

        var item = DatasetResourceClient.buildDatasetItem(factory).toBuilder()
                .id(null)
                .build();

        var batch = DatasetItemBatch.builder()
                .datasetName(datasetName)
                .projectName(projectName)
                .items(List.of(item))
                .build();

        datasetResourceClient.createDatasetItems(batch, workspaceName, apiKey);

        var dataset = datasetResourceClient.getDatasetByIdentifier(
                DatasetIdentifier.builder().datasetName(datasetName).build(), apiKey, workspaceName);

        assertThat(dataset.projectId()).isEqualTo(projectId);
    }
}
