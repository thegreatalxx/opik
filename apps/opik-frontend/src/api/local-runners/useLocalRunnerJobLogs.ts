import { QueryFunctionContext, useQuery } from "@tanstack/react-query";
import api, {
  LOCAL_RUNNERS_KEY,
  LOCAL_RUNNERS_REST_ENDPOINT,
  QueryConfig,
} from "@/api/api";
import { LocalRunnerLogEntry } from "@/types/local-runners";

type UseLocalRunnerJobLogsParams = {
  jobId: string;
};

const getLocalRunnerJobLogs = async (
  { signal }: QueryFunctionContext,
  params: UseLocalRunnerJobLogsParams,
) => {
  const { data } = await api.get<LocalRunnerLogEntry[]>(
    `${LOCAL_RUNNERS_REST_ENDPOINT}jobs/${params.jobId}/logs`,
    { signal },
  );
  return data;
};

export default function useLocalRunnerJobLogs(
  params: UseLocalRunnerJobLogsParams,
  options?: QueryConfig<LocalRunnerLogEntry[]>,
) {
  return useQuery({
    queryKey: [LOCAL_RUNNERS_KEY, { type: "logs", jobId: params.jobId } as Record<string, unknown>],
    queryFn: (context) => getLocalRunnerJobLogs(context, params),
    ...options,
    enabled: Boolean(params.jobId),
  });
}
