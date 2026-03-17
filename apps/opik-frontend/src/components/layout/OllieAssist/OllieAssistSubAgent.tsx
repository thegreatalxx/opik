import React, { useEffect, useState } from "react";
import { Check, ChevronDown, ChevronRight, X, Wrench } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { OllieNestedToolCall, OllieSubAgent } from "./OllieAssistStore";
import OllieAssistChartResult from "./OllieAssistChartResult";
import OllieAssistTableResult from "./OllieAssistTableResult";
import OllieAssistConfirmGate from "./OllieAssistConfirmGate";

const INLINE_LIMIT = 3;

const formatElapsed = (ms: number) => {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
};

const useElapsed = (startedAt: number, completedAt?: number) => {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (completedAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [completedAt]);

  const elapsed = (completedAt ?? now) - startedAt;
  return formatElapsed(elapsed);
};

const NestedToolCallLine: React.FC<{ tc: OllieNestedToolCall }> = ({ tc }) => (
  <div className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
    <span className="text-border">├</span>
    {tc.completed ? (
      tc.isError ? (
        <X className="size-2.5 text-red-500" />
      ) : (
        <Check className="size-2.5 text-emerald-600" />
      )
    ) : (
      <Spinner className="size-2.5" />
    )}
    <span>{tc.display || tc.name}</span>
  </div>
);

type Props = {
  subAgent: OllieSubAgent;
  msgId: string;
};

const OllieAssistSubAgent: React.FC<Props> = ({ subAgent, msgId }) => {
  const [expanded, setExpanded] = useState(false);
  const count = subAgent.toolCalls.length;
  const collapsed = count > INLINE_LIMIT;
  const elapsed = useElapsed(subAgent.startedAt, subAgent.completedAt);

  useEffect(() => {
    if (subAgent.completed) setExpanded(false);
  }, [subAgent.completed]);

  const visibleCalls =
    collapsed && !expanded
      ? subAgent.toolCalls.slice(0, INLINE_LIMIT)
      : subAgent.toolCalls;

  return (
    <div className="my-0.5 flex flex-col">
      <div className="flex items-center gap-2 font-mono text-xs">
        {subAgent.completed ? (
          <Check className="size-3 shrink-0 text-emerald-600" />
        ) : (
          <Spinner className="size-3 shrink-0" />
        )}
        <span className="font-medium text-foreground">{subAgent.display}</span>
        <span className="text-muted-foreground/60">{elapsed}</span>
      </div>

      {subAgent.confirmStatus === "pending" && (
        <OllieAssistConfirmGate
          toolUseId={subAgent.id}
          confirmToolUseId={subAgent.confirmToolUseId}
          toolName={subAgent.tool}
          msgId={msgId}
          input={subAgent.confirmInput}
          summary={subAgent.confirmSummary}
          confirmSessionId={subAgent.confirmSessionId}
        />
      )}

      {subAgent.streamingContent && (
        <pre className="ml-5 mt-1 max-h-40 overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-all font-mono text-xs text-muted-foreground">
          {subAgent.streamingContent}
        </pre>
      )}

      {count > 0 && (
        <div className="ml-5 flex flex-col">
          {visibleCalls.map((tc, i) => (
            <NestedToolCallLine key={i} tc={tc} />
          ))}

          {collapsed && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground hover:text-foreground"
            >
              <span className="text-border">{expanded ? "└" : "├"}</span>
              <Wrench className="size-2.5" />
              <span>
                {expanded
                  ? "show less"
                  : `${count - INLINE_LIMIT} more tool call${count - INLINE_LIMIT === 1 ? "" : "s"}`}
              </span>
              {expanded ? (
                <ChevronDown className="size-2.5" />
              ) : (
                <ChevronRight className="size-2.5" />
              )}
            </button>
          )}
        </div>
      )}

      {subAgent.completed &&
        subAgent.resultType === "table" &&
        subAgent.result != null && (
          <OllieAssistTableResult data={subAgent.result} />
        )}

      {subAgent.resultType === "chart" && subAgent.result != null && (
        <OllieAssistChartResult
          spec={subAgent.result as Record<string, unknown>}
        />
      )}
    </div>
  );
};

export default OllieAssistSubAgent;
