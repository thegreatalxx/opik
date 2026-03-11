import { QueryFunctionContext, useQuery } from "@tanstack/react-query";
import api, { QueryConfig } from "@/api/api";

export interface LocalRunner {
  id: string;
  name: string;
  agents: string[];
}

interface LocalRunnersResponse {
  content: LocalRunner[];
}

const RUNNERS_KEY = "runners";

const getRunnersList = async ({ signal }: QueryFunctionContext) => {
  const { data } = await api.get<LocalRunnersResponse>(
    "/v1/private/local-runners",
    { signal },
  );

  return data;
};

export default function useRunnersList(
  options?: QueryConfig<LocalRunnersResponse>,
) {
  return useQuery({
    queryKey: [RUNNERS_KEY, {}],
    queryFn: (context) => getRunnersList(context),
    ...options,
  });
}
