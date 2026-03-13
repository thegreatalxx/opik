package com.comet.opik.api.resources.v1.priv;

import com.codahale.metrics.annotation.Timed;
import com.comet.opik.domain.OllieComputeService;
import com.comet.opik.domain.OllieComputeService.ProxyResult;
import com.comet.opik.infrastructure.auth.RequestContext;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.inject.Inject;
import jakarta.inject.Provider;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.ProcessingException;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.HttpHeaders;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.NewCookie;
import jakarta.ws.rs.core.Response;
import lombok.NonNull;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Path("/v1/private/ollie")
@Produces(MediaType.APPLICATION_JSON)
@Timed
@Slf4j
@RequiredArgsConstructor(onConstructor_ = @Inject)
@Tag(name = "Ollie Compute", description = "Ollie compute engine resources")
public class OllieComputeResource {

    private final @NonNull OllieComputeService ollieComputeService;
    private final @NonNull Provider<RequestContext> requestContext;

    @GET
    @Path("/compute")
    @Operation(operationId = "getOllieCompute", summary = "Get Ollie compute URL", description = "Proxies to comet-backend to provision an Ollie pod and return its compute URL", responses = {
            @ApiResponse(responseCode = "200", description = "Compute URL response"),
            @ApiResponse(responseCode = "503", description = "Ollie not enabled")
    })
    public Response getCompute(@Context HttpHeaders incomingHeaders) {
        if (!ollieComputeService.isEnabled()) {
            return Response.ok()
                    .entity(ollieComputeService.getDisabledResponse())
                    .build();
        }

        if (!ollieComputeService.isConfigured()) {
            log.warn("Ollie enabled but reactService URL is not configured");
            return Response.status(Response.Status.SERVICE_UNAVAILABLE)
                    .entity(ollieComputeService.getDisabledResponse())
                    .build();
        }

        String apiKey = requestContext.get().getApiKey();
        String workspaceName = requestContext.get().getWorkspaceName();

        try {
            ProxyResult result = ollieComputeService.proxyCompute(
                    apiKey, workspaceName, incomingHeaders.getCookies());

            Response.ResponseBuilder builder = Response.status(result.status())
                    .type(MediaType.APPLICATION_JSON)
                    .entity(result.body());

            for (NewCookie cookie : result.cookies().values()) {
                builder.cookie(cookie);
            }

            return builder.build();
        } catch (ProcessingException e) {
            log.error("Network error proxying ollie compute request", e);
            return Response.status(Response.Status.BAD_GATEWAY)
                    .entity(ollieComputeService.getDisabledResponse())
                    .build();
        } catch (WebApplicationException e) {
            log.error("Upstream error proxying ollie compute request", e);
            return Response.status(Response.Status.BAD_GATEWAY)
                    .entity(ollieComputeService.getDisabledResponse())
                    .build();
        }
    }
}
