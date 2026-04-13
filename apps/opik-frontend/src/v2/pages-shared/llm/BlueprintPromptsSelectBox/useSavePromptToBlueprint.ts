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

interface UseSavePromptToBlueprintReturn {
  existingFieldNames: string[];
  saveExistingVersion: (args: SaveExistingArgs) => Promise<{
    version: PromptVersion;
    newRef: BlueprintPromptRef;
  } | null>;
  saveAsNewField: (
    args: SaveAsNewFieldArgs,
  ) => Promise<BlueprintPromptRef | null>;
  isSaving: boolean;
}

const stripValueForPayload = (v: BlueprintValue): BlueprintValue => ({
  key: v.key,
  type: v.type,
  value: v.value,
  ...(v.description ? { description: v.description } : {}),
});

const useSavePromptToBlueprint = (
  projectId: string,
): UseSavePromptToBlueprintReturn => {
  const queryClient = useQueryClient();

  const { data: history } = useConfigHistoryListInfinite({ projectId });
  const latestBlueprintId = history?.pages?.[0]?.content?.[0]?.id;
  const { data: latestBlueprintFull } = useAgentConfigById({
    blueprintId: latestBlueprintId ?? "",
  });

  const { mutateAsync: createPromptVersion, isPending: isCreatingVersion } =
    useCreatePromptVersionMutation();
  const { mutateAsync: createPrompt, isPending: isCreatingPrompt } =
    usePromptCreateMutation();
  const { mutateAsync: createBlueprint, isPending: isCreatingBlueprint } =
    useAgentConfigCreateMutation();

  const isSaving = isCreatingVersion || isCreatingPrompt || isCreatingBlueprint;

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
  // auto-publishes a new blueprint version pinning this commit.
  const saveExistingVersion = useCallback<
    UseSavePromptToBlueprintReturn["saveExistingVersion"]
  >(
    async ({ ref, promptName, template, changeDescription }) => {
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
        // useCreatePromptVersionMutation already toasts the error
        return null;
      }
    },
    [createPromptVersion, projectId, invalidateAfterSave],
  );

  // Creates a brand-new prompt and either appends it to the latest blueprint
  // as a new PROMPT-typed value (preserving all existing values) or, if the
  // project has no blueprint yet, creates the first blueprint with this
  // single value.
  const saveAsNewField = useCallback<
    UseSavePromptToBlueprintReturn["saveAsNewField"]
  >(
    async ({ fieldName, template }) => {
      let newPrompt: PromptWithLatestVersion | undefined;
      try {
        newPrompt = (await createPrompt({
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

      const commit = newPrompt?.latest_version?.commit;
      if (!commit || !newPrompt?.id) return null;

      const newValue: BlueprintValue = {
        key: fieldName,
        type: BlueprintValueType.PROMPT,
        value: commit,
      };

      const values: BlueprintValue[] = [
        ...(latestBlueprintFull?.values?.map(stripValueForPayload) ?? []),
        newValue,
      ];

      let blueprintIdForRef: string;
      try {
        const { id } = await createBlueprint({
          agentConfig: {
            project_id: projectId,
            blueprint: { type: BlueprintType.BLUEPRINT, values },
          },
        });
        if (!id) return null;
        blueprintIdForRef = id;
      } catch {
        return null;
      }

      invalidateAfterSave(commit);
      return {
        blueprintId: blueprintIdForRef,
        key: fieldName,
        commitId: commit,
      };
    },
    [
      latestBlueprintFull,
      createPrompt,
      createBlueprint,
      projectId,
      invalidateAfterSave,
    ],
  );

  return {
    existingFieldNames: latestBlueprintFull?.values?.map((v) => v.key) ?? [],
    saveExistingVersion,
    saveAsNewField,
    isSaving,
  };
};

export default useSavePromptToBlueprint;
