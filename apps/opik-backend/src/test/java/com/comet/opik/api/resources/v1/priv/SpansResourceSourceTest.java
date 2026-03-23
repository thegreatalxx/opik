package com.comet.opik.api.resources.v1.priv;

import com.comet.opik.api.Span;
import com.comet.opik.api.Trace;
import com.comet.opik.api.TraceSource;
import com.comet.opik.api.filter.Operator;
import com.comet.opik.api.filter.SpanField;
import com.comet.opik.api.filter.SpanFilter;
import com.comet.opik.api.resources.utils.AuthTestUtils;
import com.comet.opik.api.resources.utils.ClickHouseContainerUtils;
import com.comet.opik.api.resources.utils.ClientSupportUtils;
import com.comet.opik.api.resources.utils.MigrationUtils;
import com.comet.opik.api.resources.utils.MySQLContainerUtils;
import com.comet.opik.api.resources.utils.RedisContainerUtils;
import com.comet.opik.api.resources.utils.TestDropwizardAppExtensionUtils;
import com.comet.opik.api.resources.utils.TestUtils;
import com.comet.opik.api.resources.utils.WireMockUtils;
import com.comet.opik.api.resources.utils.resources.SpanResourceClient;
import com.comet.opik.api.resources.utils.resources.TraceResourceClient;
import com.comet.opik.api.resources.utils.spans.SpanAssertions;
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
import java.util.UUID;

import static com.comet.opik.api.resources.utils.ClickHouseContainerUtils.DATABASE_NAME;
import static com.comet.opik.domain.ProjectService.DEFAULT_PROJECT;
import static com.comet.opik.infrastructure.auth.RequestContext.WORKSPACE_HEADER;
import static org.assertj.core.api.Assertions.assertThat;

@DisplayName("Spans Resource Source Tests")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
@ExtendWith(DropwizardAppExtensionProvider.class)
class SpansResourceSourceTest {

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
    private SpanResourceClient spanResourceClient;

    @BeforeAll
    void setUpAll(ClientSupport client) {
        this.baseURI = TestUtils.getBaseUrl(client);
        this.client = client;

        ClientSupportUtils.config(client);

        AuthTestUtils.mockTargetWorkspace(wireMock.server(), API_KEY, TEST_WORKSPACE, WORKSPACE_ID, USER);

        this.traceResourceClient = new TraceResourceClient(this.client, baseURI);
        this.spanResourceClient = new SpanResourceClient(this.client, baseURI);
    }

    private UUID createParentTrace(String projectName) {
        var trace = factory.manufacturePojo(Trace.class).toBuilder()
                .projectName(projectName)
                .build();
        return traceResourceClient.createTrace(trace, API_KEY, TEST_WORKSPACE);
    }

    @Nested
    @DisplayName("Source field on span creation")
    class CreateSpanWithSource {

        @ParameterizedTest
        @EnumSource(TraceSource.class)
        @DisplayName("Create span with each valid source and verify it is stored")
        void createSpanWithSource(TraceSource source) {
            var traceId = createParentTrace(DEFAULT_PROJECT);

            var span = factory.manufacturePojo(Span.class).toBuilder()
                    .projectName(DEFAULT_PROJECT)
                    .traceId(traceId)
                    .source(source)
                    .build();

            var id = spanResourceClient.createSpan(span, API_KEY, TEST_WORKSPACE);

            var actual = spanResourceClient.getById(id, TEST_WORKSPACE, API_KEY);
            assertThat(actual.source()).isEqualTo(source);
        }

        @Test
        @DisplayName("Create span without source defaults to null (unknown in storage)")
        void createSpanWithoutSourceDefaultsToNull() {
            var traceId = createParentTrace(DEFAULT_PROJECT);

            var span = factory.manufacturePojo(Span.class).toBuilder()
                    .projectName(DEFAULT_PROJECT)
                    .traceId(traceId)
                    .source(null)
                    .build();

            var id = spanResourceClient.createSpan(span, API_KEY, TEST_WORKSPACE);

            var actual = spanResourceClient.getById(id, TEST_WORKSPACE, API_KEY);
            assertThat(actual.source()).isNull();
        }

        @Test
        @DisplayName("Create span with invalid source returns 400")
        void createSpanWithInvalidSourceReturns400() {
            var traceId = createParentTrace(DEFAULT_PROJECT);

            var body = """
                    {
                        "project_name": "%s",
                        "trace_id": "%s",
                        "name": "test-span",
                        "type": "general",
                        "start_time": "2024-01-01T00:00:00Z",
                        "source": "invalid_source"
                    }
                    """.formatted(DEFAULT_PROJECT, traceId);

            try (var response = client.target("%s/v1/private/spans".formatted(baseURI))
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
    @DisplayName("Filter spans by source")
    class FilterSpansBySource {

        @ParameterizedTest
        @EnumSource(TraceSource.class)
        @DisplayName("Filter spans by source EQUAL returns only matching spans")
        void filterSpansBySourceEqual(TraceSource source) {
            var projectName = "span-source-filter-test-" + UUID.randomUUID();
            var traceId = createParentTrace(projectName);

            var matchingSpan = factory.manufacturePojo(Span.class).toBuilder()
                    .projectName(projectName)
                    .traceId(traceId)
                    .source(source)
                    .build();

            var otherSource = source == TraceSource.SDK ? TraceSource.EXPERIMENT : TraceSource.SDK;
            var nonMatchingSpan = factory.manufacturePojo(Span.class).toBuilder()
                    .projectName(projectName)
                    .traceId(traceId)
                    .source(otherSource)
                    .build();

            spanResourceClient.createSpan(matchingSpan, API_KEY, TEST_WORKSPACE);
            spanResourceClient.createSpan(nonMatchingSpan, API_KEY, TEST_WORKSPACE);

            var filters = List.of(SpanFilter.builder()
                    .field(SpanField.SOURCE)
                    .operator(Operator.EQUAL)
                    .value(source.getValue())
                    .build());

            var page = spanResourceClient.findSpans(TEST_WORKSPACE, API_KEY, projectName, null, 1, 10,
                    null, null, filters, List.of(), List.of());

            assertThat(page.content())
                    .isNotEmpty()
                    .allSatisfy(s -> assertThat(s.source()).isIn(source, null));
            assertThat(page.content())
                    .noneMatch(s -> s.source() == otherSource);
        }

        @Test
        @DisplayName("Filter by source SDK also returns legacy spans with unknown source (null)")
        void filterBySourceSdkIncludesUnknownSourceSpans() {
            var projectName = "span-source-filter-sdk-unknown-" + UUID.randomUUID();
            var traceId = createParentTrace(projectName);

            var sdkSpan = factory.manufacturePojo(Span.class).toBuilder()
                    .projectName(projectName)
                    .traceId(traceId)
                    .source(TraceSource.SDK)
                    .usage(null)
                    .feedbackScores(null)
                    .build();

            var unknownSourceSpan = factory.manufacturePojo(Span.class).toBuilder()
                    .projectName(projectName)
                    .traceId(traceId)
                    .source(null)
                    .usage(null)
                    .feedbackScores(null)
                    .build();

            var experimentSpan = factory.manufacturePojo(Span.class).toBuilder()
                    .projectName(projectName)
                    .traceId(traceId)
                    .source(TraceSource.EXPERIMENT)
                    .usage(null)
                    .feedbackScores(null)
                    .build();

            spanResourceClient.createSpan(sdkSpan, API_KEY, TEST_WORKSPACE);
            spanResourceClient.createSpan(unknownSourceSpan, API_KEY, TEST_WORKSPACE);
            spanResourceClient.createSpan(experimentSpan, API_KEY, TEST_WORKSPACE);

            var filters = List.of(SpanFilter.builder()
                    .field(SpanField.SOURCE)
                    .operator(Operator.EQUAL)
                    .value(TraceSource.SDK.getValue())
                    .build());

            var page = spanResourceClient.findSpans(TEST_WORKSPACE, API_KEY, projectName, null, 1, 10,
                    null, null, filters, List.of(), List.of());

            // ClickHouse returns spans in descending insertion order;
            // unknownSourceSpan was inserted after sdkSpan so it comes first.
            SpanAssertions.assertSpan(page.content(),
                    List.of(unknownSourceSpan, sdkSpan),
                    List.of(experimentSpan), USER);
        }
    }
}
