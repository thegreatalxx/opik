import { useMutation, useQueryClient } from "@tanstack/react-query";
import get from "lodash/get";
import { AxiosError } from "axios";

import api, {
  COMPARE_EXPERIMENTS_KEY,
  TRACE_KEY,
  TRACES_KEY,
  TRACES_REST_ENDPOINT,
} from "@/api/api";
import { useToast } from "@/ui/use-toast";
import { FEEDBACK_SCORE_TYPE } from "@/types/traces";

type BatchFeedbackScore = {
  id: string;
  name: string;
  value: number;
  reason?: string;
  categoryName?: string;
};

type UseTracesBatchFeedbackScoreSetMutationParams = {
  projectId: string;
  projectName: string;
  scores: BatchFeedbackScore[];
};

const useTracesBatchFeedbackScoreSetMutation = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ projectId, projectName, scores }: UseTracesBatchFeedbackScoreSetMutationParams) => {
      const { data } = await api.put(`${TRACES_REST_ENDPOINT}feedback-scores`, {
        scores: scores.map(({ id, name, value, reason, categoryName }) => ({
          id,
          project_id: projectId,
          project_name: projectName,
          name,
          value,
          reason,
          category_name: categoryName,
          source: FEEDBACK_SCORE_TYPE.ui,
        })),
      });

      return data;
    },
    onError: (error: AxiosError) => {
      const message = get(error, ["response", "data", "message"], error.message);

      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    },
    onSettled: async (_data, _error, variables) => {
      await queryClient.invalidateQueries({ queryKey: [TRACES_KEY] });
      await queryClient.invalidateQueries({ queryKey: ["traces-columns"] });
      await queryClient.invalidateQueries({ queryKey: ["traces-statistic"] });
      await queryClient.invalidateQueries({ queryKey: [TRACE_KEY] });
      await queryClient.invalidateQueries({ queryKey: ["experiment-items-statistic"] });
      await queryClient.invalidateQueries({ queryKey: ["experiments-columns"] });
      await queryClient.invalidateQueries({ queryKey: ["experiment"] });
      await queryClient.invalidateQueries({ queryKey: [COMPARE_EXPERIMENTS_KEY] });
      await queryClient.invalidateQueries({ queryKey: ["traces-columns", { projectId: variables.projectId }] });
    },
  });
};

export default useTracesBatchFeedbackScoreSetMutation;
