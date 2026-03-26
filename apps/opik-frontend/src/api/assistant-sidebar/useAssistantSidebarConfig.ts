import { QueryFunctionContext, useQuery } from "@tanstack/react-query";
import api, {
  ASSISTANT_SIDEBAR_CONFIG_REST_ENDPOINT,
  ASSISTANT_SIDEBAR_CONFIG_KEY,
  QueryConfig,
} from "@/api/api";

export interface AssistantSidebarConfig {
  enabled: boolean;
  manifest_url: string;
}

const getAssistantSidebarConfig = async ({ signal }: QueryFunctionContext) => {
  const { data } = await api.get<AssistantSidebarConfig>(
    ASSISTANT_SIDEBAR_CONFIG_REST_ENDPOINT,
    { signal },
  );
  return data;
};

export default function useAssistantSidebarConfig(
  options?: QueryConfig<AssistantSidebarConfig>,
) {
  return useQuery({
    queryKey: [ASSISTANT_SIDEBAR_CONFIG_KEY],
    queryFn: (context) => getAssistantSidebarConfig(context),
    staleTime: 5 * 60 * 1000, // 5 minutes — config rarely changes at runtime
    ...options,
  });
}
