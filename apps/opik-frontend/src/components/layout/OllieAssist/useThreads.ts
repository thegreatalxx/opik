import { QueryFunctionContext, useQuery } from "@tanstack/react-query";
import { ollieAssistApi, THREADS_KEY, QueryConfig } from "@/api/api";
import { OllieMessage } from "./OllieAssistStore";

export type ThreadSummary = {
  id: string;
  title: string;
  type: string;
  agent_name: string | null;
  message_count: number;
  match_snippet: string | null;
  is_live: boolean;
  created_at: string;
  updated_at: string;
};

type SessionsApiResponse = {
  threads: ThreadSummary[];
  total: number;
  page: number;
  page_size: number;
};

type SessionsPage = {
  content: ThreadSummary[];
  total: number;
  page: number;
  size: number;
};

type UseSessionsListParams = {
  page?: number;
  size?: number;
  search?: string;
};

const getSessionsList = async (
  { signal }: QueryFunctionContext,
  { page = 1, size = 20, search }: UseSessionsListParams,
) => {
  const { data } = await ollieAssistApi.get<SessionsApiResponse>("/sessions", {
    signal,
    params: {
      page,
      size,
      ...(search ? { search } : {}),
    },
  });
  return {
    content: data.threads,
    total: data.total,
    page: data.page,
    size: data.page_size,
  };
};

export function useThreadsList(
  params: UseSessionsListParams,
  options?: QueryConfig<SessionsPage>,
) {
  return useQuery({
    queryKey: [THREADS_KEY, params],
    queryFn: (context) => getSessionsList(context, params),
    ...options,
  });
}

export function extractThreadTitle(thread: ThreadSummary): string {
  return thread.title || thread.id.slice(0, 12);
}

type SessionMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

type SessionDetail = {
  id: string;
  title: string;
  is_live: boolean;
  messages: SessionMessage[];
};

export type FetchThreadResult = {
  messages: OllieMessage[];
  isLive: boolean;
};

export async function fetchThread(
  sessionId: string,
): Promise<FetchThreadResult> {
  const { data } = await ollieAssistApi.get<SessionDetail>(
    `/sessions/${sessionId}`,
  );

  const messages = (data.messages ?? []).map((msg) => ({
    id: msg.id,
    role: msg.role as "user" | "assistant",
    content: msg.content,
    blocks: [{ type: "text" as const, text: msg.content }],
  }));

  return { messages, isLive: data.is_live };
}

export async function fetchLiveThreads(): Promise<ThreadSummary[]> {
  const { data } = await ollieAssistApi.get<SessionsApiResponse>("/sessions", {
    params: { page: 1, size: 50 },
  });
  return (data.threads ?? []).filter((t) => t.is_live);
}

export async function deleteSession(sessionId: string): Promise<void> {
  await ollieAssistApi.delete(`/sessions/${sessionId}`);
}
