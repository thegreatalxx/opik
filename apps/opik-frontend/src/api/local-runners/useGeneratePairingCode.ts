import { useMutation } from "@tanstack/react-query";
import api, { LOCAL_RUNNERS_REST_ENDPOINT } from "@/api/api";
import { LocalRunnerPairResponse } from "@/types/local-runners";

const useGeneratePairingCode = () => {
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post<LocalRunnerPairResponse>(
        `${LOCAL_RUNNERS_REST_ENDPOINT}pairs`,
      );
      return data;
    },
  });
};

export default useGeneratePairingCode;
