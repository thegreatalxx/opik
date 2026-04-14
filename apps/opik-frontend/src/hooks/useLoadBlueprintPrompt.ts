import { useEffect, useMemo, useRef } from "react";
import isEqual from "fast-deep-equal";

import { LLM_MESSAGE_ROLE, LLMMessage } from "@/types/llm";
import { generateDefaultLLMPromptMessage } from "@/lib/llm";
import { BlueprintPromptRef } from "@/types/playground";
import usePromptByCommit from "@/api/prompts/usePromptByCommit";
import { PromptByCommit } from "@/types/prompts";
import { serializeChatTemplate } from "@/lib/chatTemplate";

interface UseLoadBlueprintPromptOptions {
  selectedRef: BlueprintPromptRef | undefined;
  messages: LLMMessage[];
  onMessagesLoaded: (messages: LLMMessage[], promptName: string) => void;
  skipInitialLoad?: boolean;
}

interface UseLoadBlueprintPromptReturn {
  prompt: PromptByCommit | undefined;
  loadedRef: React.MutableRefObject<string | null>;
  template: string;
  hasUnsavedChanges: boolean;
}

const refKey = (ref: BlueprintPromptRef): string =>
  `${ref.blueprintId}-${ref.key}-${ref.commitId}`;

const messagesToTemplate = serializeChatTemplate;

const templatesEqual = (a: string, b: string): boolean => {
  try {
    const normalize = (raw: string) =>
      JSON.parse(raw).map(({ role, content }: LLMMessage) => ({
        role,
        content,
      }));
    return isEqual(normalize(a), normalize(b));
  } catch {
    return a === b;
  }
};

const parseMessages = (template: string): LLMMessage[] => {
  const parsed = JSON.parse(template) as Array<{
    role: string;
    content: unknown;
  }>;
  return parsed.map((msg) =>
    generateDefaultLLMPromptMessage({
      role: msg.role as LLM_MESSAGE_ROLE,
      content: msg.content as LLMMessage["content"],
    }),
  );
};

const useLoadBlueprintPrompt = ({
  selectedRef,
  messages,
  onMessagesLoaded,
  skipInitialLoad = false,
}: UseLoadBlueprintPromptOptions): UseLoadBlueprintPromptReturn => {
  const skippedRef = useRef(false);
  const loadedRef = useRef<string | null>(null);

  const { data: prompt } = usePromptByCommit(
    { commitId: selectedRef?.commitId ?? "" },
    { enabled: !!selectedRef?.commitId },
  );

  const versionTemplate = prompt?.requested_version?.template;

  const template = useMemo(() => messagesToTemplate(messages), [messages]);

  const hasUnsavedChanges = useMemo(() => {
    if (!selectedRef || !versionTemplate || messages.length === 0) return false;
    return !templatesEqual(template, versionTemplate);
  }, [selectedRef, versionTemplate, template, messages.length]);

  useEffect(() => {
    if (!selectedRef) {
      loadedRef.current = null;
      return;
    }
    if (!prompt || !versionTemplate) return;

    const dedupKey = `${refKey(selectedRef)}-${prompt.requested_version.id}`;
    if (loadedRef.current === dedupKey) return;

    if (skipInitialLoad && !skippedRef.current) {
      skippedRef.current = true;
      loadedRef.current = dedupKey;
      return;
    }

    try {
      loadedRef.current = dedupKey;
      onMessagesLoaded(parseMessages(versionTemplate), prompt.name);
    } catch (error) {
      console.error("Failed to parse blueprint prompt:", error);
    }
  }, [selectedRef, prompt, versionTemplate, onMessagesLoaded, skipInitialLoad]);

  return { prompt, loadedRef, template, hasUnsavedChanges };
};

export default useLoadBlueprintPrompt;
