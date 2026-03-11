import React, { useMemo } from "react";
import { useChatScroll } from "@/hooks/useChatScroll";
import useOllieAssistStore from "./OllieAssistStore";
import OllieAssistMessage from "./OllieAssistMessage";

const OllieAssistMessages: React.FC = () => {
  const activeThread = useOllieAssistStore((s) => {
    const id = s.activeThreadId;
    if (!id) return null;
    return s.threads[id] ?? null;
  });

  const messages = activeThread?.messages ?? [];
  const isRunning = activeThread?.isRunning ?? false;

  const contentLength = useMemo(
    () =>
      messages.reduce((acc, m) => {
        let len = m.content.length;
        for (const b of m.blocks) {
          if (b.type === "subagent") len += b.subAgent.streamingContent.length;
        }
        return acc + len;
      }, 0),
    [messages],
  );

  const { scrollContainerRef, handleScroll } = useChatScroll({
    contentLength,
    isStreaming: isRunning,
  });

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
        <span>Ask about your traces, experiments, or projects.</span>
      </div>
    );
  }

  return (
    <div
      ref={scrollContainerRef}
      onScroll={handleScroll}
      className="flex flex-1 flex-col overflow-y-auto px-5 py-3"
    >
      {messages.map((msg) => (
        <OllieAssistMessage key={msg.id} message={msg} />
      ))}
    </div>
  );
};

export default OllieAssistMessages;
