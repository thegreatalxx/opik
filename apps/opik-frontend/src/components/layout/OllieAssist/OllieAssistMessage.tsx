import React, { useCallback, useMemo } from "react";
import MarkdownPreview from "@/components/shared/MarkdownPreview/MarkdownPreview";
import useOllieAssistStore from "./OllieAssistStore";
import { OllieContentBlock, OllieMessage, OllieToolCall } from "./OllieAssistStore";
import { fetchThreadMessages } from "./useThreads";
import OllieAssistToolCallGroup from "./OllieAssistToolCallGroup";
import OllieAssistSubAgent from "./OllieAssistSubAgent";

type RenderGroup =
  | { type: "text"; text: string; key: number }
  | { type: "tool_group"; toolCalls: OllieToolCall[]; key: number }
  | { type: "subagent"; block: OllieContentBlock & { type: "subagent" }; key: number };

const groupBlocks = (blocks: OllieContentBlock[]): RenderGroup[] => {
  const groups: RenderGroup[] = [];
  let pendingTools: OllieToolCall[] = [];
  let key = 0;

  const flushTools = () => {
    if (pendingTools.length > 0) {
      groups.push({ type: "tool_group", toolCalls: pendingTools, key: key++ });
      pendingTools = [];
    }
  };

  for (const block of blocks) {
    if (block.type === "tool_call") {
      pendingTools.push(block.toolCall);
    } else {
      flushTools();
      if (block.type === "text") {
        groups.push({ type: "text", text: block.text, key: key++ });
      } else if (block.type === "subagent") {
        groups.push({ type: "subagent", block, key: key++ });
      }
    }
  }
  flushTools();
  return groups;
};

type OllieAssistMessageProps = {
  message: OllieMessage;
};

const THREAD_LINK_RE = /\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/g;

const injectThreadLinks = (text: string): string =>
  text.replace(THREAD_LINK_RE, "[$1](#ollie-thread-$1)");

const OllieAssistMessage: React.FC<OllieAssistMessageProps> = ({ message }) => {
  const isUser = message.role === "user";
  const groups = useMemo(() => groupBlocks(message.blocks), [message.blocks]);
  const loadThread = useOllieAssistStore((s) => s.loadThread);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      if (target.tagName !== "A") return;
      const href = target.getAttribute("href") ?? "";
      if (!href.startsWith("#ollie-thread-")) return;
      e.preventDefault();
      const threadId = href.replace("#ollie-thread-", "");
      fetchThreadMessages(threadId)
        .then((msgs) => {
          loadThread(threadId, threadId, threadId.slice(0, 12), msgs);
        })
        .catch(() => {
          loadThread(threadId, threadId, threadId.slice(0, 12), []);
        });
    },
    [loadThread],
  );

  if (isUser) {
    return (
      <div className="mt-4 first:mt-0">
        <div className="rounded-lg bg-muted/60 px-3.5 py-2.5">
          <span className="whitespace-pre-wrap text-sm text-foreground">
            {message.content}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-1 pt-2">
      <div>
        {message.isThinking && (
          <div className="mb-1.5 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-block h-2.5 w-2.5 animate-spin rounded-full border border-muted-foreground border-t-transparent" />
            Thinking...
          </div>
        )}
        {groups.map((group) => {
          if (group.type === "text") {
            return (
              <div
                key={group.key}
                className="ollie-markdown"
                onClick={handleClick}
              >
                <MarkdownPreview className="ollie-prose">
                  {group.text ? injectThreadLinks(group.text) : null}
                </MarkdownPreview>
              </div>
            );
          }
          if (group.type === "tool_group") {
            return (
              <OllieAssistToolCallGroup
                key={group.key}
                toolCalls={group.toolCalls}
                msgId={message.id}
              />
            );
          }
          if (group.type === "subagent") {
            return (
              <OllieAssistSubAgent
                key={group.block.subAgent.id}
                subAgent={group.block.subAgent}
                msgId={message.id}
              />
            );
          }
          return null;
        })}
        {message.isStreaming && !message.isThinking && (
          <span className="inline-block h-3.5 w-0.5 animate-pulse rounded-full bg-primary/60" />
        )}
      </div>
    </div>
  );
};

export default OllieAssistMessage;
