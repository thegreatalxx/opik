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
  templateStructure?: PROMPT_TEMPLATE_STRUCTURE;
  changeDescription?: string;
}

interface SaveAsNewFieldArgs {
  fieldName: string;
  template: string;
  templateStructure?: PROMPT_TEMPLATE_STRUCTURE;
  changeDescription?: string;
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

  // Updates an existing prompt version and publishes a new blueprint version
  // with the updated commit. If no blueprint exists yet, creates the first one.
  const saveExistingVersion = useCallback(
    async ({
      ref,
      promptName,
      template,
      templateStructure = PROMPT_TEMPLATE_STRUCTURE.CHAT,
      changeDescription,
    }: SaveExistingArgs): Promise<SaveExistingResult | null> => {
      let version: PromptVersion;
      try {
        version = await createPromptVersion({
          name: promptName,
          template,
          templateStructure,
          ...(changeDescription && { changeDescription }),
          projectId,
          onSuccess: () => {},
        });
      } catch {
        return null;
      }
      if (!version.commit) return null;

      const newEntry: BlueprintValue = {
        key: ref.key,
        type: BlueprintValueType.PROMPT,
        value: version.commit,
      };
      let values: BlueprintValue[];
      if (latestBlueprint) {
        const found = latestBlueprint.values.some((v) => v.key === ref.key);
        values = latestBlueprint.values.map((v) =>
          v.key === ref.key
            ? { ...stripBlueprintValue(v), value: version.commit }
            : stripBlueprintValue(v),
        );
        if (!found) {
          values.push(newEntry);
        }
      } else {
        values = [newEntry];
      }

      const writeBlueprint = latestBlueprint ? patchBlueprint : postBlueprint;
      try {
        const { id } = await writeBlueprint({
          agentConfig: {
            project_id: projectId,
            blueprint: {
              type: BlueprintType.BLUEPRINT,
              values,
              ...(changeDescription && { description: changeDescription }),
            },
          },
        });
        if (!id) return null;
        invalidateAfterSave(version.commit);
        return {
          version,
          newRef: { ...ref, blueprintId: id, commitId: version.commit },
        };
      } catch {
        return null;
      }
    },
    [
      createPromptVersion,
      latestBlueprint,
      patchBlueprint,
      postBlueprint,
      projectId,
      invalidateAfterSave,
    ],
  );

  // Creates a brand-new prompt and either appends it to the latest blueprint
  // (PATCH) or, if the project has no blueprint yet, creates the first one
  // (POST) containing only this single value.
  const saveAsNewField = useCallback(
    async ({
      fieldName,
      template,
      templateStructure = PROMPT_TEMPLATE_STRUCTURE.CHAT,
      changeDescription,
    }: SaveAsNewFieldArgs): Promise<BlueprintPromptRef | null> => {
      let createdPrompt: PromptWithLatestVersion;
      try {
        createdPrompt = (await createPrompt({
          prompt: {
            name: fieldName,
            template,
            template_structure: templateStructure,
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
            blueprint: {
              type: BlueprintType.BLUEPRINT,
              values,
              ...(changeDescription && { description: changeDescription }),
            },
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
