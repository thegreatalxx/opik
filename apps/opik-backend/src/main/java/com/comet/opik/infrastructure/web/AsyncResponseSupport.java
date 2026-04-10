package com.comet.opik.infrastructure.web;

import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.container.AsyncResponse;
import jakarta.ws.rs.core.Response;
import lombok.experimental.UtilityClass;
import lombok.extern.slf4j.Slf4j;
import reactor.core.publisher.Mono;

import java.util.concurrent.TimeUnit;
import java.util.function.Function;

/**
 * Bridges Reactor {@link Mono} results to JAX-RS {@link AsyncResponse}, handling
 * the timeout setup and error-path branching consistently.
 *
 * <p>Without this helper, each long-polling endpoint hand-rolls the same subscribe
 * + timeout + WebApplicationException vs. generic error branch — which is easy to
 * get slightly wrong in each copy. Centralizing it also means the context logging
 * format for server errors is uniform across endpoints.
 */
@UtilityClass
@Slf4j
public class AsyncResponseSupport {

    /**
     * Resumes {@code asyncResponse} with the result of {@code mono}, mapping
     * success through {@code onSuccess}. On timeout, resumes with {@code onTimeout}.
     * On {@link WebApplicationException}, resumes the exception; on any other
     * error, logs with the supplied context and resumes a 500.
     *
     * @param asyncResponse      the suspended response to resume
     * @param mono               the reactive source
     * @param timeoutSeconds     total timeout before {@code onTimeout} fires
     * @param onSuccess          maps the emitted value to a Response
     * @param onTimeout          built on timeout (e.g. 408 or 200 empty)
     * @param errorContextFormat slf4j format string for the error log
     * @param errorContextArgs   arguments for the format string (IDs only, no secrets)
     */
    public static <T> void resume(
            AsyncResponse asyncResponse,
            Mono<T> mono,
            long timeoutSeconds,
            Function<T, Response> onSuccess,
            Response onTimeout,
            String errorContextFormat,
            Object... errorContextArgs) {

        asyncResponse.setTimeout(timeoutSeconds, TimeUnit.SECONDS);
        asyncResponse.setTimeoutHandler(ar -> ar.resume(onTimeout));

        mono.map(onSuccess)
                .subscribe(
                        asyncResponse::resume,
                        error -> {
                            if (error instanceof WebApplicationException wae) {
                                asyncResponse.resume(wae);
                            } else {
                                Object[] logArgs = new Object[errorContextArgs.length + 1];
                                System.arraycopy(errorContextArgs, 0, logArgs, 0, errorContextArgs.length);
                                logArgs[errorContextArgs.length] = error;
                                log.error(errorContextFormat, logArgs);
                                asyncResponse.resume(Response.serverError().build());
                            }
                        });
    }
}
