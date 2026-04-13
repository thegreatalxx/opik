import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  BlueprintValue,
  BlueprintValueType,
  ConfigHistoryItem,
} from "@/types/agent-configs";
import useAgentConfigById from "@/api/agent-configs/useAgentConfigById";
import { Input } from "@/ui/input";
import { Switch } from "@/ui/switch";
import { Textarea } from "@/ui/textarea";
import Loader from "@/shared/Loader/Loader";
import TooltipWrapper from "@/shared/TooltipWrapper/TooltipWrapper";
import BlueprintTypeIcon from "@/v2/pages-shared/traces/ConfigurationTab/BlueprintTypeIcon";
import BlueprintValuePrompt from "@/v2/pages-shared/traces/ConfigurationTab/BlueprintValuePrompt";
import useNavigationBlocker from "@/hooks/useNavigationBlocker";
import CollapsibleField from "./fields/CollapsibleField";
import {
  collectMultiLineKeys,
  isMultiLineField,
} from "./fields/blueprintFieldLayout";
import {
  FieldsCollapseController,
  useFieldsCollapse,
} from "./fields/useFieldsCollapse";
import BlueprintDiffTable from "./BlueprintDiffDialog/BlueprintDiffTable";
import {
  useAgentConfigurationSave,
  AgentConfigPayload,
} from "./useAgentConfigurationSave";

export type AgentConfigurationEditViewHandle = {
  hasChanges: () => boolean;
  buildMaskPayload: () => Promise<AgentConfigPayload | null>;
  save: () => Promise<void>;
};

export type AgentConfigurationEditViewState = {
  isDirty: boolean;
  isSaving: boolean;
  hasErrors: boolean;
  collapsibleKeys: string[];
};

type AgentConfigurationEditViewProps = {
  item: ConfigHistoryItem;
  projectId: string;
  onSaved: (savedVersionName?: string) => void;
  view?: "edit" | "diff";
  showNotes?: boolean;
  controller?: FieldsCollapseController;
  onStateChange?: (state: AgentConfigurationEditViewState) => void;
  blockNavigation?: boolean;
};

const AgentConfigurationEditView = React.forwardRef<
  AgentConfigurationEditViewHandle,
  AgentConfigurationEditViewProps
>(
  (
    {
      item,
      projectId,
      onSaved,
      view = "edit",
      showNotes = false,
      controller: externalController,
      onStateChange,
      blockNavigation = true,
    },
    ref,
  ) => {
    const { data: agentConfig, isPending } = useAgentConfigById({
      blueprintId: item.id,
    });

    const [description, setDescription] = useState("");
    const [draftValues, setDraftValues] = useState<Record<string, string>>({});
    const [dirtyPromptKeys, setDirtyPromptKeys] = useState<
      Record<string, boolean>
    >({});
    const originalValues = useRef<Record<string, string>>({});
    const initialized = useRef(false);

    const handleSaveComplete = useCallback(() => {
      originalValues.current = { ...draftValues };
      setDirtyPromptKeys({});
      const savedName = item.name;
      setDescription("");
      onSaved(savedName);
    }, [draftValues, onSaved, item.name]);

    const {
      handleSave,
      buildMaskPayload,
      hasChanges,
      isSaving,
      errors,
      clearError,
      promptRefs,
    } = useAgentConfigurationSave({
      agentConfig,
      draftValues,
      originalValues,
      description,
      projectId,
      onSaved: handleSaveComplete,
      dirtyPromptKeys,
    });

    useImperativeHandle(ref, () => ({
      hasChanges,
      buildMaskPayload,
      save: handleSave,
    }));

    useEffect(() => {
      if (agentConfig && !initialized.current) {
        initialized.current = true;
        const initial: Record<string, string> = {};
        agentConfig.values
          .filter((v) => v.type !== BlueprintValueType.PROMPT)
          .forEach((v) => {
            initial[v.key] = v.value;
          });
        originalValues.current = initial;
        setDraftValues(initial);
      }
    }, [agentConfig]);

    const handleFieldChange = (key: string, value: string) => {
      setDraftValues((prev) => ({ ...prev, [key]: value }));
      if (errors[key]) {
        clearError(key);
      }
    };

    const collapsibleKeys = useMemo(
      () => collectMultiLineKeys(agentConfig?.values ?? []),
      [agentConfig],
    );

    const internalController = useFieldsCollapse({ collapsibleKeys });
    const controller = externalController ?? internalController;

    const currentValues = useMemo<BlueprintValue[]>(() => {
      if (!agentConfig) return [];
      return agentConfig.values.map((v) =>
        v.type === BlueprintValueType.PROMPT
          ? v
          : { ...v, value: draftValues[v.key] ?? v.value },
      );
    }, [agentConfig, draftValues]);

    const diffPromptTemplates = useMemo<Record<string, string>>(() => {
      const out: Record<string, string> = {};
      for (const [key, handle] of Object.entries(promptRefs.current)) {
        if (handle && dirtyPromptKeys[key]) {
          out[key] = handle.getCurrentTemplate();
        }
      }
      return out;
    }, [dirtyPromptKeys, promptRefs]);

    const hasErrors = Object.values(errors).some(Boolean);
    const isDirty = hasChanges();

    useEffect(() => {
      onStateChange?.({
        isDirty,
        isSaving,
        hasErrors,
        collapsibleKeys,
      });
    }, [isDirty, isSaving, hasErrors, collapsibleKeys, onStateChange]);

    const { DialogComponent } = useNavigationBlocker({
      condition: blockNavigation && isDirty,
      title: "You have unsaved changes",
      description:
        "If you leave now, your changes will be lost. Are you sure you want to continue?",
      confirmText: "Leave without saving",
      cancelText: "Stay on page",
    });

    if (isPending) {
      return <Loader />;
    }

    if (view === "diff") {
      return (
        <>
          <BlueprintDiffTable
            base={{
              label: `${item.name} (original)`,
              blueprintId: item.id,
              values: agentConfig?.values,
            }}
            diff={{
              label: "Current changes",
              blueprintId: item.id,
              values: currentValues,
              promptTemplates: diffPromptTemplates,
            }}
            defaultOnlyDiff
          />
          {DialogComponent}
        </>
      );
    }

    return (
      <div className="flex flex-col gap-3">
        {showNotes && (
          <div className="flex flex-col gap-1.5">
            <label className="comet-body-xs-accented text-foreground">
              Version notes
            </label>
            <Textarea
              placeholder="Add version notes"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[64px]"
            />
          </div>
        )}

        <div className="flex flex-col gap-2">
          {(agentConfig?.values ?? []).map((v) => {
            const collapsible = isMultiLineField(v);
            const isChanged =
              v.type === BlueprintValueType.PROMPT
                ? !!dirtyPromptKeys[v.key]
                : draftValues[v.key] !== undefined &&
                  draftValues[v.key] !== originalValues.current[v.key];

            return (
              <CollapsibleField
                key={v.key}
                fieldKey={v.key}
                label={v.key}
                icon={<BlueprintTypeIcon type={v.type} variant="secondary" />}
                description={v.description}
                collapsible={collapsible}
                expanded={controller.isExpanded(v.key)}
                onToggle={() => controller.toggle(v.key)}
                active={isChanged}
                trailing={
                  isChanged ? (
                    <TooltipWrapper content="Modified">
                      <span
                        className="size-1.5 rounded-full bg-amber-400"
                        aria-label="Modified"
                      />
                    </TooltipWrapper>
                  ) : undefined
                }
              >
                {v.type === BlueprintValueType.PROMPT ? (
                  <div className="flex flex-col gap-1">
                    <BlueprintValuePrompt
                      key={v.value}
                      value={v}
                      projectId={projectId}
                      isEditing
                      compact
                      ref={(el) => {
                        promptRefs.current[v.key] = el;
                      }}
                      onDirtyChange={(isDirty) => {
                        setDirtyPromptKeys((prev) => ({
                          ...prev,
                          [v.key]: isDirty,
                        }));
                        clearError(v.key);
                      }}
                    />
                    {errors[v.key] && (
                      <span className="comet-body-xs text-destructive">
                        {errors[v.key]}
                      </span>
                    )}
                  </div>
                ) : v.type === BlueprintValueType.BOOLEAN ? (
                  <Switch
                    checked={draftValues[v.key] === "true"}
                    onCheckedChange={(checked) =>
                      setDraftValues((prev) => ({
                        ...prev,
                        [v.key]: String(checked),
                      }))
                    }
                  />
                ) : (
                  <div className="flex flex-col gap-1">
                    <Input
                      inputMode={
                        v.type === BlueprintValueType.INT
                          ? "numeric"
                          : v.type === BlueprintValueType.FLOAT
                            ? "decimal"
                            : "text"
                      }
                      value={draftValues[v.key] ?? ""}
                      onChange={(e) => handleFieldChange(v.key, e.target.value)}
                    />
                    {errors[v.key] && (
                      <span className="comet-body-xs text-destructive">
                        {errors[v.key]}
                      </span>
                    )}
                  </div>
                )}
              </CollapsibleField>
            );
          })}
        </div>

        {DialogComponent}
      </div>
    );
  },
);

AgentConfigurationEditView.displayName = "AgentConfigurationEditView";

export default AgentConfigurationEditView;
