package com.comet.opik.domain;

import com.comet.opik.api.Project;
import com.comet.opik.api.resources.utils.RedisContainerUtils;
import com.comet.opik.api.runner.BridgeCommand;
import com.comet.opik.api.runner.BridgeCommandError;
import com.comet.opik.api.runner.BridgeCommandResultRequest;
import com.comet.opik.api.runner.BridgeCommandStatus;
import com.comet.opik.api.runner.BridgeNextResponse;
import com.comet.opik.api.runner.CreateBridgeCommandRequest;
import com.comet.opik.api.runner.CreateLocalRunnerJobRequest;
import com.comet.opik.api.runner.LocalRunner;
import com.comet.opik.api.runner.LocalRunnerConnectRequest;
import com.comet.opik.api.runner.LocalRunnerConnectResponse;
import com.comet.opik.api.runner.LocalRunnerHeartbeatResponse;
import com.comet.opik.api.runner.LocalRunnerJob;
import com.comet.opik.api.runner.LocalRunnerJobResultRequest;
import com.comet.opik.api.runner.LocalRunnerJobStatus;
import com.comet.opik.api.runner.LocalRunnerLogEntry;
import com.comet.opik.api.runner.LocalRunnerPairResponse;
import com.comet.opik.api.runner.RunnerChecklist;
import com.comet.opik.infrastructure.LocalRunnerConfig;
import com.comet.opik.infrastructure.redis.StringRedisClient;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.redis.testcontainers.RedisContainer;
import io.dropwizard.util.Duration;
import jakarta.ws.rs.ClientErrorException;
import jakarta.ws.rs.NotFoundException;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.mockito.Mockito;
import org.redisson.Redisson;
import org.redisson.api.RBucket;
import org.redisson.api.RList;
import org.redisson.api.RMap;
import org.redisson.api.RScoredSortedSet;
import org.redisson.api.RSet;
import org.redisson.api.RedissonClient;
import org.redisson.config.Config;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class LocalRunnerServiceImplTest {

    private static final String WORKSPACE_ID = "00000000-0000-0000-0000-000000000001";
    private static final String OTHER_WORKSPACE_ID = "00000000-0000-0000-0000-000000000002";
    private static final String USER_NAME = "test-user";
    private static final String RUNNER_NAME = "my-runner";
    private static final String AGENT_NAME = "test-agent";
    private static final UUID PROJECT_ID = UUID.fromString("00000000-0000-0000-0000-000000000099");
    private static final String PROJECT_NAME = "test-project";
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final RedisContainer redis = RedisContainerUtils.newRedisContainer();
    private RedissonClient redisClient;
    private StringRedisClient stringRedis;
    private LocalRunnerConfig runnerConfig;
    private IdGenerator idGenerator;
    private ProjectService projectService;
    private LocalRunnerServiceImpl runnerService;

    private int uuidCounter = 0;

    @BeforeAll
    void setUp() {
        redis.start();

        Config config = new Config();
        config.useSingleServer()
                .setAddress(redis.getRedisURI())
                .setDatabase(0);

        redisClient = Redisson.create(config);
        stringRedis = new StringRedisClient(redisClient);

        runnerConfig = new LocalRunnerConfig();
        runnerConfig.setEnabled(true);
        runnerConfig.setHeartbeatTtl(Duration.seconds(2));
        runnerConfig.setNextJobPollTimeout(Duration.seconds(1));
        runnerConfig.setMaxPendingJobsPerRunner(3);
        runnerConfig.setDeadRunnerPurgeTime(Duration.seconds(0));
        runnerConfig.setCompletedJobTtl(Duration.days(7));
        runnerConfig.setJobTimeout(Duration.seconds(1800));
        runnerConfig.setReaperLockDuration(Duration.seconds(55));
        runnerConfig.setReaperLockWait(Duration.seconds(5));

        idGenerator = Mockito.mock(IdGenerator.class);
        projectService = Mockito.mock(ProjectService.class);

        when(projectService.get(eq(PROJECT_ID), any())).thenReturn(
                Project.builder().id(PROJECT_ID).name(PROJECT_NAME).build());

        runnerService = new LocalRunnerServiceImpl(stringRedis, redisClient.reactive(), runnerConfig, idGenerator,
                projectService);
    }

    @BeforeEach
    void clearDatabase() {
        redisClient.getKeys().flushdb();
        uuidCounter = 0;
    }

    @AfterAll
    void tearDown() {
        redisClient.shutdown();
        redis.stop();
    }

    private UUID nextUUID() {
        uuidCounter++;
        return UUID.fromString("00000000-0000-0000-0000-%012d".formatted(uuidCounter));
    }

    private void stubNextId() {
        when(idGenerator.generateId()).thenReturn(nextUUID());
    }

    private UUID pairAndConnect(String workspaceId, String userName, String runnerName) {
        stubNextId();
        LocalRunnerPairResponse pair = runnerService.generatePairingCode(workspaceId, userName, PROJECT_ID);
        LocalRunnerConnectRequest req = LocalRunnerConnectRequest.builder()
                .pairingCode(pair.pairingCode())
                .runnerName(runnerName)
                .build();
        LocalRunnerConnectResponse resp = runnerService.connect(workspaceId, userName, req);
        LocalRunner.Agent agent = LocalRunner.Agent.builder()
                .name(AGENT_NAME)
                .build();
        runnerService.registerAgents(resp.runnerId(), workspaceId, userName, Map.of(AGENT_NAME, agent));
        return resp.runnerId();
    }

    private UUID createTestJob(String workspaceId, String userName, String agentName) {
        stubNextId();
        CreateLocalRunnerJobRequest req = CreateLocalRunnerJobRequest.builder()
                .agentName(agentName)
                .projectId(PROJECT_ID)
                .build();
        return runnerService.createJob(workspaceId, userName, req);
    }

    private void waitForHeartbeatExpiry() throws InterruptedException {
        Thread.sleep((runnerConfig.getHeartbeatTtl().toSeconds() + 1) * 1000L);
    }

    @Nested
    class GeneratePairingCode {

        @Test
        void createsPairKeyInRedis() {
            stubNextId();
            LocalRunnerPairResponse resp = runnerService.generatePairingCode(WORKSPACE_ID, USER_NAME, PROJECT_ID);

            RBucket<String> pairBucket = stringRedis.getBucket(
                    "opik:runners:pair:" + resp.pairingCode());
            assertThat(pairBucket.isExists()).isTrue();
            String value = pairBucket.get();
            assertThat(value).contains(resp.runnerId().toString());
            assertThat(value).contains(WORKSPACE_ID);
            assertThat(value).contains(PROJECT_ID.toString());
            assertThat(pairBucket.remainTimeToLive()).isPositive();
        }

        @Test
        void createsRunnerHash() {
            stubNextId();
            LocalRunnerPairResponse resp = runnerService.generatePairingCode(WORKSPACE_ID, USER_NAME, PROJECT_ID);

            RMap<String, String> runnerMap = stringRedis.getMap(
                    "opik:runners:runner:" + resp.runnerId());
            assertThat(runnerMap.get("status")).isEqualTo("pairing");
            assertThat(runnerMap.get("workspace_id")).isEqualTo(WORKSPACE_ID);
            assertThat(runnerMap.get("user_name")).isEqualTo(USER_NAME);
            assertThat(runnerMap.get("project_id")).isEqualTo(PROJECT_ID.toString());
            assertThat(runnerMap.remainTimeToLive()).isPositive();
        }

        @Test
        void addsToWorkspaceSets() {
            stubNextId();
            LocalRunnerPairResponse resp = runnerService.generatePairingCode(WORKSPACE_ID, USER_NAME, PROJECT_ID);

            RScoredSortedSet<String> wsRunners = stringRedis.getScoredSortedSet(
                    "opik:runners:workspace:" + WORKSPACE_ID + ":runners");
            assertThat(wsRunners.contains(resp.runnerId().toString())).isTrue();

            RSet<String> workspaces = stringRedis.getSet(
                    "opik:runners:workspaces:with_runners");
            assertThat(workspaces.contains(WORKSPACE_ID)).isTrue();
        }

        @Test
        void doesNotSetUserRunnerMappingUntilConnect() {
            stubNextId();
            runnerService.generatePairingCode(WORKSPACE_ID, USER_NAME, PROJECT_ID);

            RBucket<String> userRunner = stringRedis.getBucket(
                    "opik:runners:workspace:" + WORKSPACE_ID + ":project:" + PROJECT_ID + ":user:" + USER_NAME
                            + ":runner");
            assertThat(userRunner.isExists()).isFalse();
        }

        @Test
        void addsToProjectRunnersSet() {
            stubNextId();
            LocalRunnerPairResponse resp = runnerService.generatePairingCode(WORKSPACE_ID, USER_NAME, PROJECT_ID);

            RSet<String> projectRunners = stringRedis.getSet(
                    "opik:runners:workspace:" + WORKSPACE_ID + ":project:" + PROJECT_ID + ":runners");
            assertThat(projectRunners.contains(resp.runnerId().toString())).isTrue();
        }
    }

    @Nested
    class Connect {

        @Test
        void withPairingCode_claimsPairAndReturnsCredentials() {
            stubNextId();
            LocalRunnerPairResponse pair = runnerService.generatePairingCode(WORKSPACE_ID, USER_NAME, PROJECT_ID);

            LocalRunnerConnectRequest req = LocalRunnerConnectRequest.builder()
                    .pairingCode(pair.pairingCode())
                    .runnerName(RUNNER_NAME)
                    .build();
            LocalRunnerConnectResponse resp = runnerService.connect(WORKSPACE_ID, USER_NAME, req);

            assertThat(resp.runnerId()).isEqualTo(pair.runnerId());
            assertThat(resp.projectId()).isEqualTo(PROJECT_ID);
            assertThat(resp.projectName()).isEqualTo(PROJECT_NAME);

            RBucket<String> pairBucket = stringRedis.getBucket(
                    "opik:runners:pair:" + pair.pairingCode());
            assertThat(pairBucket.isExists()).isFalse();

            RMap<String, String> runnerMap = stringRedis.getMap(
                    "opik:runners:runner:" + resp.runnerId());
            assertThat(runnerMap.get("status")).isEqualTo("connected");
            assertThat(runnerMap.get("name")).isEqualTo(RUNNER_NAME);
            assertThat(runnerMap.get("connected_at")).isNotBlank();
            assertThat(runnerMap.get("project_id")).isEqualTo(PROJECT_ID.toString());
        }

        @Test
        void withPairingCode_removesRunnerTTL() {
            stubNextId();
            LocalRunnerPairResponse pair = runnerService.generatePairingCode(WORKSPACE_ID, USER_NAME, PROJECT_ID);

            LocalRunnerConnectRequest req = LocalRunnerConnectRequest.builder()
                    .pairingCode(pair.pairingCode())
                    .runnerName(RUNNER_NAME)
                    .build();
            runnerService.connect(WORKSPACE_ID, USER_NAME, req);

            RMap<String, String> runnerMap = stringRedis.getMap(
                    "opik:runners:runner:" + pair.runnerId());
            assertThat(runnerMap.remainTimeToLive()).isEqualTo(-1);
        }

        @Test
        void withPairingCode_setsHeartbeat() {
            stubNextId();
            LocalRunnerPairResponse pair = runnerService.generatePairingCode(WORKSPACE_ID, USER_NAME, PROJECT_ID);

            LocalRunnerConnectRequest req = LocalRunnerConnectRequest.builder()
                    .pairingCode(pair.pairingCode())
                    .runnerName(RUNNER_NAME)
                    .build();
            LocalRunnerConnectResponse resp = runnerService.connect(WORKSPACE_ID, USER_NAME, req);

            RBucket<String> hb = stringRedis.getBucket(
                    "opik:runners:runner:" + resp.runnerId() + ":heartbeat");
            assertThat(hb.isExists()).isTrue();
            assertThat(hb.remainTimeToLive()).isPositive();
        }

        @Test
        void replacesExistingRunner() {
            UUID oldRunnerId = pairAndConnect(WORKSPACE_ID, USER_NAME, "old-runner");
            UUID newRunnerId = pairAndConnect(WORKSPACE_ID, USER_NAME, "new-runner");

            assertThat(newRunnerId).isNotEqualTo(oldRunnerId);

            RBucket<String> oldHb = stringRedis.getBucket(
                    "opik:runners:runner:" + oldRunnerId + ":heartbeat");
            assertThat(oldHb.isExists()).isFalse();

            RBucket<String> userRunner = stringRedis.getBucket(
                    "opik:runners:workspace:" + WORKSPACE_ID + ":project:" + PROJECT_ID + ":user:" + USER_NAME
                            + ":runner");
            assertThat(userRunner.get()).isEqualTo(newRunnerId.toString());
        }
    }

    @Nested
    class Heartbeat {

        @Test
        void refreshesHeartbeatTTL() {
            UUID runnerId = pairAndConnect(WORKSPACE_ID, USER_NAME, RUNNER_NAME);

            LocalRunnerHeartbeatResponse resp = runnerService.heartbeat(runnerId, WORKSPACE_ID, USER_NAME, null);
            assertThat(resp).isNotNull();

            RBucket<String> hb = stringRedis.getBucket(
                    "opik:runners:runner:" + runnerId + ":heartbeat");
            assertThat(hb.isExists()).isTrue();
            assertThat(hb.remainTimeToLive()).isPositive();
        }

        @Test
        void updatesLastHeartbeatOnActiveJobs() {
            UUID runnerId = pairAndConnect(WORKSPACE_ID, USER_NAME, RUNNER_NAME);
            UUID jobId = createTestJob(WORKSPACE_ID, USER_NAME, AGENT_NAME);

            stubNextId();
            LocalRunnerJob claimed = runnerService.nextJob(runnerId, WORKSPACE_ID, USER_NAME).block();
            assertThat(claimed).isNotNull();

            runnerService.heartbeat(runnerId, WORKSPACE_ID, USER_NAME, null);

            RMap<String, String> jobMap = stringRedis.getMap(
                    "opik:runners:job:" + claimed.id());
            assertThat(jobMap.get("last_heartbeat")).isNotBlank();
        }
    }

    @Nested
    class CreateJob {

        @Test
        void createsJobAndEnqueues() {
            UUID runnerId = pairAndConnect(WORKSPACE_ID, USER_NAME, RUNNER_NAME);

            stubNextId();
            CreateLocalRunnerJobRequest req = CreateLocalRunnerJobRequest.builder()
                    .agentName(AGENT_NAME)
                    .projectId(PROJECT_ID)
                    .build();
            UUID jobId = runnerService.createJob(WORKSPACE_ID, USER_NAME, req);

            LocalRunnerJob job = runnerService.getJob(jobId, WORKSPACE_ID, USER_NAME);
            assertThat(job.id()).isEqualTo(jobId);
            assertThat(job.runnerId()).isEqualTo(runnerId);
            assertThat(job.agentName()).isEqualTo(AGENT_NAME);
            assertThat(job.status().getValue()).isEqualTo("pending");
            assertThat(job.projectId()).isEqualTo(PROJECT_ID);

            RList<String> pending = stringRedis.getList(
                    "opik:runners:jobs:" + runnerId + ":pending");
            assertThat(pending.readAll()).contains(jobId.toString());

            RScoredSortedSet<String> runnerJobs = stringRedis.getScoredSortedSet(
                    "opik:runners:runner:" + runnerId + ":jobs");
            assertThat(runnerJobs.contains(jobId.toString())).isTrue();
        }
    }

    @Nested
    class NextJob {

        @Test
        void removesFromPendingAddsToActive() {
            UUID runnerId = pairAndConnect(WORKSPACE_ID, USER_NAME, RUNNER_NAME);
            UUID jobId = createTestJob(WORKSPACE_ID, USER_NAME, AGENT_NAME);

            runnerService.nextJob(runnerId, WORKSPACE_ID, USER_NAME).block();

            RList<String> pending = stringRedis.getList(
                    "opik:runners:jobs:" + runnerId + ":pending");
            assertThat(pending.size()).isZero();

            RList<String> active = stringRedis.getList(
                    "opik:runners:jobs:" + runnerId + ":active");
            assertThat(active.readAll()).contains(jobId.toString());
        }
    }

    @Nested
    class ListJobs {

        @Test
        void excludesOtherWorkspaces() {
            UUID runnerId = pairAndConnect(WORKSPACE_ID, USER_NAME, RUNNER_NAME);
            UUID jobId = createTestJob(WORKSPACE_ID, USER_NAME, AGENT_NAME);

            String fakeJobId = UUID.randomUUID().toString();
            RMap<String, String> fakeJob = stringRedis.getMap("opik:runners:job:" + fakeJobId);
            fakeJob.putAll(Map.of(
                    "id", fakeJobId,
                    "runner_id", runnerId.toString(),
                    "agent_name", AGENT_NAME,
                    "status", "pending",
                    "workspace_id", OTHER_WORKSPACE_ID,
                    "created_at", Instant.now().toString()));
            RScoredSortedSet<String> runnerJobs = stringRedis.getScoredSortedSet(
                    "opik:runners:runner:" + runnerId + ":jobs");
            runnerJobs.add(Instant.now().toEpochMilli(), fakeJobId);

            LocalRunnerJob.LocalRunnerJobPage page = runnerService.listJobs(runnerId, null, WORKSPACE_ID, USER_NAME, 0,
                    10);
            assertThat(page.content()).hasSize(1);
        }

        @Test
        void skipsExpiredJobHashes() {
            UUID runnerId = pairAndConnect(WORKSPACE_ID, USER_NAME, RUNNER_NAME);
            UUID jobId = createTestJob(WORKSPACE_ID, USER_NAME, AGENT_NAME);

            stringRedis.getMap("opik:runners:job:" + jobId).delete();

            LocalRunnerJob.LocalRunnerJobPage page = runnerService.listJobs(runnerId, null, WORKSPACE_ID, USER_NAME, 0,
                    10);
            assertThat(page.content()).isEmpty();
        }
    }

    @Nested
    class AppendLogs {

        @Test
        void appendsEntriesToList() {
            pairAndConnect(WORKSPACE_ID, USER_NAME, RUNNER_NAME);
            UUID jobId = createTestJob(WORKSPACE_ID, USER_NAME, AGENT_NAME);

            runnerService.appendLogs(jobId, WORKSPACE_ID, USER_NAME,
                    List.of(LocalRunnerLogEntry.builder().stream("stdout").text("hello").build()));

            RList<String> logsList = stringRedis.getList(
                    "opik:runners:job:" + jobId + ":logs");
            assertThat(logsList.size()).isEqualTo(1);
        }

        @Test
        void appendsMultipleBatches() {
            pairAndConnect(WORKSPACE_ID, USER_NAME, RUNNER_NAME);
            UUID jobId = createTestJob(WORKSPACE_ID, USER_NAME, AGENT_NAME);

            runnerService.appendLogs(jobId, WORKSPACE_ID, USER_NAME,
                    List.of(LocalRunnerLogEntry.builder().stream("stdout").text("batch1").build()));
            runnerService.appendLogs(jobId, WORKSPACE_ID, USER_NAME,
                    List.of(LocalRunnerLogEntry.builder().stream("stdout").text("batch2").build()));

            RList<String> logsList = stringRedis.getList(
                    "opik:runners:job:" + jobId + ":logs");
            assertThat(logsList.size()).isEqualTo(2);
        }
    }

    @Nested
    class ReportResult {

        @Test
        void completedJob() {
            UUID runnerId = pairAndConnect(WORKSPACE_ID, USER_NAME, RUNNER_NAME);
            UUID jobId = createTestJob(WORKSPACE_ID, USER_NAME, AGENT_NAME);
            runnerService.nextJob(runnerId, WORKSPACE_ID, USER_NAME).block();

            ObjectNode resultNode = MAPPER.createObjectNode();
            resultNode.put("output", "success");

            runnerService.reportResult(jobId, WORKSPACE_ID, USER_NAME,
                    LocalRunnerJobResultRequest.builder().status(LocalRunnerJobStatus.COMPLETED).result(resultNode)
                            .build());

            RMap<String, String> jobMap = stringRedis.getMap(
                    "opik:runners:job:" + jobId);
            assertThat(jobMap.get("status")).isEqualTo("completed");
            assertThat(jobMap.get("completed_at")).isNotBlank();
            assertThat(jobMap.get("result")).contains("success");

            RList<String> active = stringRedis.getList(
                    "opik:runners:jobs:" + runnerId + ":active");
            assertThat(active.readAll()).doesNotContain(jobId.toString());
        }

        @Test
        void failedJob() {
            UUID runnerId = pairAndConnect(WORKSPACE_ID, USER_NAME, RUNNER_NAME);
            UUID jobId = createTestJob(WORKSPACE_ID, USER_NAME, AGENT_NAME);
            runnerService.nextJob(runnerId, WORKSPACE_ID, USER_NAME).block();

            runnerService.reportResult(jobId, WORKSPACE_ID, USER_NAME,
                    LocalRunnerJobResultRequest.builder().status(LocalRunnerJobStatus.FAILED).error("something broke")
                            .build());

            RMap<String, String> jobMap = stringRedis.getMap(
                    "opik:runners:job:" + jobId);
            assertThat(jobMap.get("status")).isEqualTo("failed");
            assertThat(jobMap.get("error")).isEqualTo("something broke");
            assertThat(jobMap.get("completed_at")).isNotBlank();
        }

        @Test
        void setsTraceId() {
            UUID runnerId = pairAndConnect(WORKSPACE_ID, USER_NAME, RUNNER_NAME);
            UUID jobId = createTestJob(WORKSPACE_ID, USER_NAME, AGENT_NAME);
            runnerService.nextJob(runnerId, WORKSPACE_ID, USER_NAME).block();

            UUID traceId = UUID.randomUUID();
            runnerService.reportResult(jobId, WORKSPACE_ID, USER_NAME,
                    LocalRunnerJobResultRequest.builder().status(LocalRunnerJobStatus.COMPLETED).traceId(traceId)
                            .build());

            RMap<String, String> jobMap = stringRedis.getMap(
                    "opik:runners:job:" + jobId);
            assertThat(jobMap.get("trace_id")).isEqualTo(traceId.toString());
        }

        @Test
        void setsTTLOnJobAndLogs() {
            UUID runnerId = pairAndConnect(WORKSPACE_ID, USER_NAME, RUNNER_NAME);
            UUID jobId = createTestJob(WORKSPACE_ID, USER_NAME, AGENT_NAME);
            runnerService.nextJob(runnerId, WORKSPACE_ID, USER_NAME).block();

            runnerService.appendLogs(jobId, WORKSPACE_ID, USER_NAME,
                    List.of(LocalRunnerLogEntry.builder().stream("stdout").text("log").build()));

            runnerService.reportResult(jobId, WORKSPACE_ID, USER_NAME,
                    LocalRunnerJobResultRequest.builder().status(LocalRunnerJobStatus.COMPLETED).build());

            RMap<String, String> jobMap = stringRedis.getMap(
                    "opik:runners:job:" + jobId);
            assertThat(jobMap.remainTimeToLive()).isPositive();

            RList<String> logsList = stringRedis.getList(
                    "opik:runners:job:" + jobId + ":logs");
            assertThat(logsList.remainTimeToLive()).isPositive();
        }

        @Test
        void inFlightRunningSetsTraceIdWithoutCompletingJob() {
            UUID runnerId = pairAndConnect(WORKSPACE_ID, USER_NAME, RUNNER_NAME);
            UUID jobId = createTestJob(WORKSPACE_ID, USER_NAME, AGENT_NAME);
            runnerService.nextJob(runnerId, WORKSPACE_ID, USER_NAME).block();

            UUID traceId = UUID.randomUUID();
            runnerService.reportResult(jobId, WORKSPACE_ID, USER_NAME,
                    LocalRunnerJobResultRequest.builder().status(LocalRunnerJobStatus.RUNNING).traceId(traceId)
                            .build());

            RMap<String, String> jobMap = stringRedis.getMap(
                    "opik:runners:job:" + jobId);
            assertThat(jobMap.get("status")).isEqualTo("running");
            assertThat(jobMap.get("trace_id")).isEqualTo(traceId.toString());
            assertThat(jobMap.get("completed_at")).isNull();

            RList<String> active = stringRedis.getList(
                    "opik:runners:jobs:" + runnerId + ":active");
            assertThat(active.readAll()).contains(jobId.toString());

            assertThat(jobMap.remainTimeToLive()).isEqualTo(-1L);
        }

        @Test
        void inFlightRunningThenTerminalCompletes() {
            UUID runnerId = pairAndConnect(WORKSPACE_ID, USER_NAME, RUNNER_NAME);
            UUID jobId = createTestJob(WORKSPACE_ID, USER_NAME, AGENT_NAME);
            runnerService.nextJob(runnerId, WORKSPACE_ID, USER_NAME).block();

            UUID traceId = UUID.randomUUID();
            runnerService.reportResult(jobId, WORKSPACE_ID, USER_NAME,
                    LocalRunnerJobResultRequest.builder().status(LocalRunnerJobStatus.RUNNING).traceId(traceId)
                            .build());

            ObjectNode resultNode = MAPPER.createObjectNode();
            resultNode.put("output", "done");
            runnerService.reportResult(jobId, WORKSPACE_ID, USER_NAME,
                    LocalRunnerJobResultRequest.builder().status(LocalRunnerJobStatus.COMPLETED).result(resultNode)
                            .build());

            RMap<String, String> jobMap = stringRedis.getMap(
                    "opik:runners:job:" + jobId);
            assertThat(jobMap.get("status")).isEqualTo("completed");
            assertThat(jobMap.get("trace_id")).isEqualTo(traceId.toString());
            assertThat(jobMap.get("completed_at")).isNotBlank();
            assertThat(jobMap.get("result")).contains("done");

            RList<String> active = stringRedis.getList(
                    "opik:runners:jobs:" + runnerId + ":active");
            assertThat(active.readAll()).doesNotContain(jobId.toString());
        }

        @Test
        void rejectsPendingStatus() {
            UUID runnerId = pairAndConnect(WORKSPACE_ID, USER_NAME, RUNNER_NAME);
            UUID jobId = createTestJob(WORKSPACE_ID, USER_NAME, AGENT_NAME);
            runnerService.nextJob(runnerId, WORKSPACE_ID, USER_NAME).block();

            assertThatThrownBy(() -> runnerService.reportResult(jobId, WORKSPACE_ID, USER_NAME,
                    LocalRunnerJobResultRequest.builder().status(LocalRunnerJobStatus.PENDING).build()))
                    .isInstanceOf(ClientErrorException.class);
        }
    }

    @Nested
    class CancelJob {

        @Test
        void cancelActiveJob_addsToCancellationSet() {
            UUID runnerId = pairAndConnect(WORKSPACE_ID, USER_NAME, RUNNER_NAME);
            UUID jobId = createTestJob(WORKSPACE_ID, USER_NAME, AGENT_NAME);
            runnerService.nextJob(runnerId, WORKSPACE_ID, USER_NAME).block();

            runnerService.cancelJob(jobId, WORKSPACE_ID, USER_NAME);

            RMap<String, String> jobMap = stringRedis.getMap(
                    "opik:runners:job:" + jobId);
            assertThat(jobMap.get("status")).isEqualTo("cancelled");
            assertThat(jobMap.get("completed_at")).isNotBlank();

            RSet<String> cancellations = stringRedis.getSet(
                    "opik:runners:runner:" + runnerId + ":cancellations");
            assertThat(cancellations.contains(jobId.toString())).isTrue();
        }

        @Test
        void cancelPendingJob_removesFromPendingQueue() {
            UUID runnerId = pairAndConnect(WORKSPACE_ID, USER_NAME, RUNNER_NAME);
            UUID jobId = createTestJob(WORKSPACE_ID, USER_NAME, AGENT_NAME);

            runnerService.cancelJob(jobId, WORKSPACE_ID, USER_NAME);

            RList<String> pending = stringRedis.getList(
                    "opik:runners:jobs:" + runnerId + ":pending");
            assertThat(pending.readAll()).doesNotContain(jobId.toString());

            RSet<String> cancellations = stringRedis.getSet(
                    "opik:runners:runner:" + runnerId + ":cancellations");
            assertThat(cancellations.contains(jobId.toString())).isFalse();

            RMap<String, String> jobMap = stringRedis.getMap(
                    "opik:runners:job:" + jobId);
            assertThat(jobMap.get("status")).isEqualTo("cancelled");
            assertThat(jobMap.remainTimeToLive()).isPositive();
        }
    }

    @Test
    void fullFlow_pairConnectCreateJobNextJobReportResult() {
        stubNextId();
        LocalRunnerPairResponse pair = runnerService.generatePairingCode(WORKSPACE_ID, USER_NAME, PROJECT_ID);
        assertThat(pair.pairingCode()).hasSize(6);

        LocalRunnerConnectRequest connectReq = LocalRunnerConnectRequest.builder()
                .pairingCode(pair.pairingCode())
                .runnerName(RUNNER_NAME)
                .build();
        LocalRunnerConnectResponse connectResp = runnerService.connect(WORKSPACE_ID, USER_NAME, connectReq);
        UUID runnerId = connectResp.runnerId();
        assertThat(runnerId).isEqualTo(pair.runnerId());
        assertThat(connectResp.projectId()).isEqualTo(PROJECT_ID);
        assertThat(connectResp.projectName()).isEqualTo(PROJECT_NAME);

        LocalRunner.Agent agentMeta = LocalRunner.Agent.builder().build();
        runnerService.registerAgents(runnerId, WORKSPACE_ID, USER_NAME, Map.of(AGENT_NAME, agentMeta));

        LocalRunner.LocalRunnerPage runnerPage = runnerService.listRunners(WORKSPACE_ID, USER_NAME, PROJECT_ID, 0, 25);
        assertThat(runnerPage.content()).hasSize(1);
        assertThat(runnerPage.content().get(0).agents()).hasSize(1);

        stubNextId();
        ObjectNode inputs = MAPPER.createObjectNode();
        inputs.put("prompt", "hello");
        CreateLocalRunnerJobRequest jobReq = CreateLocalRunnerJobRequest.builder()
                .agentName(AGENT_NAME)
                .projectId(PROJECT_ID)
                .inputs(inputs)
                .build();
        UUID jobId = runnerService.createJob(WORKSPACE_ID, USER_NAME, jobReq);

        LocalRunnerJob created = runnerService.getJob(jobId, WORKSPACE_ID, USER_NAME);
        assertThat(created.status().getValue()).isEqualTo("pending");

        LocalRunnerJob claimed = runnerService.nextJob(runnerId, WORKSPACE_ID, USER_NAME).block();
        assertThat(claimed).isNotNull();
        assertThat(claimed.id()).isEqualTo(jobId);
        assertThat(claimed.status().getValue()).isEqualTo("running");

        LocalRunnerHeartbeatResponse hbResp = runnerService.heartbeat(runnerId, WORKSPACE_ID, USER_NAME, null);
        assertThat(hbResp.cancelledJobIds()).isEmpty();

        runnerService.appendLogs(claimed.id(), WORKSPACE_ID, USER_NAME,
                List.of(LocalRunnerLogEntry.builder().stream("stdout").text("Processing...").build()));

        UUID traceId = UUID.randomUUID();
        ObjectNode resultNode = MAPPER.createObjectNode();
        resultNode.put("answer", "world");
        runnerService.reportResult(claimed.id(), WORKSPACE_ID, USER_NAME,
                LocalRunnerJobResultRequest.builder()
                        .status(LocalRunnerJobStatus.COMPLETED)
                        .result(resultNode)
                        .traceId(traceId)
                        .build());

        LocalRunnerJob finalJob = runnerService.getJob(claimed.id(), WORKSPACE_ID, USER_NAME);
        assertThat(finalJob.status().getValue()).isEqualTo("completed");
        assertThat(finalJob.traceId()).isEqualTo(traceId);
        assertThat(finalJob.result().get("answer").asText()).isEqualTo("world");

        List<LocalRunnerLogEntry> logs = runnerService.getJobLogs(claimed.id(), 0, WORKSPACE_ID, USER_NAME);
        assertThat(logs).hasSize(1);
        assertThat(logs.get(0).text()).isEqualTo("Processing...");
    }

    @Nested
    class CrossUserIsolation {

        private static final String OTHER_USER = "other-user";

        @Test
        void listRunners_excludesOtherUsersRunners() {
            pairAndConnect(WORKSPACE_ID, USER_NAME, RUNNER_NAME);

            LocalRunner.LocalRunnerPage page = runnerService.listRunners(WORKSPACE_ID, OTHER_USER, PROJECT_ID, 0, 25);
            assertThat(page.content()).isEmpty();
            assertThat(page.total()).isZero();
        }

        @Test
        void getRunner_rejectsOtherUser() {
            UUID runnerId = pairAndConnect(WORKSPACE_ID, USER_NAME, RUNNER_NAME);

            assertThatThrownBy(() -> runnerService.getRunner(WORKSPACE_ID, OTHER_USER, runnerId))
                    .isExactlyInstanceOf(NotFoundException.class)
                    .hasMessageContaining("Runner not found");
        }

        @Test
        void registerAgents_rejectsOtherUser() {
            UUID runnerId = pairAndConnect(WORKSPACE_ID, USER_NAME, RUNNER_NAME);

            assertThatThrownBy(() -> runnerService.registerAgents(runnerId, WORKSPACE_ID, OTHER_USER,
                    Map.of(AGENT_NAME, LocalRunner.Agent.builder().build())))
                    .isExactlyInstanceOf(NotFoundException.class)
                    .hasMessageContaining("Runner not found");
        }

        @Test
        void heartbeat_rejectsOtherUser() {
            UUID runnerId = pairAndConnect(WORKSPACE_ID, USER_NAME, RUNNER_NAME);

            assertThatThrownBy(() -> runnerService.heartbeat(runnerId, WORKSPACE_ID, OTHER_USER, null))
                    .isExactlyInstanceOf(ClientErrorException.class)
                    .satisfies(e -> assertThat(((ClientErrorException) e).getResponse().getStatus()).isEqualTo(410));
        }

        @Test
        void createJob_rejectsOtherUsersRunner() {
            UUID runnerId = pairAndConnect(WORKSPACE_ID, USER_NAME, RUNNER_NAME);

            CreateLocalRunnerJobRequest req = CreateLocalRunnerJobRequest.builder()
                    .agentName(AGENT_NAME)
                    .projectId(PROJECT_ID)
                    .build();

            assertThatThrownBy(() -> runnerService.createJob(WORKSPACE_ID, OTHER_USER, req))
                    .isExactlyInstanceOf(NotFoundException.class);
        }

        @Test
        void nextJob_rejectsOtherUser() {
            UUID runnerId = pairAndConnect(WORKSPACE_ID, USER_NAME, RUNNER_NAME);

            assertThatThrownBy(() -> runnerService.nextJob(runnerId, WORKSPACE_ID, OTHER_USER))
                    .isExactlyInstanceOf(NotFoundException.class)
                    .hasMessageContaining("Runner not found");
        }

        @Test
        void listJobs_rejectsOtherUser() {
            UUID runnerId = pairAndConnect(WORKSPACE_ID, USER_NAME, RUNNER_NAME);

            assertThatThrownBy(() -> runnerService.listJobs(runnerId, null, WORKSPACE_ID, OTHER_USER, 0, 10))
                    .isExactlyInstanceOf(NotFoundException.class)
                    .hasMessageContaining("Runner not found");
        }

        @Test
        void getJob_rejectsOtherUser() {
            pairAndConnect(WORKSPACE_ID, USER_NAME, RUNNER_NAME);
            UUID jobId = createTestJob(WORKSPACE_ID, USER_NAME, AGENT_NAME);

            assertThatThrownBy(() -> runnerService.getJob(jobId, WORKSPACE_ID, OTHER_USER))
                    .isExactlyInstanceOf(NotFoundException.class)
                    .hasMessageContaining("not found");
        }

        @Test
        void getJobLogs_rejectsOtherUser() {
            pairAndConnect(WORKSPACE_ID, USER_NAME, RUNNER_NAME);
            UUID jobId = createTestJob(WORKSPACE_ID, USER_NAME, AGENT_NAME);

            assertThatThrownBy(() -> runnerService.getJobLogs(jobId, 0, WORKSPACE_ID, OTHER_USER))
                    .isExactlyInstanceOf(NotFoundException.class)
                    .hasMessageContaining("not found");
        }

        @Test
        void appendLogs_rejectsOtherUser() {
            pairAndConnect(WORKSPACE_ID, USER_NAME, RUNNER_NAME);
            UUID jobId = createTestJob(WORKSPACE_ID, USER_NAME, AGENT_NAME);

            assertThatThrownBy(() -> runnerService.appendLogs(jobId, WORKSPACE_ID, OTHER_USER,
                    List.of(LocalRunnerLogEntry.builder().stream("stdout").text("hack").build())))
                    .isExactlyInstanceOf(NotFoundException.class)
                    .hasMessageContaining("not found");
        }

        @Test
        void reportResult_rejectsOtherUser() {
            UUID runnerId = pairAndConnect(WORKSPACE_ID, USER_NAME, RUNNER_NAME);
            UUID jobId = createTestJob(WORKSPACE_ID, USER_NAME, AGENT_NAME);
            runnerService.nextJob(runnerId, WORKSPACE_ID, USER_NAME).block();

            assertThatThrownBy(() -> runnerService.reportResult(jobId, WORKSPACE_ID, OTHER_USER,
                    LocalRunnerJobResultRequest.builder().status(LocalRunnerJobStatus.COMPLETED).build()))
                    .isExactlyInstanceOf(NotFoundException.class)
                    .hasMessageContaining("not found");
        }

        @Test
        void cancelJob_rejectsOtherUser() {
            pairAndConnect(WORKSPACE_ID, USER_NAME, RUNNER_NAME);
            UUID jobId = createTestJob(WORKSPACE_ID, USER_NAME, AGENT_NAME);

            assertThatThrownBy(() -> runnerService.cancelJob(jobId, WORKSPACE_ID, OTHER_USER))
                    .isExactlyInstanceOf(NotFoundException.class)
                    .hasMessageContaining("not found");
        }
    }

    private UUID pairAndConnectWithBridge(String workspaceId, String userName, String runnerName) {
        UUID runnerId = pairAndConnect(workspaceId, userName, runnerName);
        runnerService.heartbeat(runnerId, workspaceId, userName, List.of("jobs", "bridge"));
        return runnerId;
    }

    private CreateBridgeCommandRequest readFileRequest() {
        return CreateBridgeCommandRequest.builder()
                .type("read_file")
                .args(MAPPER.createObjectNode().put("path", "src/agent.py"))
                .timeoutSeconds(10)
                .build();
    }

    private CreateBridgeCommandRequest writeFileRequest() {
        return CreateBridgeCommandRequest.builder()
                .type("write_file")
                .args(MAPPER.createObjectNode().put("path", "src/agent.py").put("content", "data"))
                .timeoutSeconds(10)
                .build();
    }

    @Nested
    class CreateBridgeCommand {

        @Test
        void setsStatusPendingAndAddsToPendingList() {
            UUID runnerId = pairAndConnectWithBridge(WORKSPACE_ID, USER_NAME, RUNNER_NAME);
            stubNextId();
            UUID commandId = runnerService.createBridgeCommand(runnerId, WORKSPACE_ID, USER_NAME, readFileRequest());

            RMap<String, String> cmdMap = stringRedis.getMap("opik:runners:bridge:" + commandId);
            assertThat(cmdMap.get("status")).isEqualTo("pending");
            assertThat(cmdMap.get("type")).isEqualTo("read_file");
            assertThat(cmdMap.get("runner_id")).isEqualTo(runnerId.toString());
            assertThat(cmdMap.get("submitted_at")).isNotBlank();
            assertThat(cmdMap.remainTimeToLive()).isPositive();

            RList<String> pending = stringRedis.getList("opik:runners:bridge:" + runnerId + ":pending");
            assertThat(pending.readAll()).contains(commandId.toString());
        }

        @Test
        void unknownRunner_throws404() {
            UUID fakeRunner = UUID.randomUUID();
            assertThatThrownBy(() -> runnerService.createBridgeCommand(fakeRunner, WORKSPACE_ID, USER_NAME,
                    readFileRequest()))
                    .isExactlyInstanceOf(NotFoundException.class);
        }

        @Test
        void disconnectedRunner_throws404() throws InterruptedException {
            UUID runnerId = pairAndConnectWithBridge(WORKSPACE_ID, USER_NAME, RUNNER_NAME);
            waitForHeartbeatExpiry();

            stubNextId();
            assertThatThrownBy(() -> runnerService.createBridgeCommand(runnerId, WORKSPACE_ID, USER_NAME,
                    readFileRequest()))
                    .isExactlyInstanceOf(NotFoundException.class);
        }

        @Test
        void noBridgeCapability_throws409() {
            UUID runnerId = pairAndConnect(WORKSPACE_ID, USER_NAME, RUNNER_NAME);
            runnerService.heartbeat(runnerId, WORKSPACE_ID, USER_NAME, List.of("jobs"));

            stubNextId();
            assertThatThrownBy(() -> runnerService.createBridgeCommand(runnerId, WORKSPACE_ID, USER_NAME,
                    readFileRequest()))
                    .isExactlyInstanceOf(ClientErrorException.class)
                    .satisfies(e -> assertThat(((ClientErrorException) e).getResponse().getStatus()).isEqualTo(409));
        }

        @Test
        void queueFull_throws429() {
            UUID runnerId = pairAndConnectWithBridge(WORKSPACE_ID, USER_NAME, RUNNER_NAME);

            for (int i = 0; i < runnerConfig.getMaxPendingBridgeCommandsPerRunner(); i++) {
                stubNextId();
                runnerService.createBridgeCommand(runnerId, WORKSPACE_ID, USER_NAME, readFileRequest());
            }

            stubNextId();
            assertThatThrownBy(() -> runnerService.createBridgeCommand(runnerId, WORKSPACE_ID, USER_NAME,
                    readFileRequest()))
                    .isExactlyInstanceOf(ClientErrorException.class)
                    .satisfies(e -> assertThat(((ClientErrorException) e).getResponse().getStatus()).isEqualTo(429));
        }

        @Test
        void rateLimitExceeded_throws429() {
            UUID runnerId = pairAndConnectWithBridge(WORKSPACE_ID, USER_NAME, RUNNER_NAME);
            runnerConfig.setMaxBridgeCommandsPerMinute(3);
            runnerConfig.setMaxPendingBridgeCommandsPerRunner(100);

            try {
                for (int i = 0; i < 3; i++) {
                    stubNextId();
                    runnerService.createBridgeCommand(runnerId, WORKSPACE_ID, USER_NAME, readFileRequest());
                }

                stubNextId();
                assertThatThrownBy(() -> runnerService.createBridgeCommand(runnerId, WORKSPACE_ID, USER_NAME,
                        readFileRequest()))
                        .isExactlyInstanceOf(ClientErrorException.class)
                        .satisfies(
                                e -> assertThat(((ClientErrorException) e).getResponse().getStatus()).isEqualTo(429));
            } finally {
                runnerConfig.setMaxBridgeCommandsPerMinute(60);
                runnerConfig.setMaxPendingBridgeCommandsPerRunner(20);
            }
        }

        @Test
        void writeRateLimitExceeded_throws429() {
            UUID runnerId = pairAndConnectWithBridge(WORKSPACE_ID, USER_NAME, RUNNER_NAME);
            runnerConfig.setMaxWriteBridgeCommandsPerMinute(2);
            runnerConfig.setMaxPendingBridgeCommandsPerRunner(100);

            try {
                for (int i = 0; i < 2; i++) {
                    stubNextId();
                    runnerService.createBridgeCommand(runnerId, WORKSPACE_ID, USER_NAME, writeFileRequest());
                }

                stubNextId();
                assertThatThrownBy(() -> runnerService.createBridgeCommand(runnerId, WORKSPACE_ID, USER_NAME,
                        writeFileRequest()))
                        .isExactlyInstanceOf(ClientErrorException.class)
                        .satisfies(
                                e -> assertThat(((ClientErrorException) e).getResponse().getStatus()).isEqualTo(429));
            } finally {
                runnerConfig.setMaxWriteBridgeCommandsPerMinute(10);
                runnerConfig.setMaxPendingBridgeCommandsPerRunner(20);
            }
        }
    }

    @Nested
    class GetBridgeCommand {

        @Test
        void exists_returnsFullState() {
            UUID runnerId = pairAndConnectWithBridge(WORKSPACE_ID, USER_NAME, RUNNER_NAME);
            stubNextId();
            UUID commandId = runnerService.createBridgeCommand(runnerId, WORKSPACE_ID, USER_NAME, readFileRequest());

            BridgeCommand cmd = runnerService.getBridgeCommand(runnerId, commandId, WORKSPACE_ID, USER_NAME);
            assertThat(cmd.commandId()).isEqualTo(commandId);
            assertThat(cmd.runnerId()).isEqualTo(runnerId);
            assertThat(cmd.type()).isEqualTo("read_file");
            assertThat(cmd.status()).isEqualTo(BridgeCommandStatus.PENDING);
            assertThat(cmd.submittedAt()).isNotNull();
        }

        @Test
        void expired_throws404() {
            UUID runnerId = pairAndConnectWithBridge(WORKSPACE_ID, USER_NAME, RUNNER_NAME);
            UUID fakeCommandId = UUID.randomUUID();

            assertThatThrownBy(
                    () -> runnerService.getBridgeCommand(runnerId, fakeCommandId, WORKSPACE_ID, USER_NAME))
                    .isExactlyInstanceOf(NotFoundException.class);
        }
    }

    @Nested
    class NextBridgeCommands {

        @Test
        void singlePending_returnsOne() {
            UUID runnerId = pairAndConnectWithBridge(WORKSPACE_ID, USER_NAME, RUNNER_NAME);
            stubNextId();
            UUID commandId = runnerService.createBridgeCommand(runnerId, WORKSPACE_ID, USER_NAME, readFileRequest());

            BridgeNextResponse resp = runnerService.nextBridgeCommands(runnerId, WORKSPACE_ID, USER_NAME, 10).block();
            assertThat(resp).isNotNull();
            assertThat(resp.commands()).hasSize(1);
            assertThat(resp.commands().get(0).commandId()).isEqualTo(commandId);
            assertThat(resp.commands().get(0).type()).isEqualTo("read_file");
        }

        @Test
        void multiplePending_returnsBatch() {
            UUID runnerId = pairAndConnectWithBridge(WORKSPACE_ID, USER_NAME, RUNNER_NAME);
            for (int i = 0; i < 5; i++) {
                stubNextId();
                runnerService.createBridgeCommand(runnerId, WORKSPACE_ID, USER_NAME, readFileRequest());
            }

            BridgeNextResponse resp = runnerService.nextBridgeCommands(runnerId, WORKSPACE_ID, USER_NAME, 10).block();
            assertThat(resp).isNotNull();
            assertThat(resp.commands()).hasSize(5);
        }

        @Test
        void noPending_blocksAndReturnsEmpty() {
            UUID runnerId = pairAndConnectWithBridge(WORKSPACE_ID, USER_NAME, RUNNER_NAME);
            runnerConfig.setBridgeNextPollTimeout(io.dropwizard.util.Duration.seconds(1));

            try {
                BridgeNextResponse resp = runnerService.nextBridgeCommands(runnerId, WORKSPACE_ID, USER_NAME, 10)
                        .block();
                assertThat(resp).isNotNull();
                assertThat(resp.commands()).isEmpty();
            } finally {
                runnerConfig.setBridgeNextPollTimeout(io.dropwizard.util.Duration.seconds(30));
            }
        }

        @Test
        void marksPickedUpAndMovesToActive() {
            UUID runnerId = pairAndConnectWithBridge(WORKSPACE_ID, USER_NAME, RUNNER_NAME);
            stubNextId();
            UUID commandId = runnerService.createBridgeCommand(runnerId, WORKSPACE_ID, USER_NAME, readFileRequest());

            runnerService.nextBridgeCommands(runnerId, WORKSPACE_ID, USER_NAME, 10).block();

            RMap<String, String> cmdMap = stringRedis.getMap("opik:runners:bridge:" + commandId);
            assertThat(cmdMap.get("status")).isEqualTo("picked_up");
            assertThat(cmdMap.get("picked_up_at")).isNotBlank();

            RSet<String> activeSet = stringRedis.getSet("opik:runners:bridge:" + runnerId + ":active");
            assertThat(activeSet.contains(commandId.toString())).isTrue();

            RList<String> pending = stringRedis.getList("opik:runners:bridge:" + runnerId + ":pending");
            assertThat(pending.readAll()).doesNotContain(commandId.toString());
        }

        @Test
        void respectsMaxCommands() {
            UUID runnerId = pairAndConnectWithBridge(WORKSPACE_ID, USER_NAME, RUNNER_NAME);
            for (int i = 0; i < 5; i++) {
                stubNextId();
                runnerService.createBridgeCommand(runnerId, WORKSPACE_ID, USER_NAME, readFileRequest());
            }

            BridgeNextResponse resp = runnerService.nextBridgeCommands(runnerId, WORKSPACE_ID, USER_NAME, 3).block();
            assertThat(resp).isNotNull();
            assertThat(resp.commands()).hasSize(3);

            RList<String> pending = stringRedis.getList("opik:runners:bridge:" + runnerId + ":pending");
            assertThat(pending.size()).isEqualTo(2);
        }

        @Test
        void evictedRunner_throws410() throws InterruptedException {
            UUID runnerId = pairAndConnectWithBridge(WORKSPACE_ID, USER_NAME, RUNNER_NAME);
            waitForHeartbeatExpiry();

            assertThatThrownBy(
                    () -> runnerService.nextBridgeCommands(runnerId, WORKSPACE_ID, USER_NAME, 10).block())
                    .isExactlyInstanceOf(ClientErrorException.class)
                    .satisfies(e -> assertThat(((ClientErrorException) e).getResponse().getStatus()).isEqualTo(410));
        }
    }

    @Nested
    class ReportBridgeResult {

        @Test
        void completed_updatesHashRemovesFromActiveWritesDone() {
            UUID runnerId = pairAndConnectWithBridge(WORKSPACE_ID, USER_NAME, RUNNER_NAME);
            stubNextId();
            UUID commandId = runnerService.createBridgeCommand(runnerId, WORKSPACE_ID, USER_NAME, readFileRequest());
            runnerService.nextBridgeCommands(runnerId, WORKSPACE_ID, USER_NAME, 10).block();

            ObjectNode resultData = MAPPER.createObjectNode().put("content", "file data");
            runnerService.reportBridgeCommandResult(runnerId, commandId, WORKSPACE_ID, USER_NAME,
                    BridgeCommandResultRequest.builder()
                            .status(BridgeCommandStatus.COMPLETED)
                            .result(resultData)
                            .durationMs(12L)
                            .build());

            RMap<String, String> cmdMap = stringRedis.getMap("opik:runners:bridge:" + commandId);
            assertThat(cmdMap.get("status")).isEqualTo("completed");
            assertThat(cmdMap.get("completed_at")).isNotBlank();
            assertThat(cmdMap.get("result")).contains("file data");
            assertThat(cmdMap.get("duration_ms")).isEqualTo("12");

            RSet<String> activeSet = stringRedis.getSet("opik:runners:bridge:" + runnerId + ":active");
            assertThat(activeSet.contains(commandId.toString())).isFalse();

            RList<String> doneQueue = stringRedis.getList("opik:runners:bridge:" + commandId + ":done");
            assertThat(doneQueue.size()).isEqualTo(1);
        }

        @Test
        void failed_updatesHashWithError() {
            UUID runnerId = pairAndConnectWithBridge(WORKSPACE_ID, USER_NAME, RUNNER_NAME);
            stubNextId();
            UUID commandId = runnerService.createBridgeCommand(runnerId, WORKSPACE_ID, USER_NAME, readFileRequest());
            runnerService.nextBridgeCommands(runnerId, WORKSPACE_ID, USER_NAME, 10).block();

            runnerService.reportBridgeCommandResult(runnerId, commandId, WORKSPACE_ID, USER_NAME,
                    BridgeCommandResultRequest.builder()
                            .status(BridgeCommandStatus.FAILED)
                            .error(BridgeCommandError.builder().code("file_not_found").message("Not found").build())
                            .build());

            RMap<String, String> cmdMap = stringRedis.getMap("opik:runners:bridge:" + commandId);
            assertThat(cmdMap.get("status")).isEqualTo("failed");
            assertThat(cmdMap.get("error")).contains("file_not_found");
        }

        @Test
        void duplicate_throws409() {
            UUID runnerId = pairAndConnectWithBridge(WORKSPACE_ID, USER_NAME, RUNNER_NAME);
            stubNextId();
            UUID commandId = runnerService.createBridgeCommand(runnerId, WORKSPACE_ID, USER_NAME, readFileRequest());
            runnerService.nextBridgeCommands(runnerId, WORKSPACE_ID, USER_NAME, 10).block();

            runnerService.reportBridgeCommandResult(runnerId, commandId, WORKSPACE_ID, USER_NAME,
                    BridgeCommandResultRequest.builder()
                            .status(BridgeCommandStatus.COMPLETED)
                            .result(MAPPER.createObjectNode())
                            .build());

            assertThatThrownBy(() -> runnerService.reportBridgeCommandResult(runnerId, commandId, WORKSPACE_ID,
                    USER_NAME,
                    BridgeCommandResultRequest.builder()
                            .status(BridgeCommandStatus.COMPLETED)
                            .result(MAPPER.createObjectNode())
                            .build()))
                    .isExactlyInstanceOf(ClientErrorException.class)
                    .satisfies(e -> assertThat(((ClientErrorException) e).getResponse().getStatus()).isEqualTo(409));
        }

        @Test
        void commandNotOwned_throws404() {
            UUID runnerId = pairAndConnectWithBridge(WORKSPACE_ID, USER_NAME, RUNNER_NAME);
            UUID fakeCommandId = UUID.randomUUID();

            assertThatThrownBy(() -> runnerService.reportBridgeCommandResult(runnerId, fakeCommandId, WORKSPACE_ID,
                    USER_NAME,
                    BridgeCommandResultRequest.builder().status(BridgeCommandStatus.COMPLETED).build()))
                    .isExactlyInstanceOf(NotFoundException.class);
        }

        @Test
        void writesToDoneQueue() {
            UUID runnerId = pairAndConnectWithBridge(WORKSPACE_ID, USER_NAME, RUNNER_NAME);
            stubNextId();
            UUID commandId = runnerService.createBridgeCommand(runnerId, WORKSPACE_ID, USER_NAME, readFileRequest());
            runnerService.nextBridgeCommands(runnerId, WORKSPACE_ID, USER_NAME, 10).block();

            runnerService.reportBridgeCommandResult(runnerId, commandId, WORKSPACE_ID, USER_NAME,
                    BridgeCommandResultRequest.builder()
                            .status(BridgeCommandStatus.COMPLETED)
                            .result(MAPPER.createObjectNode())
                            .build());

            RList<String> doneQueue = stringRedis.getList("opik:runners:bridge:" + commandId + ":done");
            assertThat(doneQueue.size()).isGreaterThanOrEqualTo(1);
        }
    }

    @Nested
    class CancelBridgeCommand {

        @Test
        void pending_removesFromQueueMarksCancelled() {
            UUID runnerId = pairAndConnectWithBridge(WORKSPACE_ID, USER_NAME, RUNNER_NAME);
            stubNextId();
            UUID commandId = runnerService.createBridgeCommand(runnerId, WORKSPACE_ID, USER_NAME, readFileRequest());

            runnerService.cancelBridgeCommand(runnerId, commandId, WORKSPACE_ID, USER_NAME);

            RMap<String, String> cmdMap = stringRedis.getMap("opik:runners:bridge:" + commandId);
            assertThat(cmdMap.get("status")).isEqualTo("cancelled");

            RList<String> pending = stringRedis.getList("opik:runners:bridge:" + runnerId + ":pending");
            assertThat(pending.readAll()).doesNotContain(commandId.toString());
        }

        @Test
        void pending_writesDoneSentinel() {
            UUID runnerId = pairAndConnectWithBridge(WORKSPACE_ID, USER_NAME, RUNNER_NAME);
            stubNextId();
            UUID commandId = runnerService.createBridgeCommand(runnerId, WORKSPACE_ID, USER_NAME, readFileRequest());

            runnerService.cancelBridgeCommand(runnerId, commandId, WORKSPACE_ID, USER_NAME);

            RList<String> doneQueue = stringRedis.getList("opik:runners:bridge:" + commandId + ":done");
            assertThat(doneQueue.size()).isGreaterThanOrEqualTo(1);
        }

        @Test
        void active_addsToCancellationSet() {
            UUID runnerId = pairAndConnectWithBridge(WORKSPACE_ID, USER_NAME, RUNNER_NAME);
            stubNextId();
            UUID commandId = runnerService.createBridgeCommand(runnerId, WORKSPACE_ID, USER_NAME, readFileRequest());
            runnerService.nextBridgeCommands(runnerId, WORKSPACE_ID, USER_NAME, 10).block();

            runnerService.cancelBridgeCommand(runnerId, commandId, WORKSPACE_ID, USER_NAME);

            RSet<String> cancellations = stringRedis.getSet("opik:runners:bridge:" + runnerId + ":cancellations");
            assertThat(cancellations.contains(commandId.toString())).isTrue();
        }

        @Test
        void active_writesDoneSentinel() {
            UUID runnerId = pairAndConnectWithBridge(WORKSPACE_ID, USER_NAME, RUNNER_NAME);
            stubNextId();
            UUID commandId = runnerService.createBridgeCommand(runnerId, WORKSPACE_ID, USER_NAME, readFileRequest());
            runnerService.nextBridgeCommands(runnerId, WORKSPACE_ID, USER_NAME, 10).block();

            runnerService.cancelBridgeCommand(runnerId, commandId, WORKSPACE_ID, USER_NAME);

            RList<String> doneQueue = stringRedis.getList("opik:runners:bridge:" + commandId + ":done");
            assertThat(doneQueue.size()).isGreaterThanOrEqualTo(1);
        }

        @Test
        void alreadyCompleted_throws409() {
            UUID runnerId = pairAndConnectWithBridge(WORKSPACE_ID, USER_NAME, RUNNER_NAME);
            stubNextId();
            UUID commandId = runnerService.createBridgeCommand(runnerId, WORKSPACE_ID, USER_NAME, readFileRequest());
            runnerService.nextBridgeCommands(runnerId, WORKSPACE_ID, USER_NAME, 10).block();

            runnerService.reportBridgeCommandResult(runnerId, commandId, WORKSPACE_ID, USER_NAME,
                    BridgeCommandResultRequest.builder()
                            .status(BridgeCommandStatus.COMPLETED)
                            .result(MAPPER.createObjectNode())
                            .build());

            assertThatThrownBy(
                    () -> runnerService.cancelBridgeCommand(runnerId, commandId, WORKSPACE_ID, USER_NAME))
                    .isExactlyInstanceOf(ClientErrorException.class)
                    .satisfies(e -> assertThat(((ClientErrorException) e).getResponse().getStatus()).isEqualTo(409));
        }

        @Test
        void notFound_throws404() {
            UUID runnerId = pairAndConnectWithBridge(WORKSPACE_ID, USER_NAME, RUNNER_NAME);
            UUID fakeCommandId = UUID.randomUUID();

            assertThatThrownBy(
                    () -> runnerService.cancelBridgeCommand(runnerId, fakeCommandId, WORKSPACE_ID, USER_NAME))
                    .isExactlyInstanceOf(NotFoundException.class);
        }
    }

    @Nested
    class AwaitBridgeCommand {

        @Test
        void alreadyCompleted_returnsImmediately() {
            UUID runnerId = pairAndConnectWithBridge(WORKSPACE_ID, USER_NAME, RUNNER_NAME);
            stubNextId();
            UUID commandId = runnerService.createBridgeCommand(runnerId, WORKSPACE_ID, USER_NAME, readFileRequest());
            runnerService.nextBridgeCommands(runnerId, WORKSPACE_ID, USER_NAME, 10).block();

            runnerService.reportBridgeCommandResult(runnerId, commandId, WORKSPACE_ID, USER_NAME,
                    BridgeCommandResultRequest.builder()
                            .status(BridgeCommandStatus.COMPLETED)
                            .result(MAPPER.createObjectNode().put("content", "done"))
                            .build());

            BridgeCommand cmd = runnerService
                    .awaitBridgeCommand(runnerId, commandId, WORKSPACE_ID, USER_NAME, 5).block();
            assertThat(cmd).isNotNull();
            assertThat(cmd.status()).isEqualTo(BridgeCommandStatus.COMPLETED);
        }

        @Test
        void pendingThenCompleted_blocksAndReturns() {
            UUID runnerId = pairAndConnectWithBridge(WORKSPACE_ID, USER_NAME, RUNNER_NAME);
            stubNextId();
            UUID commandId = runnerService.createBridgeCommand(runnerId, WORKSPACE_ID, USER_NAME, readFileRequest());
            runnerService.nextBridgeCommands(runnerId, WORKSPACE_ID, USER_NAME, 10).block();

            new Thread(() -> {
                try {
                    Thread.sleep(500);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
                runnerService.reportBridgeCommandResult(runnerId, commandId, WORKSPACE_ID, USER_NAME,
                        BridgeCommandResultRequest.builder()
                                .status(BridgeCommandStatus.COMPLETED)
                                .result(MAPPER.createObjectNode().put("content", "async"))
                                .build());
            }).start();

            BridgeCommand cmd = runnerService
                    .awaitBridgeCommand(runnerId, commandId, WORKSPACE_ID, USER_NAME, 10).block();
            assertThat(cmd).isNotNull();
            assertThat(cmd.status()).isEqualTo(BridgeCommandStatus.COMPLETED);
        }

        @Test
        void pendingThenCancelled_blocksAndReturns() {
            UUID runnerId = pairAndConnectWithBridge(WORKSPACE_ID, USER_NAME, RUNNER_NAME);
            stubNextId();
            UUID commandId = runnerService.createBridgeCommand(runnerId, WORKSPACE_ID, USER_NAME, readFileRequest());

            new Thread(() -> {
                try {
                    Thread.sleep(500);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
                runnerService.cancelBridgeCommand(runnerId, commandId, WORKSPACE_ID, USER_NAME);
            }).start();

            BridgeCommand cmd = runnerService
                    .awaitBridgeCommand(runnerId, commandId, WORKSPACE_ID, USER_NAME, 10).block();
            assertThat(cmd).isNotNull();
            assertThat(cmd.status()).isEqualTo(BridgeCommandStatus.CANCELLED);
        }

        @Test
        void timeout_returnsNonTerminal() {
            UUID runnerId = pairAndConnectWithBridge(WORKSPACE_ID, USER_NAME, RUNNER_NAME);
            stubNextId();
            UUID commandId = runnerService.createBridgeCommand(runnerId, WORKSPACE_ID, USER_NAME, readFileRequest());

            BridgeCommand cmd = runnerService
                    .awaitBridgeCommand(runnerId, commandId, WORKSPACE_ID, USER_NAME, 1).block();
            assertThat(cmd).isNotNull();
            assertThat(cmd.status()).isEqualTo(BridgeCommandStatus.PENDING);
        }

        @Test
        void noWait_returnsCurrentState() {
            UUID runnerId = pairAndConnectWithBridge(WORKSPACE_ID, USER_NAME, RUNNER_NAME);
            stubNextId();
            UUID commandId = runnerService.createBridgeCommand(runnerId, WORKSPACE_ID, USER_NAME, readFileRequest());

            BridgeCommand cmd = runnerService.getBridgeCommand(runnerId, commandId, WORKSPACE_ID, USER_NAME);
            assertThat(cmd.status()).isEqualTo(BridgeCommandStatus.PENDING);
        }
    }

    @Nested
    class HeartbeatBridge {

        @Test
        void withCapabilities_storesOnRunner() {
            UUID runnerId = pairAndConnect(WORKSPACE_ID, USER_NAME, RUNNER_NAME);
            runnerService.heartbeat(runnerId, WORKSPACE_ID, USER_NAME, List.of("jobs", "bridge"));

            RMap<String, String> runnerMap = stringRedis.getMap("opik:runners:runner:" + runnerId);
            String caps = runnerMap.get("capabilities");
            assertThat(caps).contains("bridge");
            assertThat(caps).contains("jobs");
        }

        @Test
        void withoutCapabilities_defaultsToJobs() {
            UUID runnerId = pairAndConnect(WORKSPACE_ID, USER_NAME, RUNNER_NAME);
            runnerService.heartbeat(runnerId, WORKSPACE_ID, USER_NAME, null);

            RMap<String, String> runnerMap = stringRedis.getMap("opik:runners:runner:" + runnerId);
            String caps = runnerMap.get("capabilities");
            assertThat(caps).contains("jobs");
            assertThat(caps).doesNotContain("bridge");
        }

        @Test
        void returnsCancelledCommandIds_andDrainsSet() {
            UUID runnerId = pairAndConnectWithBridge(WORKSPACE_ID, USER_NAME, RUNNER_NAME);
            stubNextId();
            UUID commandId = runnerService.createBridgeCommand(runnerId, WORKSPACE_ID, USER_NAME, readFileRequest());
            runnerService.nextBridgeCommands(runnerId, WORKSPACE_ID, USER_NAME, 10).block();
            runnerService.cancelBridgeCommand(runnerId, commandId, WORKSPACE_ID, USER_NAME);

            LocalRunnerHeartbeatResponse resp = runnerService.heartbeat(runnerId, WORKSPACE_ID, USER_NAME,
                    List.of("jobs", "bridge"));
            assertThat(resp.cancelledCommandIds()).contains(commandId);

            LocalRunnerHeartbeatResponse resp2 = runnerService.heartbeat(runnerId, WORKSPACE_ID, USER_NAME,
                    List.of("jobs", "bridge"));
            assertThat(resp2.cancelledCommandIds()).isEmpty();
        }

        @Test
        void getRunner_includesCapabilities() {
            UUID runnerId = pairAndConnect(WORKSPACE_ID, USER_NAME, RUNNER_NAME);
            runnerService.heartbeat(runnerId, WORKSPACE_ID, USER_NAME, List.of("jobs", "bridge"));

            LocalRunner runner = runnerService.getRunner(WORKSPACE_ID, USER_NAME, runnerId);
            assertThat(runner.capabilities()).containsExactlyInAnyOrder("jobs", "bridge");
        }
    }

    @Nested
    class ReaperBridge {

        @Test
        void deadRunner_marksCommandsTimedOut() throws InterruptedException {
            UUID runnerId = pairAndConnectWithBridge(WORKSPACE_ID, USER_NAME, RUNNER_NAME);
            stubNextId();
            UUID commandId = runnerService.createBridgeCommand(runnerId, WORKSPACE_ID, USER_NAME, readFileRequest());

            waitForHeartbeatExpiry();
            runnerService.reapDeadRunners();

            RMap<String, String> cmdMap = stringRedis.getMap("opik:runners:bridge:" + commandId);
            assertThat(cmdMap.get("status")).isEqualTo("timed_out");
        }

        @Test
        void deadRunner_writesDoneSentinels() throws InterruptedException {
            UUID runnerId = pairAndConnectWithBridge(WORKSPACE_ID, USER_NAME, RUNNER_NAME);
            stubNextId();
            UUID commandId = runnerService.createBridgeCommand(runnerId, WORKSPACE_ID, USER_NAME, readFileRequest());

            waitForHeartbeatExpiry();
            runnerService.reapDeadRunners();

            RList<String> doneQueue = stringRedis.getList("opik:runners:bridge:" + commandId + ":done");
            assertThat(doneQueue.size()).isGreaterThanOrEqualTo(1);
        }

        @Test
        void activeCommandPastDeadline_marksTimedOut() {
            UUID runnerId = pairAndConnectWithBridge(WORKSPACE_ID, USER_NAME, RUNNER_NAME);

            stubNextId();
            CreateBridgeCommandRequest req = CreateBridgeCommandRequest.builder()
                    .type("read_file")
                    .args(MAPPER.createObjectNode().put("path", "test.py"))
                    .timeoutSeconds(1)
                    .build();
            UUID commandId = runnerService.createBridgeCommand(runnerId, WORKSPACE_ID, USER_NAME, req);
            runnerService.nextBridgeCommands(runnerId, WORKSPACE_ID, USER_NAME, 10).block();

            RMap<String, String> cmdMap = stringRedis.getMap("opik:runners:bridge:" + commandId);
            cmdMap.put("picked_up_at", Instant.now().minusSeconds(20).toString());

            runnerService.reapDeadRunners();

            assertThat(cmdMap.get("status")).isEqualTo("timed_out");
        }
    }

    @Nested
    class CommandTTL {

        @Test
        void pendingExpiresAfterTimeoutPlusGrace() {
            UUID runnerId = pairAndConnectWithBridge(WORKSPACE_ID, USER_NAME, RUNNER_NAME);
            stubNextId();
            CreateBridgeCommandRequest req = CreateBridgeCommandRequest.builder()
                    .type("read_file")
                    .args(MAPPER.createObjectNode().put("path", "test.py"))
                    .timeoutSeconds(5)
                    .build();
            UUID commandId = runnerService.createBridgeCommand(runnerId, WORKSPACE_ID, USER_NAME, req);

            RMap<String, String> cmdMap = stringRedis.getMap("opik:runners:bridge:" + commandId);
            long ttl = cmdMap.remainTimeToLive();
            assertThat(ttl).isPositive();
            assertThat(ttl).isLessThanOrEqualTo(35_000L);
        }

        @Test
        void completedExpiresAfterOneHour() {
            UUID runnerId = pairAndConnectWithBridge(WORKSPACE_ID, USER_NAME, RUNNER_NAME);
            stubNextId();
            UUID commandId = runnerService.createBridgeCommand(runnerId, WORKSPACE_ID, USER_NAME, readFileRequest());
            runnerService.nextBridgeCommands(runnerId, WORKSPACE_ID, USER_NAME, 10).block();

            runnerService.reportBridgeCommandResult(runnerId, commandId, WORKSPACE_ID, USER_NAME,
                    BridgeCommandResultRequest.builder()
                            .status(BridgeCommandStatus.COMPLETED)
                            .result(MAPPER.createObjectNode())
                            .build());

            RMap<String, String> cmdMap = stringRedis.getMap("opik:runners:bridge:" + commandId);
            long ttl = cmdMap.remainTimeToLive();
            assertThat(ttl).isPositive();
            assertThat(ttl).isLessThanOrEqualTo(3_600_000L);
        }
    }

    private RunnerChecklist fullChecklist() {
        return RunnerChecklist.builder()
                .command("python app.py")
                .fileTree("app.py\nrequirements.txt\nsrc/\nsrc/agent.py")
                .instrumentation(RunnerChecklist.Instrumentation.builder()
                        .tracing(true).entrypoint(true).configuration(false).build())
                .instrumentationMatches(List.of("app.py:8:import opik", "app.py:14:@opik.track(entrypoint=True)"))
                .build();
    }

    @Nested
    class PutChecklist {

        @Test
        void storesChecklistOnRunner() {
            UUID runnerId = pairAndConnect(WORKSPACE_ID, USER_NAME, RUNNER_NAME);
            runnerService.putChecklist(runnerId, WORKSPACE_ID, USER_NAME, fullChecklist());

            RMap<String, String> runnerMap = stringRedis.getMap("opik:runners:runner:" + runnerId);
            String json = runnerMap.get("checklist");
            assertThat(json).contains("python app.py");
            assertThat(json).contains("app.py\\nrequirements.txt");
            assertThat(json).contains("\"tracing\":true");
        }

        @Test
        void overwritesPreviousChecklist() {
            UUID runnerId = pairAndConnect(WORKSPACE_ID, USER_NAME, RUNNER_NAME);
            runnerService.putChecklist(runnerId, WORKSPACE_ID, USER_NAME, fullChecklist());

            RunnerChecklist updated = RunnerChecklist.builder()
                    .command("python main.py")
                    .fileTree("main.py")
                    .build();
            runnerService.putChecklist(runnerId, WORKSPACE_ID, USER_NAME, updated);

            RMap<String, String> runnerMap = stringRedis.getMap("opik:runners:runner:" + runnerId);
            String json = runnerMap.get("checklist");
            assertThat(json).contains("python main.py");
            assertThat(json).doesNotContain("python app.py");
        }

        @Test
        void unknownRunner_throws404() {
            UUID fakeRunner = UUID.randomUUID();
            assertThatThrownBy(() -> runnerService.putChecklist(fakeRunner, WORKSPACE_ID, USER_NAME, fullChecklist()))
                    .isExactlyInstanceOf(NotFoundException.class);
        }

        @Test
        void visibleInGetRunner() {
            UUID runnerId = pairAndConnect(WORKSPACE_ID, USER_NAME, RUNNER_NAME);
            runnerService.putChecklist(runnerId, WORKSPACE_ID, USER_NAME, fullChecklist());

            LocalRunner runner = runnerService.getRunner(WORKSPACE_ID, USER_NAME, runnerId);
            assertThat(runner.checklist()).isNotNull();
            assertThat(runner.checklist().command()).isEqualTo("python app.py");
            assertThat(runner.checklist().instrumentation().tracing()).isTrue();
            assertThat(runner.checklist().instrumentation().entrypoint()).isTrue();
            assertThat(runner.checklist().instrumentation().configuration()).isFalse();
            assertThat(runner.checklist().instrumentationMatches()).hasSize(2);
        }

        @Test
        void nullChecklistWhenNeverSet() {
            UUID runnerId = pairAndConnect(WORKSPACE_ID, USER_NAME, RUNNER_NAME);
            LocalRunner runner = runnerService.getRunner(WORKSPACE_ID, USER_NAME, runnerId);
            assertThat(runner.checklist()).isNull();
        }
    }

    @Nested
    class PatchChecklist {

        @Test
        void updatesOnlyProvidedFields() {
            UUID runnerId = pairAndConnect(WORKSPACE_ID, USER_NAME, RUNNER_NAME);
            runnerService.putChecklist(runnerId, WORKSPACE_ID, USER_NAME, fullChecklist());

            RunnerChecklist patch = RunnerChecklist.builder()
                    .command("python main.py")
                    .build();
            runnerService.patchChecklist(runnerId, WORKSPACE_ID, USER_NAME, patch);

            LocalRunner runner = runnerService.getRunner(WORKSPACE_ID, USER_NAME, runnerId);
            assertThat(runner.checklist().command()).isEqualTo("python main.py");
            assertThat(runner.checklist().fileTree()).isEqualTo("app.py\nrequirements.txt\nsrc/\nsrc/agent.py");
            assertThat(runner.checklist().instrumentation().tracing()).isTrue();
        }

        @Test
        void deepMergesInstrumentation() {
            UUID runnerId = pairAndConnect(WORKSPACE_ID, USER_NAME, RUNNER_NAME);
            runnerService.putChecklist(runnerId, WORKSPACE_ID, USER_NAME, fullChecklist());

            RunnerChecklist patch = RunnerChecklist.builder()
                    .instrumentation(RunnerChecklist.Instrumentation.builder()
                            .configuration(true)
                            .build())
                    .build();
            runnerService.patchChecklist(runnerId, WORKSPACE_ID, USER_NAME, patch);

            LocalRunner runner = runnerService.getRunner(WORKSPACE_ID, USER_NAME, runnerId);
            assertThat(runner.checklist().instrumentation().tracing()).isTrue();
            assertThat(runner.checklist().instrumentation().entrypoint()).isTrue();
            assertThat(runner.checklist().instrumentation().configuration()).isTrue();
        }

        @Test
        void noChecklistYet_throws404() {
            UUID runnerId = pairAndConnect(WORKSPACE_ID, USER_NAME, RUNNER_NAME);

            RunnerChecklist patch = RunnerChecklist.builder().command("python main.py").build();
            assertThatThrownBy(() -> runnerService.patchChecklist(runnerId, WORKSPACE_ID, USER_NAME, patch))
                    .isExactlyInstanceOf(NotFoundException.class);
        }

        @Test
        void replacesInstrumentationMatches() {
            UUID runnerId = pairAndConnect(WORKSPACE_ID, USER_NAME, RUNNER_NAME);
            runnerService.putChecklist(runnerId, WORKSPACE_ID, USER_NAME, fullChecklist());

            RunnerChecklist patch = RunnerChecklist.builder()
                    .instrumentationMatches(List.of("new.py:1:import opik"))
                    .build();
            runnerService.patchChecklist(runnerId, WORKSPACE_ID, USER_NAME, patch);

            LocalRunner runner = runnerService.getRunner(WORKSPACE_ID, USER_NAME, runnerId);
            assertThat(runner.checklist().instrumentationMatches()).containsExactly("new.py:1:import opik");
        }

        @Test
        void patchesChildStatusAndLastCrash() {
            UUID runnerId = pairAndConnect(WORKSPACE_ID, USER_NAME, RUNNER_NAME);
            runnerService.putChecklist(runnerId, WORKSPACE_ID, USER_NAME, fullChecklist());

            RunnerChecklist patch = RunnerChecklist.builder()
                    .childStatus("crashed")
                    .lastCrash(RunnerChecklist.LastCrash.builder()
                            .exitCode(1)
                            .stderrTail("TypeError: missing argument")
                            .build())
                    .build();
            runnerService.patchChecklist(runnerId, WORKSPACE_ID, USER_NAME, patch);

            LocalRunner runner = runnerService.getRunner(WORKSPACE_ID, USER_NAME, runnerId);
            assertThat(runner.checklist().childStatus()).isEqualTo("crashed");
            assertThat(runner.checklist().lastCrash().exitCode()).isEqualTo(1);
            assertThat(runner.checklist().lastCrash().stderrTail()).isEqualTo("TypeError: missing argument");
            assertThat(runner.checklist().command()).isEqualTo("python app.py");
            assertThat(runner.checklist().instrumentation().tracing()).isTrue();
        }

        @Test
        void childStatusAloneDoesNotAffectOtherFields() {
            UUID runnerId = pairAndConnect(WORKSPACE_ID, USER_NAME, RUNNER_NAME);
            runnerService.putChecklist(runnerId, WORKSPACE_ID, USER_NAME, fullChecklist());

            runnerService.patchChecklist(runnerId, WORKSPACE_ID, USER_NAME,
                    RunnerChecklist.builder().childStatus("running").build());

            LocalRunner runner = runnerService.getRunner(WORKSPACE_ID, USER_NAME, runnerId);
            assertThat(runner.checklist().childStatus()).isEqualTo("running");
            assertThat(runner.checklist().lastCrash()).isNull();
            assertThat(runner.checklist().command()).isEqualTo("python app.py");
        }
    }
}
