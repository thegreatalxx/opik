import { useCallback, useRef } from "react";
import { useRouter } from "@tanstack/react-router";
import { processSSEChunk } from "@/api/playground/useCompletionProxyStreaming";
import useAppStore from "@/store/AppStore";
import useOllieAssistStore from "./OllieAssistStore";
import { captureSnapshot } from "./captureSnapshot";
import { fetchLiveThreads } from "./useThreads";

const OLLIE_ASSIST_URL =
  import.meta.env.VITE_OLLIE_ASSIST_URL || "/ollie";

const EVENT_PREFIX = "event:";
const DATA_PREFIX = "data:";

const HIGHLIGHT_DURATION_MS = 5000;

const ALLOWED_ROUTE_PREFIXES = [
  "/projects",
  "/experiments",
  "/datasets",
  "/prompts",
  "/playground",
  "/optimizations",
  "/dashboards",
];

type SSEEvent = {
  event: string;
  data: string;
};

const parseSSEEvents = (
  lines: string[],
): SSEEvent[] => {
  const events: SSEEvent[] = [];
  let currentEvent = "message";
  let currentData = "";

  for (const line of lines) {
    if (line.startsWith(EVENT_PREFIX)) {
      currentEvent = line.slice(EVENT_PREFIX.length).trim();
    } else if (line.startsWith(DATA_PREFIX)) {
      currentData = line.slice(DATA_PREFIX.length).trim();
      events.push({ event: currentEvent, data: currentData });
      currentEvent = "message";
      currentData = "";
    }
  }

  return events;
};

type SSEEventHandlers = {
  handleNavigate: (path: string) => void;
  handleHighlight: (uid: string) => void;
};

type SSEStreamState = {
  assistantMsgId: string;
};

function processSSEEvent(
  evt: SSEEvent,
  sessionId: string,
  state: SSEStreamState,
  handlers: SSEEventHandlers,
) {
  const store = useOllieAssistStore;
  const assistantMsgId = state.assistantMsgId;
  const parsed = (() => {
    try {
      return JSON.parse(evt.data);
    } catch {
      return null;
    }
  })();

  switch (evt.event) {
    case "user_message":
      if (parsed?.delta) {
        store.getState().addUserMessage(sessionId, parsed.delta);
      }
      break;

    case "message_start": {
      const msgs = store.getState().getActiveMessages();
      const existing = msgs.find((m) => m.id === state.assistantMsgId);
      if (existing && (existing.content || existing.blocks.length > 0 || !existing.isStreaming)) {
        const newId = crypto.randomUUID();
        state.assistantMsgId = newId;
        store.getState().startAssistantMessage(sessionId, newId);
      }
      break;
    }

    case "thinking_start":
      store.getState().setThinking(sessionId, assistantMsgId, true);
      break;

    case "thinking_delta":
      break;

    case "thinking_end":
      store.getState().setThinking(sessionId, assistantMsgId, false);
      break;

    case "message_delta":
      if (parsed?.delta) {
        store
          .getState()
          .appendAssistantDelta(sessionId, assistantMsgId, parsed.delta);
      }
      break;

    case "message_end":
      store.getState().endAssistantMessage(sessionId, assistantMsgId);
      break;

    case "tool_call_start":
      if (parsed) {
        store.getState().addToolCallStart(
          sessionId,
          assistantMsgId,
          parsed.id || crypto.randomUUID(),
          parsed.tool || "unknown",
          parsed.display || parsed.tool || "Working...",
          !!parsed.isSubAgent,
        );
      }
      break;

    case "tool_call_delta":
      if (parsed?.id) {
        // Unwrap nested deltas: the real payload may be inside parsed.delta (JSON string)
        let effective = parsed;
        if (typeof parsed.delta === "string") {
          try {
            const inner = JSON.parse(parsed.delta);
            if (inner && typeof inner === "object") {
              effective = { ...inner, id: parsed.id };
            }
          } catch { /* use outer as-is */ }
        }
        store
          .getState()
          .appendToolCallDelta(sessionId, assistantMsgId, parsed.id, effective);
      }
      break;

    case "tool_call_end":
      if (parsed) {
        store.getState().updateToolCallEnd(
          sessionId,
          assistantMsgId,
          parsed.id,
          parsed.result,
          parsed.result_type,
        );
      }
      break;

    case "confirm_required":
      if (parsed?.tool_use_id) {
        // Ensure a tool call block exists for this tool
        store.getState().addToolCallStart(
          sessionId,
          assistantMsgId,
          parsed.tool_use_id,
          parsed.tool_name || "execute_python",
          parsed.tool_name || "execute_python",
          false,
        );
        store.getState().setToolCallConfirmStatus(
          sessionId,
          assistantMsgId,
          parsed.tool_use_id,
          "pending",
          parsed.input as Record<string, unknown> | undefined,
          parsed.summary as string | undefined,
          parsed.session_id as string | undefined,
          parsed.tool_use_id as string,
        );
      }
      break;

    case "background_task_start":
      if (parsed?.session_id) {
        store.getState().createBackgroundThread(
          parsed.session_id,
          parsed.agent_name || parsed.session_id.slice(0, 12),
        );
        store.getState().attachToSession?.(parsed.session_id);
      }
      break;

    case "compaction_start":
    case "compaction_delta":
    case "compaction_end":
      break;

    case "navigate":
      if (parsed?.path) {
        handlers.handleNavigate(parsed.path);
      }
      break;

    case "highlight":
      if (parsed?.uid) {
        handlers.handleHighlight(parsed.uid);
      }
      break;
  }
}

async function consumeSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  sessionId: string,
  assistantMsgId: string,
  handlers: SSEEventHandlers,
  signal?: AbortSignal,
) {
  const state: SSEStreamState = { assistantMsgId };
  const decoder = new TextDecoder("utf-8");
  let lineBuffer = "";

  while (true) {
    if (signal?.aborted) break;
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const { lines, newBuffer } = processSSEChunk(chunk, lineBuffer);
    lineBuffer = newBuffer;

    const events = parseSSEEvents(lines);
    for (const evt of events) {
      processSSEEvent(evt, sessionId, state, handlers);
    }
  }
}

// Opens GET /sessions/{id}/stream and consumes SSE events
async function openStream(
  sessionId: string,
  assistantMsgId: string,
  handlers: SSEEventHandlers,
  abortController: AbortController,
) {
  const store = useOllieAssistStore;

  store.getState().setIsRunning(sessionId, true);
  store.getState().startAssistantMessage(sessionId, assistantMsgId);

  try {
    const response = await fetch(`${OLLIE_ASSIST_URL}/sessions/${sessionId}/stream`, {
      signal: abortController.signal,
      credentials: "include",
    });

    if (!response.ok) {
      if (response.status !== 404) {
        const errorText = await response.text();
        store.getState().appendAssistantDelta(
          sessionId,
          assistantMsgId,
          `Error: ${response.status} — ${errorText || response.statusText}`,
        );
      }
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) return;

    await consumeSSEStream(reader, sessionId, assistantMsgId, handlers, abortController.signal);
  } catch (error) {
    if ((error as Error).name !== "AbortError") {
      store
        .getState()
        .appendAssistantDelta(sessionId, assistantMsgId, "\n\n*Connection error.*");
    }
  } finally {
    store.getState().endAssistantMessage(sessionId, assistantMsgId);
    store.getState().setIsRunning(sessionId, false);
  }
}

const useOllieAssistSSE = () => {
  const streamAbortRefs = useRef<Map<string, AbortController>>(new Map());
  const router = useRouter();

  const store = useOllieAssistStore;

  const handleNavigate = useCallback(
    (path: string) => {
      const [pathname, queryString] = path.split("?");

      const isAllowed = ALLOWED_ROUTE_PREFIXES.some((prefix) =>
        pathname.startsWith(prefix),
      );
      if (!isAllowed) return;

      const workspaceName = useAppStore.getState().activeWorkspaceName;

      const search: Record<string, unknown> = {};
      if (queryString) {
        const params = new URLSearchParams(queryString);
        params.forEach((value, key) => {
          try {
            search[key] = JSON.parse(value);
          } catch {
            search[key] = value;
          }
        });
      }

      router.navigate({
        to: `/${workspaceName}${pathname}`,
        search,
      });
    },
    [router],
  );

  const confirmTool = useCallback(
    async (toolUseId: string, decision: string, sessionIdOverride?: string) => {
      const sessionId = sessionIdOverride || store.getState().getActiveSessionId();
      if (!sessionId) return;
      try {
        await fetch(`${OLLIE_ASSIST_URL}/sessions/${sessionId}/confirm`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tool_use_id: toolUseId,
            decision,
          }),
          credentials: "include",
        });
      } catch {
        // best-effort
      }
    },
    [store],
  );

  const handleHighlight = useCallback((uid: string) => {
    const el = document.querySelector(`[data-ollie-uid="${uid}"]`);
    if (!el) return;

    el.setAttribute("data-ollie-highlight", "true");
    setTimeout(() => {
      el.removeAttribute("data-ollie-highlight");
    }, HIGHLIGHT_DURATION_MS);
  }, []);

  const handlers: SSEEventHandlers = { handleNavigate, handleHighlight };

  const connectStream = useCallback(
    (sessionId: string) => {
      if (streamAbortRefs.current.has(sessionId)) return;
      const abortController = new AbortController();
      streamAbortRefs.current.set(sessionId, abortController);

      const assistantMsgId = crypto.randomUUID();
      openStream(sessionId, assistantMsgId, handlers, abortController).finally(() => {
        streamAbortRefs.current.delete(sessionId);
      });
    },
    [handlers],
  );

  const disconnectStream = useCallback((sessionId: string) => {
    const controller = streamAbortRefs.current.get(sessionId);
    if (controller) {
      controller.abort();
      streamAbortRefs.current.delete(sessionId);
    }
  }, []);

  const checkForLiveThreads = useCallback(async () => {
    try {
      const liveThreads = await fetchLiveThreads();
      const openThreadIds = new Set(Object.keys(store.getState().threads));
      for (const thread of liveThreads) {
        if (!openThreadIds.has(thread.id)) {
          store.getState().createBackgroundThread(thread.id, thread.title || thread.id.slice(0, 12));
          connectStream(thread.id);
        }
      }
    } catch { /* best-effort */ }
  }, [store, connectStream]);

  const sendMessage = useCallback(
    async (message: string) => {
      const state = store.getState();
      const isNewThread = state.showNewThread || !state.activeThreadId;
      const existingSessionId = isNewThread ? null : state.getActiveSessionId();

      let sessionId: string;
      if (!existingSessionId) {
        sessionId = crypto.randomUUID();
        const title = message.slice(0, 80);
        state.createThread(sessionId, title);
      } else {
        sessionId = existingSessionId;
        if (state.showNewThread) {
          state.setShowNewThread(false);
        }
      }

      const isFirstMessage = !existingSessionId;

      state.addUserMessage(sessionId, message);

      try {
        const snapshot = captureSnapshot();

        if (isFirstMessage) {
          const response = await fetch(`${OLLIE_ASSIST_URL}/sessions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              message,
              session_id: sessionId,
              context: {
                page: window.location.pathname,
              },
              snapshot,
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            }),
            credentials: "include",
          });

          if (!response.ok) {
            const errorText = await response.text();
            const errMsgId = crypto.randomUUID();
            store.getState().startAssistantMessage(sessionId, errMsgId);
            store.getState().appendAssistantDelta(
              sessionId,
              errMsgId,
              `Error: ${response.status} — ${errorText || response.statusText}`,
            );
            store.getState().endAssistantMessage(sessionId, errMsgId);
            return;
          }

          const data = await response.json();
          const newSessionId = data.session_id;
          if (newSessionId && newSessionId !== sessionId) {
            sessionId = newSessionId;
          }
        } else {
          const response = await fetch(`${OLLIE_ASSIST_URL}/sessions/${sessionId}/message`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              message,
              context: {
                page: window.location.pathname,
              },
              snapshot,
            }),
            credentials: "include",
          });

          if (!response.ok) {
            const errorText = await response.text();
            const errMsgId = crypto.randomUUID();
            store.getState().startAssistantMessage(sessionId, errMsgId);
            store.getState().appendAssistantDelta(
              sessionId,
              errMsgId,
              `Error: ${response.status} — ${errorText || response.statusText}`,
            );
            store.getState().endAssistantMessage(sessionId, errMsgId);
            return;
          }
        }

        connectStream(sessionId);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          const errMsgId = crypto.randomUUID();
          store.getState().startAssistantMessage(sessionId, errMsgId);
          store.getState().appendAssistantDelta(sessionId, errMsgId, "\n\n*Connection error.*");
          store.getState().endAssistantMessage(sessionId, errMsgId);
        }
      }

      checkForLiveThreads();
    },
    [store, connectStream, checkForLiveThreads],
  );

  const attachToSession = useCallback(
    (sessionId: string) => {
      connectStream(sessionId);
    },
    [connectStream],
  );

  const abort = useCallback(() => {
    const activeSessionId = store.getState().getActiveSessionId();
    if (activeSessionId) {
      disconnectStream(activeSessionId);
    }
  }, [store, disconnectStream]);

  return { sendMessage, attachToSession, abort, confirmTool, abortBackgroundSession: disconnectStream };
};

export default useOllieAssistSSE;
