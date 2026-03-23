package com.comet.opik.api.resources.v1.priv;

import com.comet.opik.api.Trace;
import com.comet.opik.api.TraceSource;
import com.comet.opik.api.filter.Operator;
import com.comet.opik.api.filter.TraceField;
import com.comet.opik.api.filter.TraceFilter;
import com.comet.opik.api.resources.utils.AuthTestUtils;
import com.comet.opik.api.resources.utils.ClickHouseContainerUtils;
import com.comet.opik.api.resources.utils.ClientSupportUtils;
import com.comet.opik.api.resources.utils.MigrationUtils;
import com.comet.opik.api.resources.utils.MySQLContainerUtils;
import com.comet.opik.api.resources.utils.RedisContainerUtils;
import com.comet.opik.api.resources.utils.TestDropwizardAppExtensionUtils;
import com.comet.opik.api.resources.utils.TestUtils;
import com.comet.opik.api.resources.utils.WireMockUtils;
import com.comet.opik.api.resources.utils.resources.TraceResourceClient;
import com.comet.opik.api.resources.utils.traces.TraceAssertions;
import com.comet.opik.extensions.DropwizardAppExtensionProvider;
import com.comet.opik.extensions.RegisterApp;
import com.comet.opik.podam.PodamFactoryUtils;
import com.redis.testcontainers.RedisContainer;
import jakarta.ws.rs.client.Entity;
import jakarta.ws.rs.core.HttpHeaders;
import jakarta.ws.rs.core.MediaType;
import org.apache.http.HttpStatus;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.testcontainers.clickhouse.ClickHouseContainer;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.lifecycle.Startables;
import org.testcontainers.mysql.MySQLContainer;
import ru.vyarus.dropwizard.guice.test.ClientSupport;
import ru.vyarus.dropwizard.guice.test.jupiter.ext.TestDropwizardAppExtension;
import uk.co.jemos.podam.api.PodamFactory;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static com.comet.opik.api.resources.utils.ClickHouseContainerUtils.DATABASE_NAME;
import static com.comet.opik.domain.ProjectService.DEFAULT_PROJECT;
import static com.comet.opik.infrastructure.auth.RequestContext.WORKSPACE_HEADER;
import static org.assertj.core.api.Assertions.assertThat;

@DisplayName("Traces Resource Source Tests")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
@ExtendWith(DropwizardAppExtensionProvider.class)
class TracesResourceSourceTest {

    private static final String API_KEY = UUID.randomUUID().toString();
    private static final String USER = UUID.randomUUID().toString();
    private static final String WORKSPACE_ID = UUID.randomUUID().toString();
    private static final String TEST_WORKSPACE = UUID.randomUUID().toString();

    private final RedisContainer redisContainer = RedisContainerUtils.newRedisContainer();
    private final MySQLContainer mysqlContainer = MySQLContainerUtils.newMySQLContainer();
    private final GenericContainer<?> zookeeperContainer = ClickHouseContainerUtils.newZookeeperContainer();
    private final ClickHouseContainer clickHouseContainer = ClickHouseContainerUtils
            .newClickHouseContainer(zookeeperContainer);

    private final WireMockUtils.WireMockRuntime wireMock;

    @RegisterApp
    private final TestDropwizardAppExtension app;

    {
        Startables.deepStart(redisContainer, mysqlContainer, clickHouseContainer, zookeeperContainer).join();

        wireMock = WireMockUtils.startWireMock();

        var databaseAnalyticsFactory = ClickHouseContainerUtils.newDatabaseAnalyticsFactory(
                clickHouseContainer, DATABASE_NAME);

        MigrationUtils.runMysqlDbMigration(mysqlContainer);
        MigrationUtils.runClickhouseDbMigration(clickHouseContainer);

        app = TestDropwizardAppExtensionUtils.newTestDropwizardAppExtension(
                TestDropwizardAppExtensionUtils.AppContextConfig.builder()
                        .jdbcUrl(mysqlContainer.getJdbcUrl())
                        .databaseAnalyticsFactory(databaseAnalyticsFactory)
                        .redisUrl(redisContainer.getRedisURI())
                        .runtimeInfo(wireMock.runtimeInfo())
                        .build());
    }

    private final PodamFactory factory = PodamFactoryUtils.newPodamFactory();

    private String baseURI;
    private ClientSupport client;
    private TraceResourceClient traceResourceClient;

    @BeforeAll
    void setUpAll(ClientSupport client) {
        this.baseURI = TestUtils.getBaseUrl(client);
        this.client = client;

        ClientSupportUtils.config(client);

        AuthTestUtils.mockTargetWorkspace(wireMock.server(), API_KEY, TEST_WORKSPACE, WORKSPACE_ID, USER);

        this.traceResourceClient = new TraceResourceClient(this.client, baseURI);
    }

    @Nested
    @DisplayName("Source field on trace creation")
    class CreateTraceWithSource {

        @ParameterizedTest
        @EnumSource(TraceSource.class)
        @DisplayName("Create trace with each valid source and verify it is stored")
        void createTraceWithSource(TraceSource source) {
            var trace = factory.manufacturePojo(Trace.class).toBuilder()
                    .projectName(DEFAULT_PROJECT)
                    .source(source)
                    .build();

            var id = traceResourceClient.createTrace(trace, API_KEY, TEST_WORKSPACE);

            var actual = traceResourceClient.getById(id, TEST_WORKSPACE, API_KEY);
            assertThat(actual.source()).isEqualTo(source);
        }

        @Test
        @DisplayName("Create trace without source defaults to null (unknown in storage)")
        void createTraceWithoutSourceDefaultsToNull() {
            var trace = factory.manufacturePojo(Trace.class).toBuilder()
                    .projectName(DEFAULT_PROJECT)
                    .source(null)
                    .build();

            var id = traceResourceClient.createTrace(trace, API_KEY, TEST_WORKSPACE);

            var actual = traceResourceClient.getById(id, TEST_WORKSPACE, API_KEY);
            assertThat(actual.source()).isNull();
        }

        @Test
        @DisplayName("Create trace with invalid source returns 422")
        void createTraceWithInvalidSourceReturns422() {
            var body = """
                    {
                        "project_name": "%s",
                        "name": "test-trace",
                        "start_time": "2024-01-01T00:00:00Z",
                        "source": "invalid_source"
                    }
                    """.formatted(DEFAULT_PROJECT);

            try (var response = client.target("%s/v1/private/traces".formatted(baseURI))
                    .request()
                    .accept(MediaType.APPLICATION_JSON_TYPE)
                    .header(HttpHeaders.AUTHORIZATION, API_KEY)
                    .header(WORKSPACE_HEADER, TEST_WORKSPACE)
                    .post(Entity.json(body))) {

                assertThat(response.getStatus()).isEqualTo(HttpStatus.SC_BAD_REQUEST);
            }
        }
    }

    @Nested
    @DisplayName("Filter traces by source")
    class FilterTracesBySource {

        @ParameterizedTest
        @EnumSource(TraceSource.class)
        @DisplayName("Filter traces by source EQUAL returns only matching traces")
        void filterTracesBySourceEqual(TraceSource source) {
            var projectName = "source-filter-test-" + UUID.randomUUID();

            var matchingTrace = factory.manufacturePojo(Trace.class).toBuilder()
                    .projectName(projectName)
                    .source(source)
                    .build();

            var otherSource = source == TraceSource.SDK ? TraceSource.EXPERIMENT : TraceSource.SDK;
            var nonMatchingTrace = factory.manufacturePojo(Trace.class).toBuilder()
                    .projectName(projectName)
                    .source(otherSource)
                    .build();

            traceResourceClient.createTrace(matchingTrace, API_KEY, TEST_WORKSPACE);
            traceResourceClient.createTrace(nonMatchingTrace, API_KEY, TEST_WORKSPACE);

            var filters = List.of(TraceFilter.builder()
                    .field(TraceField.SOURCE)
                    .operator(Operator.EQUAL)
                    .value(source.getValue())
                    .build());

            var page = traceResourceClient.getTraces(projectName, null, API_KEY, TEST_WORKSPACE,
                    filters, List.of(), 10, Map.of());

            assertThat(page.content())
                    .isNotEmpty()
                    .allSatisfy(t -> assertThat(t.source()).isIn(source, null));
            assertThat(page.content())
                    .noneMatch(t -> t.source() == otherSource);
        }

        @Test
        @DisplayName("Filter by source SDK also returns legacy traces with unknown source (null)")
        void filterBySourceSdkIncludesUnknownSourceTraces() {
            var projectName = "source-filter-sdk-unknown-" + UUID.randomUUID();

            var sdkTrace = factory.manufacturePojo(Trace.class).toBuilder()
                    .projectName(projectName)
                    .source(TraceSource.SDK)
                    .usage(null)
                    .feedbackScores(null)
                    .build();

            var unknownSourceTrace = factory.manufacturePojo(Trace.class).toBuilder()
                    .projectName(projectName)
                    .source(null)
                    .usage(null)
                    .feedbackScores(null)
                    .build();

            var experimentTrace = factory.manufacturePojo(Trace.class).toBuilder()
                    .projectName(projectName)
                    .source(TraceSource.EXPERIMENT)
                    .usage(null)
                    .feedbackScores(null)
                    .build();

            traceResourceClient.createTrace(sdkTrace, API_KEY, TEST_WORKSPACE);
            traceResourceClient.createTrace(unknownSourceTrace, API_KEY, TEST_WORKSPACE);
            traceResourceClient.createTrace(experimentTrace, API_KEY, TEST_WORKSPACE);

            var filters = List.of(TraceFilter.builder()
                    .field(TraceField.SOURCE)
                    .operator(Operator.EQUAL)
                    .value(TraceSource.SDK.getValue())
                    .build());

            var page = traceResourceClient.getTraces(projectName, null, API_KEY, TEST_WORKSPACE,
                    filters, List.of(), 10, Map.of());

            // ClickHouse returns traces in descending insertion order;
            // unknownSourceTrace was inserted after sdkTrace so it comes first.
            TraceAssertions.assertTraces(page.content(),
                    List.of(unknownSourceTrace, sdkTrace),
                    List.of(experimentTrace), USER);
        }
    }
}
