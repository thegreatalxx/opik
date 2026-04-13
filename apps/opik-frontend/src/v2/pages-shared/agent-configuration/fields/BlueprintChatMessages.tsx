import React from "react";
import capitalize from "lodash/capitalize";

import { LLM_MESSAGE_ROLE_NAME_MAP } from "@/constants/llm";
import { LLM_MESSAGE_ROLE, LLMMessage } from "@/types/llm";
import { Textarea } from "@/ui/textarea";
import CollapsibleBlock from "./CollapsibleBlock";

const getRoleLabel = (role: string): string => {
  const roleKey = role.toUpperCase() as keyof typeof LLM_MESSAGE_ROLE;
  if (LLM_MESSAGE_ROLE[roleKey]) {
    return LLM_MESSAGE_ROLE_NAME_MAP[LLM_MESSAGE_ROLE[roleKey]] || role;
  }
  return capitalize(role);
};

const getContentText = (content: LLMMessage["content"]): string => {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (part.type === "text" ? part.text ?? "" : ""))
      .filter(Boolean)
      .join("\n\n");
  }
  return "";
};

type BlueprintChatMessagesProps = {
  messages: LLMMessage[];
  isExpanded: (index: number) => boolean;
  onToggle: (index: number) => void;
  editable?: boolean;
  onChangeMessage?: (index: number, content: string) => void;
  tone?: "muted" | "white";
};

const BlueprintChatMessages: React.FC<BlueprintChatMessagesProps> = ({
  messages,
  isExpanded,
  onToggle,
  editable = false,
  onChangeMessage,
  tone,
}) => {
  return (
    <div className="flex flex-col gap-2">
      {messages.map((message, index) => {
        const text = getContentText(message.content);
        return (
          <CollapsibleBlock
            key={`${message.role}-${index}`}
            label={getRoleLabel(message.role)}
            collapsible
            expanded={isExpanded(index)}
            onToggle={() => onToggle(index)}
            tone={tone}
          >
            {editable ? (
              <Textarea
                className="comet-code min-h-32"
                value={text}
                onChange={(e) => onChangeMessage?.(index, e.target.value)}
              />
            ) : (
              <div className="comet-body-s whitespace-pre-wrap break-words text-foreground">
                {text}
              </div>
            )}
          </CollapsibleBlock>
        );
      })}
    </div>
  );
};

export default BlueprintChatMessages;
