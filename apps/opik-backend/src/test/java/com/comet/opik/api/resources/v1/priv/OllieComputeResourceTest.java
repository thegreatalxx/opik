package com.comet.opik.api.resources.v1.priv;

import com.comet.opik.api.resources.utils.AuthTestUtils;
import com.comet.opik.api.resources.utils.ClickHouseContainerUtils;
import com.comet.opik.api.resources.utils.ClientSupportUtils;
import com.comet.opik.api.resources.utils.MigrationUtils;
import com.comet.opik.api.resources.utils.MySQLContainerUtils;
import com.comet.opik.api.resources.utils.RedisContainerUtils;
import com.comet.opik.api.resources.utils.TestDropwizardAppExtensionUtils;
import com.comet.opik.api.resources.utils.TestDropwizardAppExtensionUtils.CustomConfig;
import com.comet.opik.api.resources.utils.TestUtils;
import com.comet.opik.api.resources.utils.WireMockUtils;
import com.comet.opik.domain.ollie.OllieComputeResponse;
import com.comet.opik.extensions.DropwizardAppExtensionProvider;
import com.comet.opik.extensions.RegisterApp;
import com.github.tomakehurst.wiremock.WireMockServer;
import com.redis.testcontainers.RedisContainer;
import jakarta.ws.rs.core.HttpHeaders;
import org.awaitility.Awaitility;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.api.extension.ExtendWith;
import org.testcontainers.clickhouse.ClickHouseContainer;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.lifecycle.Startables;
import org.testcontainers.mysql.MySQLContainer;
import ru.vyarus.dropwizard.guice.test.ClientSupport;
import ru.vyarus.dropwizard.guice.test.jupiter.ext.TestDropwizardAppExtension;

import java.time.Duration;
import java.util.List;

import static com.comet.opik.api.resources.utils.ClickHouseContainerUtils.DATABASE_NAME;
import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.post;
import static com.github.tomakehurst.wiremock.client.WireMock.postRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.urlMatching;
import static com.github.tomakehurst.wiremock.core.WireMockConfiguration.wireMockConfig;
import static java.util.UUID.randomUUID;
import static org.assertj.core.api.Assertions.assertThat;

@DisplayName("Ollie Compute Resource Test")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
@ExtendWith(DropwizardAppExtensionProvider.class)
public class OllieComputeResourceTest {

    private static final String API_KEY = randomUUID().toString();
    private static final String USER = randomUUID().toString();
    private static final String WORKSPACE_ID = randomUUID().toString();
    private static final String TEST_WORKSPACE = randomUUID().toString();

    private final RedisContainer REDIS = RedisContainerUtils.newRedisContainer();
    private final MySQLContainer MYSQL_CONTAINER = MySQLContainerUtils.newMySQLContainer();
    private final GenericContainer<?> ZOOKEEPER_CONTAINER = ClickHouseContainerUtils.newZookeeperContainer();
    private final ClickHouseContainer CLICK_HOUSE_CONTAINER = ClickHouseContainerUtils
            .newClickHouseContainer(ZOOKEEPER_CONTAINER);

    private final WireMockUtils.WireMockRuntime wireMock;
    private final WireMockServer orchestratorMock;

    @RegisterApp
    private final TestDropwizardAppExtension APP;

    {
        Startables.deepStart(REDIS, MYSQL_CONTAINER, CLICK_HOUSE_CONTAINER, ZOOKEEPER_CONTAINER).join();

        wireMock = WireMockUtils.startWireMock();

        orchestratorMock = new WireMockServer(wireMockConfig().dynamicPort());
        orchestratorMock.start();

        var databaseAnalyticsFactory = ClickHouseContainerUtils.newDatabaseAnalyticsFactory(
                CLICK_HOUSE_CONTAINER, DATABASE_NAME);

        MigrationUtils.runMysqlDbMigration(MYSQL_CONTAINER);
        MigrationUtils.runClickhouseDbMigration(CLICK_HOUSE_CONTAINER);

        APP = TestDropwizardAppExtensionUtils.newTestDropwizardAppExtension(
                TestDropwizardAppExtensionUtils.AppContextConfig.builder()
                        .jdbcUrl(MYSQL_CONTAINER.getJdbcUrl())
                        .databaseAnalyticsFactory(databaseAnalyticsFactory)
                        .runtimeInfo(wireMock.runtimeInfo())
                        .redisUrl(REDIS.getRedisURI())
                        .customConfigs(List.of(
                                new CustomConfig("serviceToggles.ollieEnabled", "true"),
                                new CustomConfig("ollie.orchestratorUrl",
                                        "http://localhost:" + orchestratorMock.port())))
                        .build());
    }

    private String baseUrl;

    @BeforeAll
    void setUpAll(ClientSupport client) {
        baseUrl = TestUtils.getBaseUrl(client);
        ClientSupportUtils.config(client);
        AuthTestUtils.mockTargetWorkspace(wireMock.server(), API_KEY, TEST_WORKSPACE, WORKSPACE_ID, USER);
    }

    @AfterAll
    void tearDownAll() {
        wireMock.server().stop();
        orchestratorMock.stop();
    }

    @Test
    @DisplayName("Full flow: warm triggers async install, compute returns URL and sets auth cookie")
    void fullFlow__warmThenCompute(ClientSupport client) {
        orchestratorMock.stubFor(post(urlMatching("/orchestrator/install/ollie.*"))
                .willReturn(aResponse()
                        .withStatus(200)
                        .withHeader("Content-Type", "application/json")
                        .withBody("""
                                {"computeUrl": "http://ollie-pod:9080/api", "browserAuth": "testtoken123"}
                                """)));

        // Step 1: warm — fire-and-forget pre-provisioning
        var warmResponse = client.target(baseUrl + "/v1/private/ollie/warm")
                .request()
                .header(HttpHeaders.AUTHORIZATION, API_KEY)
                .header("Comet-Workspace", TEST_WORKSPACE)
                .post(null);

        assertThat(warmResponse.getStatus()).isEqualTo(202);
        warmResponse.close();

        // Wait for async warm-up to reach the orchestrator
        Awaitility.await().atMost(Duration.ofSeconds(5)).untilAsserted(
                () -> orchestratorMock.verify(postRequestedFor(urlMatching("/orchestrator/install/ollie.*"))));

        // Step 2: compute — synchronous provisioning with cookie
        var computeResponse = client.target(baseUrl + "/v1/private/ollie/compute")
                .request()
                .header(HttpHeaders.AUTHORIZATION, API_KEY)
                .header("Comet-Workspace", TEST_WORKSPACE)
                .post(null);

        assertThat(computeResponse.getStatus()).isEqualTo(200);

        OllieComputeResponse body = computeResponse.readEntity(OllieComputeResponse.class);
        assertThat(body.computeUrl()).isEqualTo("http://ollie-pod:9080/api");
        assertThat(body.enabled()).isTrue();

        // Verify PPAUTH cookie is set
        String setCookie = computeResponse.getHeaderString("Set-Cookie");
        assertThat(setCookie).contains("PPAUTH=testtoken123");

        computeResponse.close();
    }

    @Test
    @DisplayName("Compute with label reuse: same user gets same label across calls")
    void compute__labelReuse__sameUserGetsSameLabel(ClientSupport client) {
        // The toggle is enabled for this test class, so we test the enabled path above.
        // This test verifies the response shape — the disabled path is a simple code check
        // that doesn't need a full integration test (covered by unit tests).
        // Instead, verify that label reuse works: two compute calls should use the same label.

        orchestratorMock.resetAll();
        orchestratorMock.stubFor(post(urlMatching("/orchestrator/install/ollie.*"))
                .willReturn(aResponse()
                        .withStatus(200)
                        .withHeader("Content-Type", "application/json")
                        .withBody("""
                                {"computeUrl": "http://ollie-pod:9080/api", "browserAuth": "tok"}
                                """)));

        // First call
        var resp1 = client.target(baseUrl + "/v1/private/ollie/compute")
                .request()
                .header(HttpHeaders.AUTHORIZATION, API_KEY)
                .header("Comet-Workspace", TEST_WORKSPACE)
                .post(null);
        assertThat(resp1.getStatus()).isEqualTo(200);
        resp1.close();

        // Second call — should reuse the same label (Redis-cached)
        var resp2 = client.target(baseUrl + "/v1/private/ollie/compute")
                .request()
                .header(HttpHeaders.AUTHORIZATION, API_KEY)
                .header("Comet-Workspace", TEST_WORKSPACE)
                .post(null);
        assertThat(resp2.getStatus()).isEqualTo(200);
        resp2.close();

        // Both calls should have used the same ollie label (same URL pattern)
        var requests = orchestratorMock.findAll(postRequestedFor(urlMatching("/orchestrator/install/ollie.*")));
        assertThat(requests).hasSizeGreaterThanOrEqualTo(2);

        String label1 = requests.get(0).getUrl().replace("/orchestrator/install/", "");
        String label2 = requests.get(1).getUrl().replace("/orchestrator/install/", "");
        assertThat(label1).isEqualTo(label2);
        assertThat(label1).startsWith("ollie");
    }
}
