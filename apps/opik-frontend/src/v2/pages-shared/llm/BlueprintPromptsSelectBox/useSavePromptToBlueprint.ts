import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

import {
  BlueprintType,
  BlueprintValue,
  BlueprintValueType,
} from "@/types/agent-configs";
import {
  PROMPT_TEMPLATE_STRUCTURE,
  PromptVersion,
  PromptWithLatestVersion,
} from "@/types/prompts";
import useAgentConfigById from "@/api/agent-configs/useAgentConfigById";
import useAgentConfigCreateMutation from "@/api/agent-configs/useAgentConfigCreateMutation";
import useAgentConfigPostMutation from "@/api/agent-configs/useAgentConfigPostMutation";
import useConfigHistoryListInfinite from "@/api/agent-configs/useConfigHistoryListInfinite";
import useCreatePromptVersionMutation from "@/api/prompts/useCreatePromptVersionMutation";
import usePromptCreateMutation from "@/api/prompts/usePromptCreateMutation";
import { AGENT_CONFIGS_KEY } from "@/api/api";
import { BlueprintPromptRef } from "@/types/playground";

interface SaveExistingArgs {
  ref: BlueprintPromptRef;
  promptName: string;
  template: string;
  changeDescription?: string;
}

interface SaveAsNewFieldArgs {
  fieldName: string;
  template: string;
}

interface SaveExistingResult {
  version: PromptVersion;
  newRef: BlueprintPromptRef;
}

const stripBlueprintValue = (v: BlueprintValue): BlueprintValue => ({
  key: v.key,
  type: v.type,
  value: v.value,
  ...(v.description ? { description: v.description } : {}),
});

const useSavePromptToBlueprint = (projectId: string) => {
  const queryClient = useQueryClient();

  const { data: history } = useConfigHistoryListInfinite({ projectId });
  const latestBlueprintId = history?.pages?.[0]?.content?.[0]?.id;
  const { data: latestBlueprint } = useAgentConfigById({
    blueprintId: latestBlueprintId ?? "",
  });

  const { mutateAsync: createPromptVersion, isPending: isCreatingVersion } =
    useCreatePromptVersionMutation();
  const { mutateAsync: createPrompt, isPending: isCreatingPrompt } =
    usePromptCreateMutation();
  const { mutateAsync: postBlueprint, isPending: isPostingBlueprint } =
    useAgentConfigPostMutation();
  const { mutateAsync: patchBlueprint, isPending: isPatchingBlueprint } =
    useAgentConfigCreateMutation();

  const isSaving =
    isCreatingVersion ||
    isCreatingPrompt ||
    isPostingBlueprint ||
    isPatchingBlueprint;

  const invalidateAfterSave = useCallback(
    (commit: string) => {
      queryClient.invalidateQueries({
        queryKey: ["prompt-by-commit", { commitId: commit }],
      });
      queryClient.invalidateQueries({ queryKey: [AGENT_CONFIGS_KEY] });
    },
    [queryClient],
  );

  // Updates an existing prompt loaded from a blueprint. The backend
  // auto-publishes a new blueprint version pinning the new commit.
  const saveExistingVersion = useCallback(
    async ({
      ref,
      promptName,
      template,
      changeDescription,
    }: SaveExistingArgs): Promise<SaveExistingResult | null> => {
      try {
        const version = await createPromptVersion({
          name: promptName,
          template,
          templateStructure: PROMPT_TEMPLATE_STRUCTURE.CHAT,
          ...(changeDescription && { changeDescription }),
          projectId,
          onSuccess: () => {},
        });
        if (!version.commit) return null;
        invalidateAfterSave(version.commit);
        return {
          version,
          newRef: { ...ref, commitId: version.commit },
        };
      } catch {
        // The mutation already toasts the error.
        return null;
      }
    },
    [createPromptVersion, projectId, invalidateAfterSave],
  );

  // Creates a brand-new prompt and either appends it to the latest blueprint
  // (PATCH) or, if the project has no blueprint yet, creates the first one
  // (POST) containing only this single value.
  const saveAsNewField = useCallback(
    async ({
      fieldName,
      template,
    }: SaveAsNewFieldArgs): Promise<BlueprintPromptRef | null> => {
      let createdPrompt: PromptWithLatestVersion;
      try {
        createdPrompt = (await createPrompt({
          prompt: {
            name: fieldName,
            template,
            template_structure: PROMPT_TEMPLATE_STRUCTURE.CHAT,
            project_id: projectId,
          },
          withResponse: true,
        })) as PromptWithLatestVersion;
      } catch {
        return null;
      }

      const commit = createdPrompt?.latest_version?.commit;
      if (!commit) return null;

      const values: BlueprintValue[] = [
        ...(latestBlueprint?.values?.map(stripBlueprintValue) ?? []),
        { key: fieldName, type: BlueprintValueType.PROMPT, value: commit },
      ];

      const writeBlueprint = latestBlueprint ? patchBlueprint : postBlueprint;
      try {
        const { id } = await writeBlueprint({
          agentConfig: {
            project_id: projectId,
            blueprint: { type: BlueprintType.BLUEPRINT, values },
          },
        });
        if (!id) return null;
        invalidateAfterSave(commit);
        return { blueprintId: id, key: fieldName, commitId: commit };
      } catch {
        return null;
      }
    },
    [
      latestBlueprint,
      createPrompt,
      patchBlueprint,
      postBlueprint,
      projectId,
      invalidateAfterSave,
    ],
  );

  return {
    existingFieldNames: latestBlueprint?.values?.map((v) => v.key) ?? [],
    saveExistingVersion,
    saveAsNewField,
    isSaving,
  };
};

export default useSavePromptToBlueprint;
