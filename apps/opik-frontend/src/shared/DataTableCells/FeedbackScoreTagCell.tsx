import React from "react";
import { CellContext } from "@tanstack/react-table";
import isObject from "lodash/isObject";

import { TraceFeedbackScore } from "@/types/traces";
import { ROW_HEIGHT } from "@/types/shared";
import { FEEDBACK_SCORE_TAG_SIZE_MAP } from "@/constants/shared";
import CellWrapper from "@/shared/DataTableCells/CellWrapper";
import FeedbackScoreTag from "@/shared/FeedbackScoreTag/FeedbackScoreTag";

const FeedbackScoreTagCell = (context: CellContext<unknown, unknown>) => {
  const feedbackScore = context.getValue() as TraceFeedbackScore | undefined;
  const rowHeight = context.table.options.meta?.rowHeight ?? ROW_HEIGHT.small;
  const tagSize = FEEDBACK_SCORE_TAG_SIZE_MAP[rowHeight];

  return (
    <CellWrapper
      metadata={context.column.columnDef.meta}
      tableMetadata={context.table.options.meta}
      className="gap-1"
    >
      {isObject(feedbackScore) ? (
        <FeedbackScoreTag
          label={feedbackScore.name}
          value={feedbackScore.value}
          reason={feedbackScore.reason}
          className="overflow-hidden"
          size={tagSize}
        />
      ) : (
        "-"
      )}
    </CellWrapper>
  );
};

export default FeedbackScoreTagCell;
