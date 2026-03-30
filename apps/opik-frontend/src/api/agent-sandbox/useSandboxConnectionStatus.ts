import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import api, { AGENT_SANDBOX_KEY, LOCAL_RUNNERS_REST_ENDPOINT } from "@/api/api";
import { LocalRunner, SandboxConnectionStatus } from "@/types/agent-sandbox";

const POLL_INTERVAL = 3000;

type UseSandboxConnectionStatusParams = {
  projectId: string;
};

interface RunnersListResponse {
  content: LocalRunner[];
  total: number;
}

const getConnectedRunner = async (
  projectId: string,
  signal: AbortSignal,
): Promise<LocalRunner | null> => {
  const { data } = await api.get<RunnersListResponse>(
    LOCAL_RUNNERS_REST_ENDPOINT,
    {
      signal,
      params: { project_id: projectId, size: 50 },
    },
  );
  return (
    data.content.find((r) => r.status === SandboxConnectionStatus.CONNECTED) ??
    null
  );
};

export default function useSandboxConnectionStatus(
  { projectId }: UseSandboxConnectionStatusParams,
  options?: Partial<UseQueryOptions<LocalRunner | null>>,
) {
  return useQuery({
    queryKey: [AGENT_SANDBOX_KEY, { projectId }, "connection-status"],
    queryFn: ({ signal }) => getConnectedRunner(projectId, signal),
    enabled: !!projectId,
    refetchInterval: (query) =>
      query.state.data?.status === SandboxConnectionStatus.CONNECTED
        ? 10000
        : POLL_INTERVAL,
    ...options,
  });
}
