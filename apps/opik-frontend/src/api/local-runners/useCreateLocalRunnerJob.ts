import { useMutation, useQueryClient } from "@tanstack/react-query";
import get from "lodash/get";
import api, {
  LOCAL_RUNNERS_KEY,
  LOCAL_RUNNERS_REST_ENDPOINT,
} from "@/api/api";
import { AxiosError } from "axios";
import { useToast } from "@/components/ui/use-toast";

type CreateLocalRunnerJobParams = {
  agent_name: string;
  inputs: Record<string, unknown>;
  project: string;
};

const useCreateLocalRunnerJob = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: CreateLocalRunnerJobParams) => {
      const { data } = await api.post(
        `${LOCAL_RUNNERS_REST_ENDPOINT}jobs`,
        params,
      );
      return data;
    },
    onError: (error: AxiosError) => {
      const message = get(
        error,
        ["response", "data", "message"],
        error.message,
      );

      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: [LOCAL_RUNNERS_KEY],
      });
    },
  });
};

export default useCreateLocalRunnerJob;
