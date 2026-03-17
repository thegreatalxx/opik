import React, { useRef, useEffect, useCallback } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import useOllieAssistStore, { OllieThread } from "./OllieAssistStore";

const ThreadTab: React.FC<{
  threadId: string;
  thread: OllieThread;
  isActive: boolean;
  onSelect: () => void;
  onClose: (e: React.MouseEvent) => void;
}> = ({ thread, isActive, onSelect, onClose }) => (
  <button
    className={cn(
      "group flex shrink-0 items-center gap-1.5 border-b-2 px-2.5 py-1.5 text-xs transition-colors",
      isActive
        ? "border-primary text-foreground"
        : "border-transparent text-muted-foreground hover:text-foreground",
    )}
    onClick={onSelect}
  >
    {thread.isRunning && (
      <span className="relative flex size-1.5">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75" />
        <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
      </span>
    )}
    <span className="max-w-[120px] truncate">
      {thread.title || "New chat"}
    </span>
    <span
      role="button"
      className="ml-0.5 hidden rounded p-0.5 hover:bg-muted group-hover:inline-flex"
      onClick={onClose}
    >
      <X className="size-2.5" />
    </span>
  </button>
);

const OllieAssistThreadTabs: React.FC = () => {
  const threads = useOllieAssistStore((s) => s.threads);
  const activeThreadId = useOllieAssistStore((s) => s.activeThreadId);
  const setActiveThread = useOllieAssistStore((s) => s.setActiveThread);
  const closeThread = useOllieAssistStore((s) => s.closeThread);
  const abortBg = useOllieAssistStore((s) => s.abortBackgroundSession);
  const setShowNewThread = useOllieAssistStore((s) => s.setShowNewThread);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleCloseThread = useCallback(
    (id: string) => {
      const thread = threads[id];
      if (thread?.isRunning) {
        abortBg?.(id);
      }
      closeThread(id);
    },
    [threads, closeThread, abortBg],
  );

  const threadEntries = Object.entries(threads);

  useEffect(() => {
    if (scrollRef.current && activeThreadId) {
      const activeTab = scrollRef.current.querySelector(
        `[data-thread-id="${activeThreadId}"]`,
      );
      activeTab?.scrollIntoView({ behavior: "smooth", inline: "nearest" });
    }
  }, [activeThreadId]);

  if (threadEntries.length === 0) return null;

  return (
    <div className="flex shrink-0 items-center border-b border-border bg-muted/30">
      <div
        ref={scrollRef}
        className="flex flex-1 items-center overflow-x-auto scrollbar-none"
      >
        {threadEntries.map(([id, thread]) => (
          <div key={id} data-thread-id={id}>
            <ThreadTab
              threadId={id}
              thread={thread}
              isActive={id === activeThreadId}
              onSelect={() => setActiveThread(id)}
              onClose={(e) => {
                e.stopPropagation();
                handleCloseThread(id);
              }}
            />
          </div>
        ))}
      </div>
      <button
        className="flex shrink-0 items-center justify-center px-2 py-1.5 text-muted-foreground hover:text-foreground"
        onClick={() => setShowNewThread(true)}
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );
};

export default OllieAssistThreadTabs;
