import { useMutation, useQueryClient } from "@tanstack/react-query";
import get from "lodash/get";
import { ollieAssistApi, SCHEDULES_KEY } from "@/api/api";
import { Schedule } from "@/types/scheduled-agents";
import { AxiosError } from "axios";
import { useToast } from "@/components/ui/use-toast";

type UseScheduleCreateMutationParams = {
  schedule: Partial<Schedule>;
};

const useScheduleCreateMutation = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ schedule }: UseScheduleCreateMutationParams) => {
      const { data } = await ollieAssistApi.post("/schedules", schedule);
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
      return queryClient.invalidateQueries({
        queryKey: [SCHEDULES_KEY],
      });
    },
  });
};

export default useScheduleCreateMutation;
