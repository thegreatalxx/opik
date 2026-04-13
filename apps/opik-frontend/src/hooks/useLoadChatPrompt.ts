import { useEffect, useMemo, useRef } from "react";
import isEqual from "fast-deep-equal";
import usePromptById from "@/api/prompts/usePromptById";
import usePromptVersionById from "@/api/prompts/usePromptVersionById";
import usePromptByCommit from "@/api/prompts/usePromptByCommit";
import { LLM_MESSAGE_ROLE, LLMMessage } from "@/types/llm";
import { generateDefaultLLMPromptMessage } from "@/lib/llm";
import {
  PromptByCommit,
  PromptVersion,
  PromptWithLatestVersion,
} from "@/types/prompts";
import { BlueprintPromptRef } from "@/types/playground";

export interface UseLoadChatPromptOptions {
  selectedChatPromptId?: string;
  selectedBlueprintRef?: BlueprintPromptRef;
  messages: LLMMessage[];
  onMessagesLoaded: (messages: LLMMessage[], promptName: string) => void;
  skipInitialLoad?: boolean;
}

export interface UseLoadChatPromptReturn {
  chatPromptData: PromptWithLatestVersion | undefined;
  chatPromptDataLoaded: boolean;
  chatPromptVersionData: PromptVersion | undefined;
  chatPromptVersionDataLoaded: boolean;
  loadedChatPromptRef: React.MutableRefObject<string | null>;
  chatPromptTemplate: string;
  hasUnsavedChatPromptChanges: boolean;
}

const promptByCommitToPrompt = (
  data: PromptByCommit | undefined,
): PromptWithLatestVersion | undefined => {
  if (!data) return undefined;
  const v = data.requested_version;
  return {
    id: data.id,
    name: data.name,
    description: "",
    last_updated_at: data.last_updated_at,
    created_at: data.created_at,
    version_count: data.version_count,
    tags: [],
    template_structure: data.template_structure,
    latest_version: {
      id: v.id,
      template: v.template,
      metadata: v.metadata ?? {},
      commit: v.commit,
      prompt_id: data.id,
      created_at: v.created_at,
      type: v.type,
      change_description: v.change_description,
    },
  };
};

const useLoadChatPrompt = ({
  selectedChatPromptId,
  selectedBlueprintRef,
  messages,
  onMessagesLoaded,
  skipInitialLoad = false,
}: UseLoadChatPromptOptions): UseLoadChatPromptReturn => {
  const skippedRef = useRef(false);
  const loadedChatPromptRef = useRef<string | null>(null);

  const useBlueprint = !!selectedBlueprintRef;

  // Library-prompt branch (existing behavior)
  const { data: libraryPromptData, isSuccess: libraryPromptLoaded } =
    usePromptById(
      { promptId: selectedChatPromptId! },
      { enabled: !useBlueprint && !!selectedChatPromptId },
    );

  const { data: libraryVersionData, isSuccess: libraryVersionLoaded } =
    usePromptVersionById(
      { versionId: libraryPromptData?.latest_version?.id || "" },
      {
        enabled:
          !useBlueprint &&
          !!libraryPromptData?.latest_version?.id &&
          libraryPromptLoaded,
      },
    );

  // Blueprint-commit branch
  const { data: commitData, isSuccess: commitLoaded } = usePromptByCommit(
    { commitId: selectedBlueprintRef?.commitId ?? "" },
    { enabled: useBlueprint && !!selectedBlueprintRef?.commitId },
  );

  const chatPromptData: PromptWithLatestVersion | undefined = useBlueprint
    ? promptByCommitToPrompt(commitData)
    : libraryPromptData;

  const chatPromptDataLoaded = useBlueprint
    ? commitLoaded
    : libraryPromptLoaded;

  const chatPromptVersionData: PromptVersion | undefined = useBlueprint
    ? chatPromptData?.latest_version
    : libraryVersionData;

  const chatPromptVersionDataLoaded = useBlueprint
    ? commitLoaded
    : libraryVersionLoaded;

  const chatPromptTemplate = useMemo(
    () =>
      JSON.stringify(
        messages.map((msg) => ({ role: msg.role, content: msg.content })),
      ),
    [messages],
  );

  const selectionKey = useBlueprint
    ? selectedBlueprintRef
      ? `${selectedBlueprintRef.blueprintId}-${selectedBlueprintRef.key}-${selectedBlueprintRef.commitId}`
      : null
    : selectedChatPromptId ?? null;

  const hasUnsavedChatPromptChanges = useMemo(() => {
    const hasContent = messages.length > 0;

    if (!hasContent || !selectionKey) {
      return false;
    }

    if (!useBlueprint) {
      if (!chatPromptData || chatPromptData.id !== selectedChatPromptId) {
        return false;
      }
    }

    if (!chatPromptVersionData?.template) {
      return false;
    }

    try {
      const currentTemplate = JSON.parse(chatPromptTemplate);
      const loadedTemplate = JSON.parse(chatPromptVersionData.template);

      const normalizeTemplate = (
        template: Array<{
          role: string;
          content: unknown;
          promptId?: string;
          promptVersionId?: string;
        }>,
      ) => template.map(({ role, content }) => ({ role, content }));

      const normalizedCurrent = normalizeTemplate(currentTemplate);
      const normalizedLoaded = normalizeTemplate(loadedTemplate);

      return !isEqual(normalizedCurrent, normalizedLoaded);
    } catch {
      return !isEqual(chatPromptTemplate, chatPromptVersionData.template);
    }
  }, [
    selectionKey,
    useBlueprint,
    selectedChatPromptId,
    chatPromptData,
    chatPromptVersionData,
    chatPromptTemplate,
    messages.length,
  ]);

  useEffect(() => {
    const versionId = chatPromptVersionData?.id;
    const dedupKey =
      selectionKey && versionId ? `${selectionKey}-${versionId}` : null;

    if (
      chatPromptVersionData?.template &&
      selectionKey &&
      chatPromptData &&
      chatPromptVersionDataLoaded &&
      dedupKey &&
      loadedChatPromptRef.current !== dedupKey
    ) {
      if (skipInitialLoad && !skippedRef.current) {
        skippedRef.current = true;
        loadedChatPromptRef.current = dedupKey;
        return;
      }

      try {
        loadedChatPromptRef.current = dedupKey;

        const parsedMessages = JSON.parse(chatPromptVersionData.template);

        const newMessages: LLMMessage[] = parsedMessages.map(
          (msg: { role: string; content: unknown }) =>
            generateDefaultLLMPromptMessage({
              role: msg.role as LLM_MESSAGE_ROLE,
              content: msg.content as LLMMessage["content"],
            }),
        );

        onMessagesLoaded(newMessages, chatPromptData.name);
      } catch (error) {
        console.error("Failed to parse chat prompt:", error);
      }
    }

    if (!selectionKey) {
      loadedChatPromptRef.current = null;
    }
  }, [
    chatPromptVersionData,
    selectionKey,
    chatPromptData,
    chatPromptVersionDataLoaded,
    onMessagesLoaded,
    skipInitialLoad,
  ]);

  return {
    chatPromptData,
    chatPromptDataLoaded,
    chatPromptVersionData,
    chatPromptVersionDataLoaded,
    loadedChatPromptRef,
    chatPromptTemplate,
    hasUnsavedChatPromptChanges,
  };
};

export default useLoadChatPrompt;
