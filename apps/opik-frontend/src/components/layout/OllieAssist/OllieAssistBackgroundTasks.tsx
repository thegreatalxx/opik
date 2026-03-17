import React from "react";
import { Cpu } from "lucide-react";
import useOllieAssistStore, { OllieThread } from "./OllieAssistStore";

const OllieAssistBackgroundTasks: React.FC = () => {
  const threads = useOllieAssistStore((s) => s.threads);
  const activeThreadId = useOllieAssistStore((s) => s.activeThreadId);
  const setActiveThread = useOllieAssistStore((s) => s.setActiveThread);

  const bgThreads = Object.entries(threads).filter(
    ([, t]) => t.isBackground && t.isRunning,
  );

  if (bgThreads.length === 0) return null;

  return (
    <div className="flex shrink-0 flex-col border-b border-border bg-muted/20 px-3 py-1.5">
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        <Cpu className="size-3" />
        <span>Background tasks ({bgThreads.length})</span>
      </div>
      <div className="mt-1 flex flex-col gap-0.5">
        {bgThreads.map(([id, thread]) => (
          <BgTaskRow
            key={id}
            id={id}
            thread={thread}
            isActive={id === activeThreadId}
            onSelect={() => setActiveThread(id)}
          />
        ))}
      </div>
    </div>
  );
};

const BgTaskRow: React.FC<{
  id: string;
  thread: OllieThread;
  isActive: boolean;
  onSelect: () => void;
}> = ({ thread, isActive, onSelect }) => (
  <button
    onClick={onSelect}
    className={
      isActive
        ? "flex items-center gap-1.5 rounded px-1.5 py-0.5 text-xs text-foreground bg-muted"
        : "flex items-center gap-1.5 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50"
    }
  >
    <span className="relative flex size-1.5 shrink-0">
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-blue-400 opacity-75" />
      <span className="relative inline-flex size-1.5 rounded-full bg-blue-500" />
    </span>
    <span className="truncate">{thread.title || "Background task"}</span>
  </button>
);

export default OllieAssistBackgroundTasks;
