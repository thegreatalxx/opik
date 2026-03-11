import { QueryFunctionContext, useQuery } from "@tanstack/react-query";
import api, {
  LOCAL_RUNNERS_KEY,
  LOCAL_RUNNERS_REST_ENDPOINT,
  QueryConfig,
} from "@/api/api";
import { LocalRunnersListResponse } from "@/types/local-runners";

const getLocalRunnersList = async ({ signal }: QueryFunctionContext) => {
  const { data } = await api.get<LocalRunnersListResponse>(
    LOCAL_RUNNERS_REST_ENDPOINT,
    { signal },
  );
  return data;
};

export default function useLocalRunnersList(
  options?: QueryConfig<LocalRunnersListResponse>,
) {
  return useQuery({
    queryKey: [LOCAL_RUNNERS_KEY, {}],
    queryFn: (context) => getLocalRunnersList(context),
    ...options,
  });
}
