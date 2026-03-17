import React from "react";
import { ShieldQuestion } from "lucide-react";
import MarkdownPreview from "@/components/shared/MarkdownPreview/MarkdownPreview";
import useOllieAssistStore from "./OllieAssistStore";

type Props = {
  toolUseId: string;
  confirmToolUseId?: string;
  toolName: string;
  msgId: string;
  input?: Record<string, unknown>;
  summary?: string;
  confirmSessionId?: string;
};

const OllieAssistConfirmGate: React.FC<Props> = ({
  toolUseId,
  confirmToolUseId,
  toolName,
  msgId,
  input,
  summary,
  confirmSessionId,
}) => {
  const confirmTool = useOllieAssistStore((s) => s.confirmTool);
  const setStatus = useOllieAssistStore((s) => s.setToolCallConfirmStatus);
  const sessionId = useOllieAssistStore((s) => s.getActiveSessionId());

  const handle = (decision: string) => {
    if (!sessionId) return;
    const resolved = decision === "yes" || decision === "always";
    setStatus(sessionId, msgId, toolUseId, resolved ? "confirmed" : "denied");
    confirmTool?.(confirmToolUseId || toolUseId, decision, confirmSessionId);
  };

  const isNavigate = toolName === "navigate";
  const label = isNavigate ? "Allow navigation?" : "Allow this action?";
  const code = typeof input?.code === "string" ? input.code : null;

  const choices: { key: string; label: string; primary?: boolean }[] = [
    { key: "yes", label: "Run", primary: true },
    { key: "always", label: "Always allow" },
    { key: "no", label: "Deny" },
    { key: "never", label: "Never allow" },
  ];

  return (
    <div className="my-1.5 ml-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
      <div className="flex items-center gap-1.5">
        <ShieldQuestion className="size-3.5 shrink-0 text-amber-600" />
        <span className="font-mono text-xs font-medium text-amber-900">
          {label}
        </span>
      </div>
      {summary ? (
        <div className="mt-1.5 text-xs text-amber-900">
          <MarkdownPreview className="ollie-prose">
            {summary}
          </MarkdownPreview>
        </div>
      ) : code ? (
        <pre className="mt-1.5 max-h-48 overflow-auto rounded border border-amber-200 bg-white p-2 font-mono text-[11px] leading-relaxed text-foreground">
          {code}
        </pre>
      ) : null}
      <div className="mt-1.5 flex gap-1.5">
        {choices.map((c) => (
          <button
            key={c.key}
            onClick={() => handle(c.key)}
            className={
              c.primary
                ? "rounded border border-amber-600 bg-amber-600 px-2.5 py-0.5 font-mono text-[11px] font-medium text-white transition-colors hover:bg-amber-700"
                : "rounded border border-amber-300 bg-white px-2.5 py-0.5 font-mono text-[11px] text-amber-900 transition-colors hover:border-amber-400 hover:bg-amber-50"
            }
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
};

export default OllieAssistConfirmGate;
