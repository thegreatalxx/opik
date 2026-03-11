import { useCallback, useRef } from "react";
import { useRouter } from "@tanstack/react-router";
import { processSSEChunk } from "@/api/playground/useCompletionProxyStreaming";
import useAppStore from "@/store/AppStore";
import useOllieAssistStore from "./OllieAssistStore";
import { captureSnapshot } from "./captureSnapshot";

const OLLIE_ASSIST_URL =
  import.meta.env.VITE_OLLIE_ASSIST_URL || "http://localhost:8081";

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

const useOllieAssistSSE = () => {
  const abortRef = useRef<AbortController | null>(null);
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
    async (toolUseId: string, decision: string) => {
      const sessionId = store.getState().getActiveSessionId();
      if (!sessionId) return;
      try {
        await fetch(`${OLLIE_ASSIST_URL}/chat/confirm`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: sessionId,
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

  const sendMessage = useCallback(
    async (message: string) => {
      const state = store.getState();
      const isNewThread = state.showNewThread || !state.activeThreadId;
      let sessionId = isNewThread ? null : state.getActiveSessionId();

      if (!sessionId) {
        sessionId = crypto.randomUUID();
        const title = message.slice(0, 80);
        state.createThread(sessionId, title);
      } else if (state.showNewThread) {
        state.setShowNewThread(false);
      }

      const thread = store.getState().getActiveThread();
      const existingMessages = thread?.messages ?? [];

      state.addUserMessage(sessionId, message);
      state.setIsRunning(sessionId, true);

      const assistantMsgId = crypto.randomUUID();
      state.startAssistantMessage(sessionId, assistantMsgId);

      const abortController = new AbortController();
      abortRef.current = abortController;

      try {
        const snapshot = captureSnapshot();

        const history =
          existingMessages.length > 0
            ? existingMessages
                .filter((m) => m.content)
                .map((m) => ({ role: m.role, content: m.content }))
            : undefined;

        const response = await fetch(`${OLLIE_ASSIST_URL}/chat`, {
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
            history,
          }),
          signal: abortController.signal,
          credentials: "include",
        });

        if (!response.ok) {
          const errorText = await response.text();
          store.getState().appendAssistantDelta(
            sessionId,
            assistantMsgId,
            `Error: ${response.status} — ${errorText || response.statusText}`,
          );
          store.getState().endAssistantMessage(sessionId, assistantMsgId);
          store.getState().setIsRunning(sessionId, false);
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          store.getState().endAssistantMessage(sessionId, assistantMsgId);
          store.getState().setIsRunning(sessionId, false);
          return;
        }

        // Update session ID if backend assigned a different one
        const newSessionId = response.headers.get("X-Session-Id");
        if (newSessionId && newSessionId !== sessionId) {
          sessionId = newSessionId;
        }

        const decoder = new TextDecoder("utf-8");
        let lineBuffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const { lines, newBuffer } = processSSEChunk(chunk, lineBuffer);
          lineBuffer = newBuffer;

          const events = parseSSEEvents(lines);

          for (const evt of events) {
            const parsed = (() => {
              try {
                return JSON.parse(evt.data);
              } catch {
                return null;
              }
            })();

            switch (evt.event) {
              case "message_start":
                break;

              case "thinking_start":
                store.getState().setThinking(sessionId!, assistantMsgId, true);
                break;

              case "thinking_delta":
                break;

              case "thinking_end":
                store.getState().setThinking(sessionId!, assistantMsgId, false);
                break;

              case "message_delta":
                if (parsed?.delta) {
                  store
                    .getState()
                    .appendAssistantDelta(sessionId!, assistantMsgId, parsed.delta);
                }
                break;

              case "message_end":
                store.getState().endAssistantMessage(sessionId!, assistantMsgId);
                break;

              case "tool_call_start":
                if (parsed) {
                  store.getState().addToolCallStart(
                    sessionId!,
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
                  store
                    .getState()
                    .appendToolCallDelta(sessionId!, assistantMsgId, parsed.id, parsed);
                }
                break;

              case "tool_call_end":
                if (parsed) {
                  store.getState().updateToolCallEnd(
                    sessionId!,
                    assistantMsgId,
                    parsed.id,
                    parsed.result,
                    parsed.result_type,
                  );
                }
                break;

              case "navigate":
                if (parsed?.path) {
                  handleNavigate(parsed.path);
                }
                break;

              case "highlight":
                if (parsed?.uid) {
                  handleHighlight(parsed.uid);
                }
                break;

              case "confirm_required":
                if (parsed?.tool_use_id) {
                  store
                    .getState()
                    .setToolCallConfirmStatus(
                      sessionId!,
                      assistantMsgId,
                      parsed.tool_use_id,
                      "pending",
                    );
                }
                break;
            }
          }
        }
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          store
            .getState()
            .appendAssistantDelta(sessionId, assistantMsgId, "\n\n*Connection error.*");
        }
      } finally {
        store.getState().endAssistantMessage(sessionId, assistantMsgId);
        store.getState().setIsRunning(sessionId, false);
        abortRef.current = null;
      }
    },
    [store, handleNavigate, handleHighlight],
  );

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  return { sendMessage, abort, confirmTool };
};

export default useOllieAssistSSE;
