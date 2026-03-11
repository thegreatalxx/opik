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
  created_at: string;
  updated_at: string;
};

type ThreadsApiResponse = {
  threads: ThreadSummary[];
  total: number;
  page: number;
  page_size: number;
};

type ThreadsPage = {
  content: ThreadSummary[];
  total: number;
  page: number;
  size: number;
};

type ThreadMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

type ThreadDetail = {
  id: string;
  title: string;
  messages: ThreadMessage[];
};

type UseThreadsListParams = {
  page?: number;
  size?: number;
  search?: string;
};

const getThreadsList = async (
  { signal }: QueryFunctionContext,
  { page = 1, size = 20, search }: UseThreadsListParams,
) => {
  const { data } = await ollieAssistApi.get<ThreadsApiResponse>("/threads", {
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
  params: UseThreadsListParams,
  options?: QueryConfig<ThreadsPage>,
) {
  return useQuery({
    queryKey: [THREADS_KEY, params],
    queryFn: (context) => getThreadsList(context, params),
    ...options,
  });
}

export function extractThreadTitle(thread: ThreadSummary): string {
  return thread.title || thread.id.slice(0, 12);
}

export async function fetchThreadMessages(
  threadId: string,
): Promise<OllieMessage[]> {
  const { data } = await ollieAssistApi.get<ThreadDetail>(
    `/threads/${threadId}`,
  );

  return (data.messages ?? []).map((msg) => ({
    id: msg.id,
    role: msg.role,
    content: msg.content,
    blocks: [{ type: "text" as const, text: msg.content }],
  }));
}
