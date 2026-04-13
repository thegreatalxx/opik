import React, { useCallback, useRef, useState } from "react";
import { z } from "zod";

import {
  BlueprintCreate,
  BlueprintType,
  BlueprintValue,
  BlueprintValueType,
} from "@/types/agent-configs";
import useAgentConfigCreateMutation from "@/api/agent-configs/useAgentConfigCreateMutation";
import usePromptCreateMutation from "@/api/prompts/usePromptCreateMutation";
import { BlueprintValuePromptHandle } from "@/v2/pages-shared/traces/ConfigurationTab/BlueprintValuePrompt";
import { useToast } from "@/ui/use-toast";
import {
  PROMPT_TEMPLATE_STRUCTURE,
  PromptWithLatestVersion,
} from "@/types/prompts";
import { NewFieldDraft } from "./NewBlueprintFieldEditor";

import type useAgentConfigById from "@/api/agent-configs/useAgentConfigById";

type AgentConfig = NonNullable<ReturnType<typeof useAgentConfigById>["data"]>;

const nonEmptyString = z.string().min(1, "Must not be empty");

const FIELD_SCHEMAS: Partial<Record<BlueprintValueType, z.ZodType>> = {
  [BlueprintValueType.INT]: nonEmptyString.pipe(
    z.coerce.number().int("Must be an integer"),
  ),
  [BlueprintValueType.FLOAT]: nonEmptyString.pipe(
    z.coerce.number({ message: "Must be a valid number" }),
  ),
  [BlueprintValueType.STRING]: nonEmptyString,
};

export type AgentConfigPayload = {
  project_id: string;
  blueprint: BlueprintCreate;
};

const validateField = (type: string, value: string): string => {
  const schema = FIELD_SCHEMAS[type as BlueprintValueType];
  if (!schema) return "";
  const result = schema.safeParse(value.trim());
  return result.success ? "" : result.error.issues[0].message;
};

type UseAgentConfigurationSaveParams = {
  agentConfig: AgentConfig | undefined;
  draftValues: Record<string, string>;
  originalValues: React.RefObject<Record<string, string>>;
  description: string;
  projectId: string;
  onSaved: () => void;
  dirtyPromptKeys?: Record<string, boolean>;
  removedKeys?: Set<string>;
  newFields?: NewFieldDraft[];
};

const FIELD_NAME_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

const validateNewField = (
  field: NewFieldDraft,
  existingKeys: Set<string>,
  siblingKeys: Set<string>,
): string => {
  const key = field.key.trim();
  if (!key) return "Field name is required";
  if (!FIELD_NAME_PATTERN.test(key))
    return "Use letters, digits and underscore; start with a letter or underscore";
  if (existingKeys.has(key)) return "A field with this name already exists";
  if (siblingKeys.has(key)) return "Duplicate field name in the new fields";
  if (
    field.type !== BlueprintValueType.PROMPT &&
    field.type !== BlueprintValueType.BOOLEAN
  ) {
    const err = validateField(field.type, field.value);
    if (err) return err;
  }
  if (field.type === BlueprintValueType.PROMPT && !field.value.trim())
    return "Prompt content must not be empty";
  return "";
};

const buildChatTemplateFromText = (text: string): string =>
  JSON.stringify([{ role: "system", content: text }]);

export const useAgentConfigurationSave = ({
  agentConfig,
  draftValues,
  originalValues,
  description,
  projectId,
  onSaved,
  dirtyPromptKeys,
  removedKeys,
  newFields,
}: UseAgentConfigurationSaveParams) => {
  const { toast } = useToast();
  const { mutate: createConfig, isPending: isSaving } =
    useAgentConfigCreateMutation();
  const { mutateAsync: createPrompt } = usePromptCreateMutation();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const promptRefs = useRef<Record<string, BlueprintValuePromptHandle | null>>(
    {},
  );

  const clearError = useCallback((key: string) => {
    setErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const hasChanges = useCallback(() => {
    const hasScalarChanges = Object.keys(draftValues).some(
      (key) =>
        originalValues.current !== null &&
        draftValues[key] !== originalValues.current[key],
    );
    const hasPromptChanges = dirtyPromptKeys
      ? Object.values(dirtyPromptKeys).some(Boolean)
      : false;
    const hasRemovals = (removedKeys?.size ?? 0) > 0;
    const hasAdditions = (newFields?.length ?? 0) > 0;
    return hasScalarChanges || hasPromptChanges || hasRemovals || hasAdditions;
  }, [draftValues, originalValues, dirtyPromptKeys, removedKeys, newFields]);

  const validateAndBuildPayload = useCallback(
    async (type: BlueprintType): Promise<AgentConfigPayload | null> => {
      if (!agentConfig) return null;

      const removed = removedKeys ?? new Set<string>();
      const added = newFields ?? [];

      const newErrors: Record<string, string> = {};
      agentConfig.values
        .filter(
          (v) =>
            !removed.has(v.key) &&
            v.type !== BlueprintValueType.PROMPT &&
            v.type !== BlueprintValueType.BOOLEAN,
        )
        .forEach((v) => {
          const err = validateField(v.type, draftValues[v.key] ?? "");
          if (err) newErrors[v.key] = err;
        });

      for (const [key, handle] of Object.entries(promptRefs.current)) {
        if (removed.has(key)) continue;
        if (handle) {
          const err = handle.validate();
          if (err) newErrors[key] = err;
        }
      }

      const existingKeys = new Set(
        agentConfig.values.filter((v) => !removed.has(v.key)).map((v) => v.key),
      );
      const seenNewKeys = new Set<string>();
      for (const field of added) {
        const err = validateNewField(field, existingKeys, seenNewKeys);
        if (err) newErrors[field.id] = err;
        else seenNewKeys.add(field.key.trim());
      }

      if (Object.values(newErrors).some(Boolean)) {
        setErrors(newErrors);
        return null;
      }

      let promptResults: Awaited<
        ReturnType<BlueprintValuePromptHandle["saveVersion"]>
      >[];
      try {
        promptResults = await Promise.all(
          Object.entries(promptRefs.current)
            .filter(([key, handle]) => handle && !removed.has(key))
            .map(([, handle]) => handle!.saveVersion()),
        );
      } catch {
        toast({
          title: "Failed to save prompt versions",
          description: "Please try again",
          variant: "destructive",
        });
        return null;
      }

      const newCommits = new Map<string, string>();
      for (const result of promptResults) {
        if (result) {
          newCommits.set(result.key, result.commit);
        }
      }

      // Materialize new PROMPT fields by creating brand-new prompts in the
      // library; reuse the user-entered value as the system message.
      const addedValues: BlueprintValue[] = [];
      for (const field of added) {
        const key = field.key.trim();
        if (field.type === BlueprintValueType.PROMPT) {
          let created: PromptWithLatestVersion | undefined;
          try {
            created = (await createPrompt({
              prompt: {
                name: key,
                template: buildChatTemplateFromText(field.value),
                template_structure: PROMPT_TEMPLATE_STRUCTURE.CHAT,
                project_id: projectId,
              },
              withResponse: true,
            })) as PromptWithLatestVersion;
          } catch {
            return null;
          }
          const commit = created?.latest_version?.commit;
          if (!commit) return null;
          addedValues.push({
            key,
            type: BlueprintValueType.PROMPT,
            value: commit,
          });
        } else {
          addedValues.push({ key, type: field.type, value: field.value });
        }
      }

      // Always send the full set of values. Removed keys are omitted; new
      // fields are appended. PROMPT-typed entries use the newly created
      // commit if one was saved this round, otherwise the existing one.
      // Scalar entries use the draft value if edited, otherwise the original.
      const values: BlueprintValue[] = [
        ...agentConfig.values
          .filter((v) => !removed.has(v.key))
          .map((v) => {
            const isPrompt = v.type === BlueprintValueType.PROMPT;
            const value = isPrompt
              ? newCommits.get(v.key) ?? v.value
              : draftValues[v.key] ?? v.value;
            return {
              key: v.key,
              type: v.type,
              value,
              ...(v.description ? { description: v.description } : {}),
            };
          }),
        ...addedValues,
      ];

      return {
        project_id: projectId,
        blueprint: {
          description: description || undefined,
          type,
          values,
        },
      };
    },
    [
      agentConfig,
      draftValues,
      description,
      projectId,
      toast,
      removedKeys,
      newFields,
      createPrompt,
    ],
  );

  const handleSave = useCallback(async () => {
    const payload = await validateAndBuildPayload(BlueprintType.BLUEPRINT);
    if (!payload) return;

    createConfig({ agentConfig: payload }, { onSuccess: onSaved });
  }, [validateAndBuildPayload, createConfig, onSaved]);

  const buildMaskPayload = useCallback(async () => {
    return validateAndBuildPayload(BlueprintType.MASK);
  }, [validateAndBuildPayload]);

  return {
    handleSave,
    buildMaskPayload,
    hasChanges,
    isSaving,
    errors,
    clearError,
    promptRefs,
  };
};
