import { useMutation, useQueryClient } from "@tanstack/react-query";
import get from "lodash/get";
import { AxiosError } from "axios";

import api, { AGENT_SANDBOX_KEY, LOCAL_RUNNERS_REST_ENDPOINT } from "@/api/api";
import { CreateLocalRunnerJobRequest } from "@/types/agent-sandbox";
import { useToast } from "@/ui/use-toast";

const useSandboxCreateJobMutation = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (request: CreateLocalRunnerJobRequest) => {
      const { data } = await api.post(
        `${LOCAL_RUNNERS_REST_ENDPOINT}jobs`,
        request,
      );
      return data as { id: string };
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
        queryKey: [AGENT_SANDBOX_KEY, "jobs"],
      });
    },
  });
};

export default useSandboxCreateJobMutation;
