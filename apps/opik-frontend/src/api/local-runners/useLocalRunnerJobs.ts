import { QueryFunctionContext, useQuery } from "@tanstack/react-query";
import api, {
  LOCAL_RUNNERS_KEY,
  LOCAL_RUNNERS_REST_ENDPOINT,
  QueryConfig,
} from "@/api/api";
import { LocalRunnerJobsResponse } from "@/types/local-runners";

type UseLocalRunnerJobsParams = {
  runnerId: string;
  page?: number;
  size?: number;
  project?: string;
};

const getLocalRunnerJobs = async (
  { signal }: QueryFunctionContext,
  params: UseLocalRunnerJobsParams,
) => {
  const { data } = await api.get<LocalRunnerJobsResponse>(
    `${LOCAL_RUNNERS_REST_ENDPOINT}${params.runnerId}/jobs`,
    {
      signal,
      params: {
        page: params.page ?? 0,
        size: params.size ?? 25,
        ...(params.project && { project: params.project }),
      },
    },
  );
  return data;
};

export default function useLocalRunnerJobs(
  params: UseLocalRunnerJobsParams,
  options?: QueryConfig<LocalRunnerJobsResponse>,
) {
  return useQuery({
    queryKey: [LOCAL_RUNNERS_KEY, params as unknown as Record<string, unknown>],
    queryFn: (context) => getLocalRunnerJobs(context, params),
    ...options,
    enabled: Boolean(params.runnerId),
  });
}
