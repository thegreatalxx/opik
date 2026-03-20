import { QueryFunctionContext, useQuery } from "@tanstack/react-query";
import api, {
  LOCAL_RUNNERS_REST_ENDPOINT,
  LOCAL_RUNNERS_KEY,
} from "@/api/api";

interface LocalRunner {
  id: string;
  name: string;
  project_id: string;
  status: "pairing" | "connected" | "disconnected";
  connected_at: string | null;
  agents: Array<{
    name: string;
    description: string;
  }>;
}

type UseLocalRunnerByIdParams = {
  runnerId: string;
};

const getLocalRunnerById = async (
  { signal }: QueryFunctionContext,
  { runnerId }: UseLocalRunnerByIdParams,
) => {
  const { data } = await api.get<LocalRunner>(
    LOCAL_RUNNERS_REST_ENDPOINT + runnerId,
    { signal },
  );

  return data;
};

export default function useLocalRunnerById(
  params: UseLocalRunnerByIdParams,
  options?: {
    enabled?: boolean;
    refetchInterval?: number | false;
  },
) {
  return useQuery({
    queryKey: [LOCAL_RUNNERS_KEY, params],
    queryFn: (context) => getLocalRunnerById(context, params),
    ...options,
  });
}
