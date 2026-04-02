package com.comet.opik.api.resources.v1.priv;

import com.codahale.metrics.annotation.Timed;
import com.comet.opik.api.error.ErrorMessage;
import com.comet.opik.api.runner.BridgeCommand;
import com.comet.opik.api.runner.BridgeCommandResultRequest;
import com.comet.opik.api.runner.BridgeNextRequest;
import com.comet.opik.api.runner.BridgeNextResponse;
import com.comet.opik.api.runner.CreateBridgeCommandRequest;
import com.comet.opik.api.runner.CreateBridgeCommandResponse;
import com.comet.opik.api.runner.CreateLocalRunnerJobRequest;
import com.comet.opik.api.runner.LocalRunner;
import com.comet.opik.api.runner.LocalRunnerConnectRequest;
import com.comet.opik.api.runner.LocalRunnerConnectResponse;
import com.comet.opik.api.runner.LocalRunnerHeartbeatRequest;
import com.comet.opik.api.runner.LocalRunnerHeartbeatResponse;
import com.comet.opik.api.runner.LocalRunnerJob;
import com.comet.opik.api.runner.LocalRunnerJobResultRequest;
import com.comet.opik.api.runner.LocalRunnerLogEntry;
import com.comet.opik.api.runner.LocalRunnerPairRequest;
import com.comet.opik.api.runner.LocalRunnerPairResponse;
import com.comet.opik.api.runner.RunnerChecklist;
import com.comet.opik.domain.LocalRunnerService;
import com.comet.opik.infrastructure.LocalRunnerConfig;
import com.comet.opik.infrastructure.auth.RequestContext;
import com.comet.opik.infrastructure.ratelimit.RateLimited;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.headers.Header;
import io.swagger.v3.oas.annotations.media.ArraySchema;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.parameters.RequestBody;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.inject.Inject;
import jakarta.inject.Provider;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.PATCH;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.container.AsyncResponse;
import jakarta.ws.rs.container.Suspended;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;
import lombok.NonNull;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

@Path("/v1/private/local-runners")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@Timed
@Slf4j
@RequiredArgsConstructor(onConstructor_ = @Inject)
@Tag(name = "Runners", description = "Local runner management endpoints")
public class LocalRunnersResource {

    private final @NonNull Provider<RequestContext> requestContext;
    private final @NonNull LocalRunnerService runnerService;
    private final @NonNull LocalRunnerConfig runnerConfig;

    @POST
    @Path("/pairs")
    @RateLimited
    @Operation(operationId = "generatePairingCode", summary = "Generate a pairing code", description = "Generate a pairing code for a local runner in the current workspace", responses = {
            @ApiResponse(responseCode = "201", description = "Pairing code generated", headers = @Header(name = "Location", description = "URI of the runner"), content = @Content(schema = @Schema(implementation = LocalRunnerPairResponse.class))),
            @ApiResponse(responseCode = "404", description = "Not found", content = @Content(schema = @Schema(implementation = ErrorMessage.class)))})
    public Response generatePairingCode(
            @RequestBody(content = @Content(schema = @Schema(implementation = LocalRunnerPairRequest.class))) @NotNull @Valid LocalRunnerPairRequest request,
            @Context UriInfo uriInfo) {
        ensureEnabled();
        String workspaceId = requestContext.get().getWorkspaceId();
        String userName = requestContext.get().getUserName();
        LocalRunnerPairResponse response = runnerService.generatePairingCode(workspaceId, userName,
                request.projectId());
        var uri = uriInfo.getBaseUriBuilder()
                .path("v1/private/local-runners/{runnerId}")
                .build(response.runnerId());
        return Response.created(uri).entity(response).build();
    }

    @POST
    @Path("/connections")
    @RateLimited
    @Operation(operationId = "connectRunner", summary = "Connect a local runner", description = "Exchange a pairing code or API key for local runner credentials", responses = {
            @ApiResponse(responseCode = "201", description = "Runner connected", headers = @Header(name = "Location", description = "URI of the runner"), content = @Content(schema = @Schema(implementation = LocalRunnerConnectResponse.class))),
            @ApiResponse(responseCode = "400", description = "Bad request", content = @Content(schema = @Schema(implementation = ErrorMessage.class))),
            @ApiResponse(responseCode = "404", description = "Not found", content = @Content(schema = @Schema(implementation = ErrorMessage.class)))})
    public Response connect(
            @RequestBody(content = @Content(schema = @Schema(implementation = LocalRunnerConnectRequest.class))) @NotNull @Valid LocalRunnerConnectRequest request,
            @Context UriInfo uriInfo) {
        ensureEnabled();
        String workspaceId = requestContext.get().getWorkspaceId();
        String userName = requestContext.get().getUserName();
        LocalRunnerConnectResponse connectResponse = runnerService.connect(workspaceId, userName, request);
        var uri = uriInfo.getBaseUriBuilder()
                .path("v1/private/local-runners/{runnerId}")
                .build(connectResponse.runnerId());
        return Response.created(uri).entity(connectResponse).build();
    }

    @GET
    @Operation(operationId = "listRunners", summary = "List local runners", description = "List local runners owned by the current user in the workspace", responses = {
            @ApiResponse(responseCode = "200", description = "Runners list", content = @Content(schema = @Schema(implementation = LocalRunner.LocalRunnerPage.class))),
            @ApiResponse(responseCode = "404", description = "Not found", content = @Content(schema = @Schema(implementation = ErrorMessage.class)))})
    public Response listRunners(
            @QueryParam("project_id") @NotNull UUID projectId,
            @QueryParam("page") @DefaultValue("0") @Min(0) int page,
            @QueryParam("size") @DefaultValue("25") @Min(1) int size) {
        ensureEnabled();
        String workspaceId = requestContext.get().getWorkspaceId();
        String userName = requestContext.get().getUserName();
        LocalRunner.LocalRunnerPage runnerPage = runnerService.listRunners(workspaceId, userName, projectId, page,
                size);
        return Response.ok(runnerPage).build();
    }

    @GET
    @Path("/{runnerId}")
    @Operation(operationId = "getRunner", summary = "Get local runner", description = "Get a single local runner with its registered agents", responses = {
            @ApiResponse(responseCode = "200", description = "Runner details", content = @Content(schema = @Schema(implementation = LocalRunner.class))),
            @ApiResponse(responseCode = "404", description = "Not found", content = @Content(schema = @Schema(implementation = ErrorMessage.class)))})
    public Response getRunner(@PathParam("runnerId") UUID runnerId) {
        ensureEnabled();
        String workspaceId = requestContext.get().getWorkspaceId();
        String userName = requestContext.get().getUserName();
        LocalRunner runner = runnerService.getRunner(workspaceId, userName, runnerId);
        return Response.ok(runner).build();
    }

    @PUT
    @Path("/{runnerId}/agents")
    @RateLimited
    @Operation(operationId = "registerAgents", summary = "Register local runner agents", description = "Register or update the local runner's agent list", responses = {
            @ApiResponse(responseCode = "204", description = "No content"),
            @ApiResponse(responseCode = "400", description = "Bad request", content = @Content(schema = @Schema(implementation = ErrorMessage.class))),
            @ApiResponse(responseCode = "404", description = "Not found", content = @Content(schema = @Schema(implementation = ErrorMessage.class)))})
    public Response registerAgents(@PathParam("runnerId") UUID runnerId,
            @RequestBody(description = "Map of agent name to agent definition", content = @Content(schema = @Schema(implementation = Object.class))) @NotNull @Valid Map<String, LocalRunner.Agent> agents) {
        ensureEnabled();
        String workspaceId = requestContext.get().getWorkspaceId();
        String userName = requestContext.get().getUserName();
        runnerService.registerAgents(runnerId, workspaceId, userName, agents);
        return Response.noContent().build();
    }

    @POST
    @Path("/{runnerId}/heartbeats")
    @RateLimited
    @Operation(operationId = "heartbeat", summary = "Local runner heartbeat", description = "Refresh local runner heartbeat", responses = {
            @ApiResponse(responseCode = "200", description = "Heartbeat response", content = @Content(schema = @Schema(implementation = LocalRunnerHeartbeatResponse.class))),
            @ApiResponse(responseCode = "404", description = "Not found", content = @Content(schema = @Schema(implementation = ErrorMessage.class))),
            @ApiResponse(responseCode = "410", description = "Gone", content = @Content(schema = @Schema(implementation = ErrorMessage.class)))})
    public Response heartbeat(@PathParam("runnerId") UUID runnerId,
            @Valid LocalRunnerHeartbeatRequest request) {
        ensureEnabled();
        String workspaceId = requestContext.get().getWorkspaceId();
        String userName = requestContext.get().getUserName();
        List<String> capabilities = request != null ? request.capabilities() : null;
        LocalRunnerHeartbeatResponse response = runnerService.heartbeat(runnerId, workspaceId, userName, capabilities);
        return Response.ok(response).build();
    }

    @POST
    @Path("/jobs")
    @RateLimited
    @Operation(operationId = "createJob", summary = "Create local runner job", description = "Create a local runner job and enqueue it for execution", responses = {
            @ApiResponse(responseCode = "201", description = "Job created", headers = @Header(name = "Location", description = "URI of the job")),
            @ApiResponse(responseCode = "404", description = "Not found", content = @Content(schema = @Schema(implementation = ErrorMessage.class))),
            @ApiResponse(responseCode = "409", description = "Conflict", content = @Content(schema = @Schema(implementation = ErrorMessage.class)))})
    public Response createJob(
            @RequestBody(content = @Content(schema = @Schema(implementation = CreateLocalRunnerJobRequest.class))) @NotNull @Valid CreateLocalRunnerJobRequest request,
            @Context UriInfo uriInfo) {
        ensureEnabled();
        String workspaceId = requestContext.get().getWorkspaceId();
        String userName = requestContext.get().getUserName();
        UUID jobId = runnerService.createJob(workspaceId, userName, request);
        var uri = uriInfo.getAbsolutePathBuilder().path("/{jobId}").build(jobId);
        return Response.created(uri).build();
    }

    @GET
    @Path("/{runnerId}/jobs")
    @Operation(operationId = "listJobs", summary = "List local runner jobs", description = "List jobs for a local runner", responses = {
            @ApiResponse(responseCode = "200", description = "Jobs list", content = @Content(schema = @Schema(implementation = LocalRunnerJob.LocalRunnerJobPage.class))),
            @ApiResponse(responseCode = "404", description = "Not found", content = @Content(schema = @Schema(implementation = ErrorMessage.class)))})
    public Response listJobs(@PathParam("runnerId") UUID runnerId,
            @QueryParam("project_id") UUID projectId,
            @QueryParam("page") @DefaultValue("0") @Min(0) int page,
            @QueryParam("size") @DefaultValue("25") @Min(1) int size) {
        ensureEnabled();
        String workspaceId = requestContext.get().getWorkspaceId();
        String userName = requestContext.get().getUserName();
        LocalRunnerJob.LocalRunnerJobPage jobPage = runnerService.listJobs(runnerId, projectId, workspaceId, userName,
                page, size);
        return Response.ok(jobPage).build();
    }

    @POST
    @Path("/{runnerId}/jobs/next")
    @Operation(operationId = "nextJob", summary = "Next local runner job", description = "Long-poll for the next pending local runner job", responses = {
            @ApiResponse(responseCode = "200", description = "Job available", content = @Content(schema = @Schema(implementation = LocalRunnerJob.class))),
            @ApiResponse(responseCode = "204", description = "No content"),
            @ApiResponse(responseCode = "404", description = "Not found", content = @Content(schema = @Schema(implementation = ErrorMessage.class)))})
    public void nextJob(@PathParam("runnerId") UUID runnerId,
            @Suspended AsyncResponse asyncResponse) {
        ensureEnabled();
        long pollTimeoutSeconds = runnerConfig.getNextJobPollTimeout().toSeconds();
        long bufferSeconds = runnerConfig.getNextJobAsyncTimeoutBuffer().toSeconds();
        asyncResponse.setTimeout(pollTimeoutSeconds + bufferSeconds, TimeUnit.SECONDS);
        asyncResponse.setTimeoutHandler(ar -> ar.resume(Response.noContent().build()));
        String workspaceId = requestContext.get().getWorkspaceId();
        String userName = requestContext.get().getUserName();
        runnerService.nextJob(runnerId, workspaceId, userName)
                .map(job -> Response.ok(job).build())
                .defaultIfEmpty(Response.noContent().build())
                .subscribe(
                        asyncResponse::resume,
                        error -> {
                            if (error instanceof WebApplicationException wae) {
                                asyncResponse.resume(wae);
                            } else {
                                log.error("Error polling next job for runner='{}' workspace='{}'", runnerId,
                                        workspaceId, error);
                                asyncResponse.resume(Response.serverError().build());
                            }
                        });
    }

    @GET
    @Path("/jobs/{jobId}")
    @Operation(operationId = "getJob", summary = "Get local runner job", description = "Get a single local runner job's status and results", responses = {
            @ApiResponse(responseCode = "200", description = "Job details", content = @Content(schema = @Schema(implementation = LocalRunnerJob.class))),
            @ApiResponse(responseCode = "404", description = "Not found", content = @Content(schema = @Schema(implementation = ErrorMessage.class)))})
    public Response getJob(@PathParam("jobId") UUID jobId) {
        ensureEnabled();
        String workspaceId = requestContext.get().getWorkspaceId();
        String userName = requestContext.get().getUserName();
        LocalRunnerJob job = runnerService.getJob(jobId, workspaceId, userName);
        return Response.ok(job).build();
    }

    @GET
    @Path("/jobs/{jobId}/logs")
    @Operation(operationId = "getJobLogs", summary = "Get local runner job logs", description = "Get log entries for a local runner job", responses = {
            @ApiResponse(responseCode = "200", description = "Log entries", content = @Content(array = @ArraySchema(schema = @Schema(implementation = LocalRunnerLogEntry.class)))),
            @ApiResponse(responseCode = "404", description = "Not found", content = @Content(schema = @Schema(implementation = ErrorMessage.class)))})
    public Response getJobLogs(@PathParam("jobId") UUID jobId,
            @QueryParam("offset") @DefaultValue("0") @Min(0) int offset) {
        ensureEnabled();
        String workspaceId = requestContext.get().getWorkspaceId();
        String userName = requestContext.get().getUserName();
        List<LocalRunnerLogEntry> logs = runnerService.getJobLogs(jobId, offset, workspaceId, userName);
        return Response.ok(logs).build();
    }

    @POST
    @Path("/jobs/{jobId}/logs")
    @RateLimited
    @Operation(operationId = "appendJobLogs", summary = "Append local runner job logs", description = "Append log entries for a running local runner job", responses = {
            @ApiResponse(responseCode = "204", description = "No content"),
            @ApiResponse(responseCode = "400", description = "Bad request", content = @Content(schema = @Schema(implementation = ErrorMessage.class))),
            @ApiResponse(responseCode = "404", description = "Not found", content = @Content(schema = @Schema(implementation = ErrorMessage.class)))})
    public Response appendLogs(@PathParam("jobId") UUID jobId,
            @RequestBody(content = @Content(array = @ArraySchema(schema = @Schema(implementation = LocalRunnerLogEntry.class)))) @NotNull @Valid List<@NotNull LocalRunnerLogEntry> entries) {
        ensureEnabled();
        String workspaceId = requestContext.get().getWorkspaceId();
        String userName = requestContext.get().getUserName();
        runnerService.appendLogs(jobId, workspaceId, userName, entries);
        return Response.noContent().build();
    }

    @POST
    @Path("/jobs/{jobId}/results")
    @Operation(operationId = "reportJobResult", summary = "Report local runner job result", description = "Report local runner job completion or failure", responses = {
            @ApiResponse(responseCode = "204", description = "No content"),
            @ApiResponse(responseCode = "400", description = "Bad request", content = @Content(schema = @Schema(implementation = ErrorMessage.class))),
            @ApiResponse(responseCode = "404", description = "Not found", content = @Content(schema = @Schema(implementation = ErrorMessage.class)))})
    public Response reportResult(@PathParam("jobId") UUID jobId,
            @RequestBody(content = @Content(schema = @Schema(implementation = LocalRunnerJobResultRequest.class))) @NotNull @Valid LocalRunnerJobResultRequest result) {
        ensureEnabled();
        String workspaceId = requestContext.get().getWorkspaceId();
        String userName = requestContext.get().getUserName();
        runnerService.reportResult(jobId, workspaceId, userName, result);
        return Response.noContent().build();
    }

    @POST
    @Path("/jobs/{jobId}/cancel")
    @Operation(operationId = "cancelJob", summary = "Cancel local runner job", description = "Cancel a pending or running local runner job", responses = {
            @ApiResponse(responseCode = "204", description = "No content"),
            @ApiResponse(responseCode = "404", description = "Not found", content = @Content(schema = @Schema(implementation = ErrorMessage.class)))})
    public Response cancelJob(@PathParam("jobId") UUID jobId) {
        ensureEnabled();
        String workspaceId = requestContext.get().getWorkspaceId();
        String userName = requestContext.get().getUserName();
        runnerService.cancelJob(jobId, workspaceId, userName);
        return Response.noContent().build();
    }

    @PUT
    @Path("/{runnerId}/checklist")
    @RateLimited
    @Operation(operationId = "putChecklist", summary = "Replace runner checklist", description = "Full replace of the runner's instrumentation checklist", responses = {
            @ApiResponse(responseCode = "200", description = "OK"),
            @ApiResponse(responseCode = "404", description = "Not found", content = @Content(schema = @Schema(implementation = ErrorMessage.class))),
            @ApiResponse(responseCode = "413", description = "Payload too large", content = @Content(schema = @Schema(implementation = ErrorMessage.class)))})
    public Response putChecklist(@PathParam("runnerId") UUID runnerId,
            @RequestBody(content = @Content(schema = @Schema(implementation = RunnerChecklist.class))) @NotNull @Valid RunnerChecklist checklist) {
        ensureEnabled();
        String workspaceId = requestContext.get().getWorkspaceId();
        String userName = requestContext.get().getUserName();
        runnerService.putChecklist(runnerId, workspaceId, userName, checklist);
        return Response.ok().build();
    }

    @PATCH
    @Path("/{runnerId}/checklist")
    @RateLimited
    @Operation(operationId = "patchChecklist", summary = "Patch runner checklist", description = "Partial update of the runner's instrumentation checklist", responses = {
            @ApiResponse(responseCode = "200", description = "OK"),
            @ApiResponse(responseCode = "404", description = "Not found or checklist never set", content = @Content(schema = @Schema(implementation = ErrorMessage.class))),
            @ApiResponse(responseCode = "413", description = "Payload too large", content = @Content(schema = @Schema(implementation = ErrorMessage.class)))})
    public Response patchChecklist(@PathParam("runnerId") UUID runnerId,
            @RequestBody(content = @Content(schema = @Schema(implementation = RunnerChecklist.class))) @NotNull @Valid RunnerChecklist patch) {
        ensureEnabled();
        String workspaceId = requestContext.get().getWorkspaceId();
        String userName = requestContext.get().getUserName();
        runnerService.patchChecklist(runnerId, workspaceId, userName, patch);
        return Response.ok().build();
    }

    @POST
    @Path("/{runnerId}/bridge/commands")
    @RateLimited
    @Operation(operationId = "submitBridgeCommand", summary = "Submit bridge command", description = "Submit a bridge command for execution on the local runner", responses = {
            @ApiResponse(responseCode = "201", description = "Command created", headers = @Header(name = "Location", description = "URI of the command"), content = @Content(schema = @Schema(implementation = CreateBridgeCommandResponse.class))),
            @ApiResponse(responseCode = "404", description = "Not found", content = @Content(schema = @Schema(implementation = ErrorMessage.class))),
            @ApiResponse(responseCode = "409", description = "Conflict", content = @Content(schema = @Schema(implementation = ErrorMessage.class))),
            @ApiResponse(responseCode = "429", description = "Too many requests", content = @Content(schema = @Schema(implementation = ErrorMessage.class)))})
    public Response submitBridgeCommand(@PathParam("runnerId") UUID runnerId,
            @RequestBody(content = @Content(schema = @Schema(implementation = CreateBridgeCommandRequest.class))) @NotNull @Valid CreateBridgeCommandRequest request,
            @Context UriInfo uriInfo) {
        ensureEnabled();
        String workspaceId = requestContext.get().getWorkspaceId();
        String userName = requestContext.get().getUserName();
        UUID commandId = runnerService.createBridgeCommand(runnerId, workspaceId, userName, request);
        var uri = uriInfo.getBaseUriBuilder()
                .path("v1/private/local-runners/{runnerId}/bridge/commands/{commandId}")
                .build(runnerId, commandId);
        return Response.created(uri).entity(CreateBridgeCommandResponse.builder().commandId(commandId).build()).build();
    }

    @POST
    @Path("/{runnerId}/bridge/next")
    @Operation(operationId = "nextBridgeCommands", summary = "Poll next bridge commands", description = "Long-poll for pending bridge commands", responses = {
            @ApiResponse(responseCode = "200", description = "Commands available", content = @Content(schema = @Schema(implementation = BridgeNextResponse.class))),
            @ApiResponse(responseCode = "204", description = "No commands"),
            @ApiResponse(responseCode = "410", description = "Gone", content = @Content(schema = @Schema(implementation = ErrorMessage.class)))})
    public void nextBridgeCommands(@PathParam("runnerId") UUID runnerId,
            @Valid BridgeNextRequest request,
            @Suspended AsyncResponse asyncResponse) {
        ensureEnabled();
        long pollTimeoutSeconds = runnerConfig.getBridgeNextPollTimeout().toSeconds();
        long bufferSeconds = runnerConfig.getBridgeNextAsyncTimeoutBuffer().toSeconds();
        asyncResponse.setTimeout(pollTimeoutSeconds + bufferSeconds, TimeUnit.SECONDS);
        asyncResponse.setTimeoutHandler(ar -> ar.resume(Response.noContent().build()));
        String workspaceId = requestContext.get().getWorkspaceId();
        String userName = requestContext.get().getUserName();
        int maxCommands = request != null ? request.resolvedMaxCommands() : 10;
        runnerService.nextBridgeCommands(runnerId, workspaceId, userName, maxCommands)
                .map(resp -> {
                    if (resp.commands().isEmpty()) {
                        return Response.noContent().build();
                    }
                    return Response.ok(resp).build();
                })
                .defaultIfEmpty(Response.noContent().build())
                .subscribe(
                        asyncResponse::resume,
                        error -> {
                            if (error instanceof WebApplicationException wae) {
                                asyncResponse.resume(wae);
                            } else {
                                log.error("Error polling bridge commands for runner='{}' workspace='{}'", runnerId,
                                        workspaceId, error);
                                asyncResponse.resume(Response.serverError().build());
                            }
                        });
    }

    @POST
    @Path("/{runnerId}/bridge/commands/{commandId}/result")
    @Operation(operationId = "reportBridgeCommandResult", summary = "Report bridge command result", description = "Report completion or failure of a bridge command", responses = {
            @ApiResponse(responseCode = "200", description = "OK"),
            @ApiResponse(responseCode = "404", description = "Not found", content = @Content(schema = @Schema(implementation = ErrorMessage.class))),
            @ApiResponse(responseCode = "409", description = "Conflict", content = @Content(schema = @Schema(implementation = ErrorMessage.class)))})
    public Response reportBridgeCommandResult(@PathParam("runnerId") UUID runnerId,
            @PathParam("commandId") UUID commandId,
            @RequestBody(content = @Content(schema = @Schema(implementation = BridgeCommandResultRequest.class))) @NotNull @Valid BridgeCommandResultRequest result) {
        ensureEnabled();
        String workspaceId = requestContext.get().getWorkspaceId();
        String userName = requestContext.get().getUserName();
        runnerService.reportBridgeCommandResult(runnerId, commandId, workspaceId, userName, result);
        return Response.ok().build();
    }

    @POST
    @Path("/{runnerId}/bridge/commands/{commandId}/cancel")
    @Operation(operationId = "cancelBridgeCommand", summary = "Cancel bridge command", description = "Cancel a pending or active bridge command", responses = {
            @ApiResponse(responseCode = "200", description = "Cancelled"),
            @ApiResponse(responseCode = "404", description = "Not found", content = @Content(schema = @Schema(implementation = ErrorMessage.class))),
            @ApiResponse(responseCode = "409", description = "Conflict", content = @Content(schema = @Schema(implementation = ErrorMessage.class)))})
    public Response cancelBridgeCommand(@PathParam("runnerId") UUID runnerId,
            @PathParam("commandId") UUID commandId) {
        ensureEnabled();
        String workspaceId = requestContext.get().getWorkspaceId();
        String userName = requestContext.get().getUserName();
        runnerService.cancelBridgeCommand(runnerId, commandId, workspaceId, userName);
        return Response.ok().build();
    }

    @GET
    @Path("/{runnerId}/bridge/commands/{commandId}")
    @Operation(operationId = "getBridgeCommand", summary = "Get bridge command", description = "Get bridge command status or long-poll for result", responses = {
            @ApiResponse(responseCode = "200", description = "Command details", content = @Content(schema = @Schema(implementation = BridgeCommand.class))),
            @ApiResponse(responseCode = "404", description = "Not found", content = @Content(schema = @Schema(implementation = ErrorMessage.class)))})
    public void getBridgeCommand(@PathParam("runnerId") UUID runnerId,
            @PathParam("commandId") UUID commandId,
            @QueryParam("wait") @DefaultValue("false") boolean wait,
            @QueryParam("timeout") @DefaultValue("30") int timeout,
            @Suspended AsyncResponse asyncResponse) {
        ensureEnabled();
        String workspaceId = requestContext.get().getWorkspaceId();
        String userName = requestContext.get().getUserName();

        if (!wait) {
            try {
                BridgeCommand command = runnerService.getBridgeCommand(runnerId, commandId, workspaceId, userName);
                asyncResponse.resume(Response.ok(command).build());
            } catch (Exception e) {
                asyncResponse.resume(e);
            }
            return;
        }

        int clampedTimeout = Math.min(Math.max(timeout, 1), 120);
        long bufferSeconds = runnerConfig.getBridgeNextAsyncTimeoutBuffer().toSeconds();
        asyncResponse.setTimeout(clampedTimeout + bufferSeconds, TimeUnit.SECONDS);
        asyncResponse.setTimeoutHandler(ar -> {
            try {
                BridgeCommand command = runnerService.getBridgeCommand(runnerId, commandId, workspaceId, userName);
                ar.resume(Response.ok(command).build());
            } catch (Exception e) {
                ar.resume(e);
            }
        });

        runnerService.awaitBridgeCommand(runnerId, commandId, workspaceId, userName, clampedTimeout)
                .map(command -> Response.ok(command).build())
                .subscribe(
                        asyncResponse::resume,
                        error -> {
                            if (error instanceof WebApplicationException wae) {
                                asyncResponse.resume(wae);
                            } else {
                                log.error("Error awaiting bridge command='{}' for runner='{}' workspace='{}'",
                                        commandId, runnerId, workspaceId, error);
                                asyncResponse.resume(Response.serverError().build());
                            }
                        });
    }

    private void ensureEnabled() {
        if (!runnerConfig.isEnabled()) {
            throw new WebApplicationException(Response.Status.NOT_IMPLEMENTED);
        }
    }
}
