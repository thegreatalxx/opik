import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import get from "lodash/get";

import { ollieAssistApi, SCHEDULES_KEY } from "@/api/api";
import { Schedule } from "@/types/scheduled-agents";
import { useToast } from "@/components/ui/use-toast";

type UseScheduleUpdateMutationParams = {
  schedule: Partial<Schedule>;
  scheduleId: string;
};

const useScheduleUpdateMutation = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      schedule,
      scheduleId,
    }: UseScheduleUpdateMutationParams) => {
      const { data } = await ollieAssistApi.put(
        `/schedules/${scheduleId}`,
        schedule,
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
      return queryClient.invalidateQueries({
        queryKey: [SCHEDULES_KEY],
      });
    },
  });
};

export default useScheduleUpdateMutation;
