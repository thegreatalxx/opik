import React from "react";
import { ShieldQuestion } from "lucide-react";
import useOllieAssistStore from "./OllieAssistStore";

type Props = {
  toolUseId: string;
  toolName: string;
  msgId: string;
};

const OllieAssistConfirmGate: React.FC<Props> = ({
  toolUseId,
  toolName,
  msgId,
}) => {
  const confirmTool = useOllieAssistStore((s) => s.confirmTool);
  const setStatus = useOllieAssistStore((s) => s.setToolCallConfirmStatus);
  const sessionId = useOllieAssistStore((s) => s.getActiveSessionId());

  const handle = (decision: string) => {
    if (!sessionId) return;
    const resolved = decision === "yes" || decision === "always";
    setStatus(sessionId, msgId, toolUseId, resolved ? "confirmed" : "denied");
    confirmTool?.(toolUseId, decision);
  };

  const isNavigate = toolName === "navigate";
  const label = isNavigate ? "Allow navigation?" : "Allow this action?";

  const choices: { key: string; label: string; primary?: boolean }[] = [
    { key: "yes", label: "Yes", primary: true },
    { key: "always", label: "Always" },
    { key: "no", label: "No" },
    ...(isNavigate ? [{ key: "never", label: "Never" }] : []),
  ];

  return (
    <div className="my-1.5 ml-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
      <div className="flex items-center gap-1.5">
        <ShieldQuestion className="size-3.5 shrink-0 text-amber-600" />
        <span className="font-mono text-xs font-medium text-amber-900">
          {label}
        </span>
      </div>
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
