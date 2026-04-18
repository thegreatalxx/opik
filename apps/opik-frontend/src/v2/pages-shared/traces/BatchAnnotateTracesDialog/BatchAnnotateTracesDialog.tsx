import React, { useCallback, useEffect, useMemo, useState } from "react";

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/ui/dialog";
import { Button } from "@/ui/button";
import { FEEDBACK_SCORE_TYPE, Trace, TraceFeedbackScore } from "@/types/traces";
import FeedbackScoresEditor from "@/v2/pages-shared/traces/FeedbackScoresEditor/FeedbackScoresEditor";
import { UpdateFeedbackScoreData } from "@/v2/pages-shared/traces/TraceDetailsPanel/TraceAnnotateViewer/types";
import useTracesBatchFeedbackScoreSetMutation from "@/api/traces/useTracesBatchFeedbackScoreSetMutation";

const getUiScores = (scores: TraceFeedbackScore[] | undefined) =>
  (scores ?? []).filter((score) => score.source === FEEDBACK_SCORE_TYPE.ui);

type BatchAnnotateTracesDialogProps = {
  open: boolean;
  setOpen: (open: boolean) => void;
  selectedTraces: Trace[];
  projectId: string;
  projectName: string;
};

const BatchAnnotateTracesDialog: React.FC<BatchAnnotateTracesDialogProps> = ({
  open,
  setOpen,
  selectedTraces,
  projectId,
  projectName,
}) => {
  const { mutateAsync, isPending } = useTracesBatchFeedbackScoreSetMutation();
  const initialScores = useMemo(
    () => getUiScores(selectedTraces[0]?.feedback_scores),
    [selectedTraces],
  );

  const [feedbackScores, setFeedbackScores] = useState<TraceFeedbackScore[]>(initialScores);

  useEffect(() => {
    if (open) {
      setFeedbackScores(initialScores);
    }
  }, [open, initialScores]);

  const handleUpdateFeedbackScore = useCallback((update: UpdateFeedbackScoreData) => {
    setFeedbackScores((current) => {
      const nextScore: TraceFeedbackScore = {
        name: update.name,
        value: update.value,
        reason: update.reason,
        category_name: update.categoryName,
        source: FEEDBACK_SCORE_TYPE.ui,
      };

      const withoutScore = current.filter((score) => score.name !== update.name);
      return [...withoutScore, nextScore];
    });
  }, []);

  const handleDeleteFeedbackScore = useCallback((name: string) => {
    setFeedbackScores((current) => current.filter((score) => score.name !== name));
  }, []);

  const handleSubmit = useCallback(async () => {
    const uiScores = feedbackScores.filter((score) => score.source === FEEDBACK_SCORE_TYPE.ui);
    if (!uiScores.length) {
      setOpen(false);
      return;
    }

    await mutateAsync({
      projectId,
      projectName,
      scores: selectedTraces.flatMap((trace) =>
        uiScores.map((score) => ({
          id: trace.id,
          name: score.name,
          value: score.value,
          reason: score.reason,
          categoryName: score.category_name,
        })),
      ),
    });

    setOpen(false);
  }, [feedbackScores, mutateAsync, projectId, projectName, selectedTraces, setOpen]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Annotate selected traces</DialogTitle>
          <DialogDescription>
            Apply the same human review scores to {selectedTraces.length} selected trace{selectedTraces.length === 1 ? "" : "s"}.
          </DialogDescription>
        </DialogHeader>

        <FeedbackScoresEditor
          feedbackScores={feedbackScores}
          onUpdateFeedbackScore={handleUpdateFeedbackScore}
          onDeleteFeedbackScore={handleDeleteFeedbackScore}
          className="px-0"
          header={<FeedbackScoresEditor.Header title="Human review" />}
          footer={<FeedbackScoresEditor.Footer entityCopy="traces" />}
        />

        <DialogFooter className="gap-2 pt-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            Apply to selected traces
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BatchAnnotateTracesDialog;
