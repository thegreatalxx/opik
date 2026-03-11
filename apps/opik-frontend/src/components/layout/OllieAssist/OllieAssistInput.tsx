import React, { useCallback, useRef, useState } from "react";
import TextareaAutosize from "react-textarea-autosize";
import { ArrowUp, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import useOllieAssistStore from "./OllieAssistStore";

type OllieAssistInputProps = {
  onSend: (message: string) => void;
  onStop: () => void;
};

const OllieAssistInput: React.FC<OllieAssistInputProps> = ({
  onSend,
  onStop,
}) => {
  const [value, setValue] = useState("");
  const isRunning = useOllieAssistStore((s) => {
    const id = s.activeThreadId;
    if (!id) return false;
    return s.threads[id]?.isRunning ?? false;
  });
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setValue("");
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [value, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div className="border-t border-border bg-white p-3">
      <div className="flex items-end gap-2 rounded-lg border border-border bg-background px-3 py-2 focus-within:border-primary">
        <TextareaAutosize
          ref={textareaRef}
          className="flex-1 resize-none bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          placeholder="Ask a question..."
          minRows={1}
          maxRows={5}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        {isRunning ? (
          <Button
            variant="outline"
            size="icon-sm"
            className="shrink-0 text-destructive hover:text-destructive"
            onClick={onStop}
          >
            <Square className="size-3" />
          </Button>
        ) : (
          <Button
            variant="default"
            size="icon-sm"
            className="shrink-0"
            onClick={handleSend}
            disabled={!value.trim()}
          >
            <ArrowUp className="size-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
};

export default OllieAssistInput;
