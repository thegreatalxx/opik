import { useMutation } from "@tanstack/react-query";
import api, { LOCAL_RUNNERS_REST_ENDPOINT } from "@/api/api";

interface LocalRunnerPairResponse {
  pairing_code: string;
  runner_id: string;
  expires_in_seconds: number;
}

type UseLocalRunnerPairMutationParams = {
  projectId: string;
};

const useLocalRunnerPairMutation = () => {
  return useMutation({
    mutationFn: async ({ projectId }: UseLocalRunnerPairMutationParams) => {
      const { data } = await api.post<LocalRunnerPairResponse>(
        `${LOCAL_RUNNERS_REST_ENDPOINT}pairs`,
        { project_id: projectId },
      );

      return data;
    },
  });
};

export default useLocalRunnerPairMutation;
