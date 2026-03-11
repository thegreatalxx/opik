import { create } from "zustand";
import { persist } from "zustand/middleware";

export type OllieContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_call"; toolCall: OllieToolCall }
  | { type: "subagent"; subAgent: OllieSubAgent };

export type OllieToolCall = {
  id: string;
  tool: string;
  display: string;
  completed: boolean;
  resultType?: "table" | "text" | "chart";
  result?: unknown;
  startedAt: number;
  completedAt?: number;
  confirmStatus?: "pending" | "confirmed" | "denied";
};

export type OllieSubAgent = {
  id: string;
  tool: string;
  display: string;
  completed: boolean;
  resultType?: "table" | "text" | "chart";
  result?: unknown;
  streamingContent: string;
  toolCalls: OllieNestedToolCall[];
  startedAt: number;
  completedAt?: number;
  confirmStatus?: "pending" | "confirmed" | "denied";
};

export type OllieNestedToolCall = {
  name: string;
  display: string;
  completed: boolean;
  isError: boolean;
};

export type OllieMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  blocks: OllieContentBlock[];
  isStreaming?: boolean;
  isThinking?: boolean;
};

export type OllieThread = {
  sessionId: string;
  messages: OllieMessage[];
  title: string;
  isRunning: boolean;
};

type OllieAssistState = {
  open: boolean;
  threads: Record<string, OllieThread>;
  activeThreadId: string | null;
  showNewThread: boolean;

  // Derived accessors
  getActiveThread: () => OllieThread | null;
  getActiveMessages: () => OllieMessage[];
  getActiveSessionId: () => string | null;
  isActiveRunning: () => boolean;

  toggle: () => void;
  setOpen: (open: boolean) => void;

  // Thread management
  createThread: (sessionId: string, title?: string) => void;
  setActiveThread: (threadId: string) => void;
  closeThread: (threadId: string) => void;
  setShowNewThread: (show: boolean) => void;
  updateThreadTitle: (threadId: string, title: string) => void;
  loadThread: (threadId: string, sessionId: string, title: string, messages: OllieMessage[]) => void;

  // Per-thread message actions (operate on a specific thread by sessionId)
  addUserMessage: (sessionId: string, content: string) => void;
  startAssistantMessage: (sessionId: string, id: string) => void;
  appendAssistantDelta: (sessionId: string, id: string, delta: string) => void;
  endAssistantMessage: (sessionId: string, id: string) => void;
  addToolCallStart: (
    sessionId: string,
    msgId: string,
    id: string,
    tool: string,
    display: string,
    isSubAgent: boolean,
  ) => void;
  appendToolCallDelta: (
    sessionId: string,
    msgId: string,
    toolCallId: string,
    parsed: Record<string, unknown>,
  ) => void;
  updateToolCallEnd: (
    sessionId: string,
    msgId: string,
    toolCallId: string,
    result: unknown,
    resultType?: "table" | "text" | "chart",
  ) => void;
  setThinking: (sessionId: string, id: string, isThinking: boolean) => void;
  setIsRunning: (sessionId: string, running: boolean) => void;
  setToolCallConfirmStatus: (
    sessionId: string,
    msgId: string,
    toolCallId: string,
    status: "pending" | "confirmed" | "denied",
  ) => void;
  confirmTool: ((toolUseId: string, decision: string) => void) | null;
  setConfirmTool: (
    fn: ((toolUseId: string, decision: string) => void) | null,
  ) => void;
};

const getStoredOpen = (): boolean => {
  try {
    const raw = localStorage.getItem("ollie-assist");
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return parsed?.state?.open === true;
  } catch {
    return false;
  }
};

const updateBlocks = (
  blocks: OllieContentBlock[],
  toolCallId: string,
  updater: (
    block: OllieContentBlock & { type: "tool_call" | "subagent" },
  ) => OllieContentBlock,
): OllieContentBlock[] =>
  blocks.map((b) => {
    if (b.type === "tool_call" && b.toolCall.id === toolCallId) {
      return updater(b as OllieContentBlock & { type: "tool_call" });
    }
    if (b.type === "subagent" && b.subAgent.id === toolCallId) {
      return updater(b as OllieContentBlock & { type: "subagent" });
    }
    return b;
  });

const findThreadBySession = (
  threads: Record<string, OllieThread>,
  sessionId: string,
): string | null => {
  for (const [id, thread] of Object.entries(threads)) {
    if (thread.sessionId === sessionId) return id;
  }
  return null;
};

const updateThreadMessages = (
  state: OllieAssistState,
  sessionId: string,
  updater: (messages: OllieMessage[]) => OllieMessage[],
): Partial<OllieAssistState> => {
  const threadId = findThreadBySession(state.threads, sessionId);
  if (!threadId) return {};
  const thread = state.threads[threadId];
  return {
    threads: {
      ...state.threads,
      [threadId]: { ...thread, messages: updater(thread.messages) },
    },
  };
};

const useOllieAssistStore = create<OllieAssistState>()(
  persist(
    (set, get) => ({
  open: getStoredOpen(),
  threads: {},
  activeThreadId: null,
  showNewThread: false,

  getActiveThread: () => {
    const { threads, activeThreadId } = get();
    if (!activeThreadId) return null;
    return threads[activeThreadId] ?? null;
  },

  getActiveMessages: () => {
    const thread = get().getActiveThread();
    return thread?.messages ?? [];
  },

  getActiveSessionId: () => {
    const thread = get().getActiveThread();
    return thread?.sessionId ?? null;
  },

  isActiveRunning: () => {
    const thread = get().getActiveThread();
    return thread?.isRunning ?? false;
  },

  toggle: () =>
    set((state) => ({ open: !state.open })),

  setOpen: (open) => set({ open }),

  createThread: (sessionId, title = "") =>
    set((state) => {
      const threadId = sessionId;
      return {
        threads: {
          ...state.threads,
          [threadId]: {
            sessionId,
            messages: [],
            title,
            isRunning: false,
          },
        },
        activeThreadId: threadId,
        showNewThread: false,
      };
    }),

  setActiveThread: (threadId) =>
    set({ activeThreadId: threadId, showNewThread: false }),

  closeThread: (threadId) =>
    set((state) => {
      const { [threadId]: _, ...rest } = state.threads;
      const threadIds = Object.keys(rest);
      let nextActive = state.activeThreadId;
      if (state.activeThreadId === threadId) {
        nextActive = threadIds.length > 0 ? threadIds[0] : null;
      }
      return {
        threads: rest,
        activeThreadId: nextActive,
        showNewThread: nextActive === null ? true : state.showNewThread,
      };
    }),

  setShowNewThread: (show) => set({ showNewThread: show }),

  updateThreadTitle: (threadId, title) =>
    set((state) => {
      const thread = state.threads[threadId];
      if (!thread) return {};
      return {
        threads: {
          ...state.threads,
          [threadId]: { ...thread, title },
        },
      };
    }),

  loadThread: (threadId, sessionId, title, messages) =>
    set((state) => ({
      threads: {
        ...state.threads,
        [threadId]: {
          sessionId,
          messages,
          title,
          isRunning: false,
        },
      },
      activeThreadId: threadId,
      showNewThread: false,
    })),

  addUserMessage: (sessionId, content) =>
    set((state) =>
      updateThreadMessages(state, sessionId, (msgs) => [
        ...msgs,
        { id: crypto.randomUUID(), role: "user", content, blocks: [] },
      ]),
    ),

  startAssistantMessage: (sessionId, id) =>
    set((state) =>
      updateThreadMessages(state, sessionId, (msgs) => [
        ...msgs,
        { id, role: "assistant", content: "", blocks: [], isStreaming: true },
      ]),
    ),

  appendAssistantDelta: (sessionId, id, delta) =>
    set((state) =>
      updateThreadMessages(state, sessionId, (msgs) =>
        msgs.map((m) => {
          if (m.id !== id) return m;
          const blocks = [...m.blocks];
          const last = blocks[blocks.length - 1];
          if (last?.type === "text") {
            blocks[blocks.length - 1] = { type: "text", text: last.text + delta };
          } else {
            blocks.push({ type: "text", text: delta });
          }
          return { ...m, content: m.content + delta, blocks };
        }),
      ),
    ),

  endAssistantMessage: (sessionId, id) =>
    set((state) =>
      updateThreadMessages(state, sessionId, (msgs) =>
        msgs.map((m) => (m.id === id ? { ...m, isStreaming: false } : m)),
      ),
    ),

  addToolCallStart: (sessionId, msgId, id, tool, display, isSubAgent) =>
    set((state) =>
      updateThreadMessages(state, sessionId, (msgs) =>
        msgs.map((m) => {
          if (m.id !== msgId) return m;
          const now = Date.now();
          const block: OllieContentBlock = isSubAgent
            ? {
                type: "subagent",
                subAgent: {
                  id, tool, display, completed: false,
                  streamingContent: "", toolCalls: [], startedAt: now,
                },
              }
            : {
                type: "tool_call",
                toolCall: { id, tool, display, completed: false, startedAt: now },
              };
          return { ...m, blocks: [...m.blocks, block] };
        }),
      ),
    ),

  appendToolCallDelta: (sessionId, msgId, toolCallId, parsed) =>
    set((state) =>
      updateThreadMessages(state, sessionId, (msgs) =>
        msgs.map((m) => {
          if (m.id !== msgId) return m;
          return {
            ...m,
            blocks: updateBlocks(m.blocks, toolCallId, (b) => {
              if (b.type !== "subagent") return b;
              const sa = b.subAgent;
              const type = parsed.type as string;
              if (type === "text_delta") {
                return {
                  type: "subagent",
                  subAgent: {
                    ...sa,
                    streamingContent: sa.streamingContent + (parsed.delta as string),
                  },
                };
              }
              if (type === "tool_call_start") {
                return {
                  type: "subagent",
                  subAgent: {
                    ...sa,
                    toolCalls: [
                      ...sa.toolCalls,
                      {
                        name: (parsed.tool as string) || "unknown",
                        display: (parsed.display as string) || (parsed.tool as string) || "Working...",
                        completed: false,
                        isError: false,
                      },
                    ],
                  },
                };
              }
              if (type === "tool_call_end") {
                const updated = [...sa.toolCalls];
                const last = updated.findLast((s) => !s.completed);
                if (last) {
                  last.completed = true;
                  last.isError = !!parsed.is_error;
                }
                return { type: "subagent", subAgent: { ...sa, toolCalls: updated } };
              }
              if (type === "chart_result") {
                return {
                  type: "subagent",
                  subAgent: { ...sa, resultType: "chart", result: parsed.spec },
                };
              }
              return b;
            }),
          };
        }),
      ),
    ),

  updateToolCallEnd: (sessionId, msgId, toolCallId, result, resultType) =>
    set((state) =>
      updateThreadMessages(state, sessionId, (msgs) =>
        msgs.map((m) => {
          if (m.id !== msgId) return m;
          return {
            ...m,
            blocks: updateBlocks(m.blocks, toolCallId, (b) => {
              const now = Date.now();
              if (b.type === "tool_call") {
                const keep = b.toolCall.resultType === "chart";
                return {
                  type: "tool_call",
                  toolCall: {
                    ...b.toolCall, completed: true, completedAt: now,
                    ...(!keep && { result, resultType }),
                  },
                };
              }
              if (b.type === "subagent") {
                const keep = b.subAgent.resultType === "chart";
                return {
                  type: "subagent",
                  subAgent: {
                    ...b.subAgent, completed: true, completedAt: now,
                    ...(!keep && { result, resultType }),
                  },
                };
              }
              return b;
            }),
          };
        }),
      ),
    ),

  setThinking: (sessionId, id, isThinking) =>
    set((state) =>
      updateThreadMessages(state, sessionId, (msgs) =>
        msgs.map((m) => (m.id === id ? { ...m, isThinking } : m)),
      ),
    ),

  setIsRunning: (sessionId, running) =>
    set((state) => {
      const threadId = findThreadBySession(state.threads, sessionId);
      if (!threadId) return {};
      const thread = state.threads[threadId];
      return {
        threads: {
          ...state.threads,
          [threadId]: { ...thread, isRunning: running },
        },
      };
    }),

  setToolCallConfirmStatus: (sessionId, msgId, toolCallId, status) =>
    set((state) =>
      updateThreadMessages(state, sessionId, (msgs) =>
        msgs.map((m) => {
          if (m.id !== msgId) return m;
          return {
            ...m,
            blocks: updateBlocks(m.blocks, toolCallId, (b) => {
              if (b.type === "tool_call") {
                return { type: "tool_call", toolCall: { ...b.toolCall, confirmStatus: status } };
              }
              if (b.type === "subagent") {
                return { type: "subagent", subAgent: { ...b.subAgent, confirmStatus: status } };
              }
              return b;
            }),
          };
        }),
      ),
    ),

  confirmTool: null,
  setConfirmTool: (fn) => set({ confirmTool: fn }),
}),
    {
      name: "ollie-assist",
      partialize: (state) => {
        const persistedThreads: Record<string, { sessionId: string; title: string }> = {};
        for (const [id, thread] of Object.entries(state.threads)) {
          persistedThreads[id] = { sessionId: thread.sessionId, title: thread.title };
        }
        return {
          threads: persistedThreads,
          activeThreadId: state.activeThreadId,
          open: state.open,
          confirmTool: null,
        };
      },
      merge: (persisted, current) => {
        const p = persisted as Record<string, unknown>;
        const threads: Record<string, OllieThread> = {};
        if (p?.threads) {
          for (const [id, stub] of Object.entries(
            p.threads as Record<string, { sessionId: string; title: string }>,
          )) {
            threads[id] = {
              sessionId: stub.sessionId,
              title: stub.title,
              messages: [],
              isRunning: false,
            };
          }
        }
        return {
          ...current,
          threads,
          activeThreadId: (p?.activeThreadId as string) ?? null,
          open: (p?.open as boolean) ?? false,
        };
      },
    },
  ),
);

export default useOllieAssistStore;
