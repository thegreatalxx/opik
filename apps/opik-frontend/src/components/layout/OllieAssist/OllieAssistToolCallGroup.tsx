import React, { useState } from "react";
import { Check, ChevronDown, ChevronRight, Wrench } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { OllieToolCall } from "./OllieAssistStore";
import OllieAssistChartResult from "./OllieAssistChartResult";
import OllieAssistTableResult from "./OllieAssistTableResult";
import OllieAssistConfirmGate from "./OllieAssistConfirmGate";

const INLINE_LIMIT = 3;

const ToolCallLine: React.FC<{ tc: OllieToolCall }> = ({ tc }) => (
  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
    {tc.completed ? (
      <Check className="size-3 text-emerald-600" />
    ) : (
      <Spinner className="size-3" />
    )}
    <span>{tc.tool}</span>
  </div>
);

type Props = {
  toolCalls: OllieToolCall[];
  msgId: string;
};

const OllieAssistToolCallGroup: React.FC<Props> = ({ toolCalls, msgId }) => {
  const [expanded, setExpanded] = useState(false);
  const count = toolCalls.length;
  const collapsed = count > INLINE_LIMIT;

  const visibleCalls =
    collapsed && !expanded ? toolCalls.slice(0, INLINE_LIMIT) : toolCalls;

  return (
    <div className="my-0.5 flex flex-col">
      {visibleCalls.map((tc) => (
        <React.Fragment key={tc.id}>
          <ToolCallLine tc={tc} />
          {tc.confirmStatus === "pending" && (
            <OllieAssistConfirmGate
              toolUseId={tc.id}
              confirmToolUseId={tc.confirmToolUseId}
              toolName={tc.tool}
              msgId={msgId}
              input={tc.confirmInput}
              summary={tc.confirmSummary}
              confirmSessionId={tc.confirmSessionId}
            />
          )}
          {tc.completed &&
            tc.resultType === "table" &&
            tc.result != null && (
              <div className="ml-5">
                <OllieAssistTableResult data={tc.result} />
              </div>
            )}
          {tc.resultType === "chart" && tc.result != null && (
            <div className="ml-5">
              <OllieAssistChartResult
                spec={tc.result as Record<string, unknown>}
              />
            </div>
          )}
        </React.Fragment>
      ))}

      {collapsed && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <Wrench className="size-3" />
          <span>
            {expanded
              ? "Show less"
              : `${count - INLINE_LIMIT} more tool call${count - INLINE_LIMIT === 1 ? "" : "s"}`}
          </span>
          {expanded ? (
            <ChevronDown className="size-3" />
          ) : (
            <ChevronRight className="size-3" />
          )}
        </button>
      )}
    </div>
  );
};

export default OllieAssistToolCallGroup;
