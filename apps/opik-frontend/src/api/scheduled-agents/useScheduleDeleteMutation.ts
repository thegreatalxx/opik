import { useMutation, useQueryClient } from "@tanstack/react-query";
import get from "lodash/get";
import { useToast } from "@/components/ui/use-toast";
import { ollieAssistApi, SCHEDULES_KEY } from "@/api/api";

type UseScheduleDeleteMutationParams = {
  scheduleId: string;
};

const useScheduleDeleteMutation = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ scheduleId }: UseScheduleDeleteMutationParams) => {
      const { data } = await ollieAssistApi.delete(
        `/schedules/${scheduleId}`,
      );
      return data;
    },
    onError: (error) => {
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

export default useScheduleDeleteMutation;
