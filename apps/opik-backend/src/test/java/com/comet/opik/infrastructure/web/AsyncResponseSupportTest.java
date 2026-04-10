package com.comet.opik.infrastructure.web;

import jakarta.ws.rs.NotFoundException;
import jakarta.ws.rs.container.AsyncResponse;
import jakarta.ws.rs.container.TimeoutHandler;
import jakarta.ws.rs.core.Response;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import reactor.core.publisher.Mono;

import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class AsyncResponseSupportTest {

    private AsyncResponse asyncResponse;
    private AtomicReference<TimeoutHandler> capturedTimeoutHandler;
    private AtomicReference<Long> capturedTimeoutValue;

    @BeforeEach
    void setUp() {
        asyncResponse = mock(AsyncResponse.class);
        capturedTimeoutHandler = new AtomicReference<>();
        capturedTimeoutValue = new AtomicReference<>();
        doAnswer(inv -> {
            capturedTimeoutValue.set(inv.getArgument(0));
            return true;
        }).when(asyncResponse).setTimeout(anyLong(), any(TimeUnit.class));
        doAnswer(inv -> {
            capturedTimeoutHandler.set(inv.getArgument(0));
            return null;
        }).when(asyncResponse).setTimeoutHandler(any(TimeoutHandler.class));
    }

    @Test
    @DisplayName("Successful Mono resumes the AsyncResponse with the mapped Response")
    void successResumesWithMappedResponse() {
        AsyncResponseSupport.resume(
                asyncResponse,
                Mono.just("payload"),
                30L,
                value -> Response.ok(value).build(),
                Response.noContent().build(),
                "ctx={}", "test");

        verify(asyncResponse).resume(any(Response.class));
        assertThat(capturedTimeoutValue.get()).isEqualTo(30L);
    }

    @Test
    @DisplayName("WebApplicationException from the Mono is resumed as the exception itself")
    void webApplicationExceptionPropagates() {
        var notFound = new NotFoundException("missing");

        AsyncResponseSupport.resume(
                asyncResponse,
                Mono.error(notFound),
                30L,
                value -> Response.ok(value).build(),
                Response.noContent().build(),
                "ctx={}", "test");

        verify(asyncResponse).resume(notFound);
    }

    @Test
    @DisplayName("Generic exception from the Mono resumes a 500")
    void genericExceptionResumesServerError() {
        AsyncResponseSupport.resume(
                asyncResponse,
                Mono.error(new RuntimeException("boom")),
                30L,
                value -> Response.ok(value).build(),
                Response.noContent().build(),
                "ctx={}", "test");

        var captor = org.mockito.ArgumentCaptor.forClass(Response.class);
        verify(asyncResponse).resume(captor.capture());
        assertThat(captor.getValue().getStatus()).isEqualTo(500);
    }

    @Test
    @DisplayName("Timeout handler resumes with the configured fallback Response")
    void timeoutHandlerInvocationFallsBack() {
        Response onTimeout = Response.ok("timeout-fallback").build();

        AsyncResponseSupport.resume(
                asyncResponse,
                Mono.never(),
                5L,
                value -> Response.ok(value).build(),
                onTimeout,
                "ctx={}", "test");

        // Simulate the JAX-RS container firing the timeout handler
        assertThat(capturedTimeoutHandler.get()).isNotNull();
        capturedTimeoutHandler.get().handleTimeout(asyncResponse);

        verify(asyncResponse).resume(onTimeout);
    }

    @Test
    @DisplayName("Synchronously-resolving Mono still sets the timeout before resuming")
    void synchronousMonoStillSetsTimeout() {
        AsyncResponseSupport.resume(
                asyncResponse,
                Mono.just("immediate"),
                15L,
                value -> Response.ok(value).build(),
                Response.noContent().build(),
                "ctx={}", "test");

        // Both setTimeout and resume should have been called; ordering matters because
        // the JAX-RS container can race the resume vs. its own timer.
        verify(asyncResponse).setTimeout(15L, TimeUnit.SECONDS);
        verify(asyncResponse).resume(any(Response.class));
    }
}
