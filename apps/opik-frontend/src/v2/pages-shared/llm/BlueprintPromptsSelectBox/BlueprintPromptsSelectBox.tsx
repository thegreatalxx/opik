import React, { useCallback, useMemo, useState } from "react";
import { FileTerminal, XCircle } from "lucide-react";

import { Button } from "@/ui/button";
import LoadableSelectBox from "@/shared/LoadableSelectBox/LoadableSelectBox";
import TooltipWrapper from "@/shared/TooltipWrapper/TooltipWrapper";
import useConfigHistoryListInfinite from "@/api/agent-configs/useConfigHistoryListInfinite";
import {
  BlueprintValue,
  BlueprintValueType,
  ConfigHistoryItem,
} from "@/types/agent-configs";

export interface BlueprintPromptRef {
  blueprintId: string;
  key: string;
  commitId: string;
}

interface BlueprintPromptsSelectBoxProps {
  projectId: string;
  value?: BlueprintPromptRef;
  onValueChange: (value?: BlueprintPromptRef) => void;
  onClear?: () => void;
  hasUnsavedChanges?: boolean;
  disabled?: boolean;
}

const BlueprintPromptsSelectBox: React.FC<BlueprintPromptsSelectBoxProps> = ({
  projectId,
  value,
  onValueChange,
  onClear,
  hasUnsavedChanges = false,
  disabled = false,
}) => {
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useConfigHistoryListInfinite({ projectId });

  const latestBlueprint: ConfigHistoryItem | undefined = useMemo(
    () => data?.pages?.[0]?.content?.[0],
    [data],
  );

  const promptValues: BlueprintValue[] = useMemo(
    () =>
      latestBlueprint?.values?.filter(
        (v) => v.type === BlueprintValueType.PROMPT,
      ) ?? [],
    [latestBlueprint],
  );

  const options = useMemo(
    () => promptValues.map((v) => ({ label: v.key, value: v.key })),
    [promptValues],
  );

  const handleChange = useCallback(
    (key: string) => {
      const match = promptValues.find((v) => v.key === key);
      if (!match || !latestBlueprint) return;
      onValueChange({
        blueprintId: latestBlueprint.id,
        key: match.key,
        commitId: match.value,
      });
    },
    [latestBlueprint, promptValues, onValueChange],
  );

  if (value) {
    return (
      <div className="flex min-w-0 items-center px-1">
        <TooltipWrapper
          content={hasUnsavedChanges ? "Unsaved changes" : value.key}
        >
          <div className="flex min-w-0 items-center gap-1">
            <FileTerminal className="size-3.5 shrink-0 text-[#b8e54a]" />
            <span className="comet-body-xs-accented truncate text-light-slate">
              {value.key}
            </span>
            {hasUnsavedChanges && (
              <span className="mb-auto size-1 shrink-0 rounded-full bg-warning" />
            )}
          </div>
        </TooltipWrapper>
        {onClear && (
          <TooltipWrapper content="Detach prompt">
            <Button
              variant="minimal"
              size="icon-xs"
              className="shrink-0"
              onClick={onClear}
            >
              <XCircle />
            </Button>
          </TooltipWrapper>
        )}
      </div>
    );
  }

  const isDisabled = disabled || (!isLoading && options.length === 0);
  const triggerTooltip = isDisabled
    ? "No agent configuration prompts found for this project"
    : "Load prompt from agent configuration";

  return (
    <LoadableSelectBox
      options={options}
      searchPlaceholder="Search prompt"
      onChange={handleChange}
      open={open}
      onOpenChange={setOpen}
      isLoading={isLoading}
      optionsCount={options.length}
      trigger={
        <div>
          <TooltipWrapper content={triggerTooltip}>
            <Button variant="minimal" size="icon-sm" disabled={isDisabled}>
              <FileTerminal />
            </Button>
          </TooltipWrapper>
        </div>
      }
      minWidth={360}
      disabled={isDisabled}
    />
  );
};

export default BlueprintPromptsSelectBox;
