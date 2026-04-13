import React, { useMemo, useEffect, useCallback, useState } from "react";
import { Control, useController } from "react-hook-form";
import get from "lodash/get";

import { FormControl, FormField, FormItem, FormMessage } from "@/ui/form";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/ui/accordion";
import { ToggleGroup, ToggleGroupItem } from "@/ui/toggle-group";
import { Label } from "@/ui/label";
import { Input } from "@/ui/input";

import SelectBox from "@/shared/SelectBox/SelectBox";
import TracesOrSpansPathsAutocomplete from "@/v2/pages-shared/traces/TracesOrSpansPathsAutocomplete/TracesOrSpansPathsAutocomplete";
import ExplainerIcon from "@/shared/ExplainerIcon/ExplainerIcon";
import RemovableTag from "@/shared/RemovableTag/RemovableTag";
import { EXPLAINER_ID, EXPLAINERS_MAP } from "@/constants/explainers";
import { TRACE_DATA_TYPE } from "@/hooks/useTracesOrSpansList";
import { cn } from "@/lib/utils";
import { BreakdownConfig } from "@/types/dashboard";

import { BREAKDOWN_FIELD } from "@/types/dashboard";
import {
  BREAKDOWN_FIELD_LABELS,
  getCompatibleBreakdownFields,
} from "./breakdown";
import { ProjectMetricsWidgetFormData } from "./schema";

interface ProjectMetricsBreakdownSectionProps {
  control: Control<ProjectMetricsWidgetFormData>;
  metricType: string;
  projectId: string;
  isSpanMetric: boolean;
  breakdown: BreakdownConfig;
  isGroupByDisabledForFeedbackScore: boolean;
  isGroupByDisabledForDuration: boolean;
  isGroupByDisabledForUsage: boolean;
  onBreakdownChange: (breakdown: Partial<BreakdownConfig>) => void;
}

const ProjectMetricsBreakdownSection: React.FC<
  ProjectMetricsBreakdownSectionProps
> = ({
  control,
  metricType,
  projectId,
  isSpanMetric,
  breakdown,
  isGroupByDisabledForFeedbackScore,
  isGroupByDisabledForDuration,
  isGroupByDisabledForUsage,
  onBreakdownChange,
}) => {
  const isMetadataBreakdown = breakdown.field === BREAKDOWN_FIELD.METADATA;
  const isTagsBreakdown = breakdown.field === BREAKDOWN_FIELD.TAGS;
  const hasBreakdownField = breakdown.field !== BREAKDOWN_FIELD.NONE;

  const [tagInput, setTagInput] = useState("");

  const isGroupByDisabled =
    !metricType ||
    isGroupByDisabledForFeedbackScore ||
    isGroupByDisabledForDuration ||
    isGroupByDisabledForUsage;

  const { field: breakdownFieldController } = useController({
    control,
    name: "breakdown.field",
  });

  const { field: breakdownMetadataKeyController } = useController({
    control,
    name: "breakdown.metadataKey",
  });

  const { field: breakdownTagValuesController } = useController({
    control,
    name: "breakdown.tagValues",
  });

  const { field: breakdownTagValuesModeController } = useController({
    control,
    name: "breakdown.tagValuesMode",
  });

  const tagValues: string[] = useMemo(
    () => breakdownTagValuesController.value ?? [],
    [breakdownTagValuesController.value],
  );
  const tagValuesMode: "include" | "exclude" =
    breakdownTagValuesModeController.value ?? "include";

  const handleAddTag = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (!trimmed || tagValues.includes(trimmed)) return;
      const next = [...tagValues, trimmed];
      breakdownTagValuesController.onChange(next);
      onBreakdownChange({ tagValues: next });
      setTagInput("");
    },
    [tagValues, breakdownTagValuesController, onBreakdownChange],
  );

  const handleRemoveTag = useCallback(
    (tag: string) => {
      const next = tagValues.filter((t) => t !== tag);
      breakdownTagValuesController.onChange(next);
      onBreakdownChange({ tagValues: next });
    },
    [tagValues, breakdownTagValuesController, onBreakdownChange],
  );

  const handleTagInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        handleAddTag(tagInput);
      }
    },
    [tagInput, handleAddTag],
  );

  const handleTagValuesModeChange = useCallback(
    (value: string) => {
      if (!value) return;
      const mode = value as "include" | "exclude";
      breakdownTagValuesModeController.onChange(mode);
      onBreakdownChange({ tagValuesMode: mode });
    },
    [breakdownTagValuesModeController, onBreakdownChange],
  );

  const compatibleBreakdownFields = useMemo(() => {
    if (!metricType) return [BREAKDOWN_FIELD.NONE];
    return getCompatibleBreakdownFields(metricType);
  }, [metricType]);

  const breakdownFieldOptions = useMemo(() => {
    return compatibleBreakdownFields.map((field) => ({
      value: field,
      label: BREAKDOWN_FIELD_LABELS[field],
    }));
  }, [compatibleBreakdownFields]);

  const handleFieldChange = useCallback(
    (value: string) => {
      const field = value as BREAKDOWN_FIELD;
      if (field === BREAKDOWN_FIELD.NONE) {
        breakdownFieldController.onChange(BREAKDOWN_FIELD.NONE);
        breakdownMetadataKeyController.onChange(undefined);
        breakdownTagValuesController.onChange(undefined);
        breakdownTagValuesModeController.onChange(undefined);
        setTagInput("");
        onBreakdownChange({
          field: BREAKDOWN_FIELD.NONE,
          metadataKey: undefined,
          tagValues: undefined,
          tagValuesMode: undefined,
        });
      } else {
        breakdownFieldController.onChange(field);
        const isTagsField = field === BREAKDOWN_FIELD.TAGS;
        if (!isTagsField) {
          breakdownTagValuesController.onChange(undefined);
          breakdownTagValuesModeController.onChange(undefined);
          setTagInput("");
        }
        onBreakdownChange({
          field,
          metadataKey:
            field === BREAKDOWN_FIELD.METADATA
              ? breakdown.metadataKey
              : undefined,
          tagValues: isTagsField ? breakdown.tagValues : undefined,
          tagValuesMode: isTagsField ? breakdown.tagValuesMode : undefined,
          aggregateTotal: true,
        });
      }
    },
    [
      breakdownFieldController,
      breakdownMetadataKeyController,
      breakdownTagValuesController,
      breakdownTagValuesModeController,
      onBreakdownChange,
      breakdown.metadataKey,
      breakdown.tagValues,
      breakdown.tagValuesMode,
    ],
  );

  const disabledExplainer = !metricType
    ? EXPLAINERS_MAP[EXPLAINER_ID.groupby_requires_metric]
    : isGroupByDisabledForDuration
      ? EXPLAINERS_MAP[EXPLAINER_ID.duration_groupby_requires_single_metric]
      : isGroupByDisabledForUsage
        ? EXPLAINERS_MAP[EXPLAINER_ID.usage_groupby_requires_single_metric]
        : isGroupByDisabledForFeedbackScore
          ? EXPLAINERS_MAP[
              EXPLAINER_ID.feedback_score_groupby_requires_single_metric
            ]
          : null;

  useEffect(() => {
    if (isGroupByDisabled && hasBreakdownField) {
      breakdownFieldController.onChange(BREAKDOWN_FIELD.NONE);
      breakdownMetadataKeyController.onChange(undefined);
      breakdownTagValuesController.onChange(undefined);
      breakdownTagValuesModeController.onChange(undefined);
      setTagInput("");
      onBreakdownChange({
        field: BREAKDOWN_FIELD.NONE,
        metadataKey: undefined,
        tagValues: undefined,
        tagValuesMode: undefined,
      });
    }
  }, [
    isGroupByDisabled,
    hasBreakdownField,
    breakdownFieldController,
    breakdownMetadataKeyController,
    breakdownTagValuesController,
    breakdownTagValuesModeController,
    onBreakdownChange,
  ]);

  return (
    <Accordion type="single" collapsible className="!-mt-0 w-full">
      <AccordionItem value="groupby">
        <AccordionTrigger className="h-11 py-1.5 hover:no-underline">
          Group by
        </AccordionTrigger>
        <AccordionContent className="flex flex-col gap-4 px-3 pb-3">
          <div className="flex items-start gap-4">
            <div className="flex-1">
              <Label className="comet-body-s-accented mb-1 flex items-center gap-1">
                Field
                {isGroupByDisabled && disabledExplainer && (
                  <ExplainerIcon {...disabledExplainer} />
                )}
              </Label>
              <div
                className={cn(
                  "group/groupby flex items-start rounded-md border border-input hover:shadow-sm focus-within:border-primary",
                  isGroupByDisabled && "hover:shadow-none",
                )}
              >
                <FormField
                  control={control}
                  name="breakdown.field"
                  render={({ field, formState }) => {
                    const validationErrors = get(formState.errors, [
                      "breakdown",
                      "field",
                    ]);
                    return (
                      <FormItem
                        className={cn(
                          "min-w-32",
                          isMetadataBreakdown ? "flex-1" : "w-full",
                        )}
                      >
                        <FormControl>
                          <SelectBox
                            className={cn(
                              "border-0 shadow-none hover:shadow-none focus:border-0",
                              {
                                "border-destructive": Boolean(
                                  validationErrors?.message,
                                ),
                              },
                              isMetadataBreakdown && "rounded-r-none",
                            )}
                            value={field.value || BREAKDOWN_FIELD.NONE}
                            onChange={handleFieldChange}
                            options={breakdownFieldOptions}
                            disabled={isGroupByDisabled}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />
                {isMetadataBreakdown && (
                  <FormField
                    control={control}
                    name="breakdown.metadataKey"
                    render={({ field, formState }) => {
                      const validationErrors = get(formState.errors, [
                        "breakdown",
                        "metadataKey",
                      ]);
                      return (
                        <FormItem className="min-w-32 flex-1 border-l border-input group-focus-within/groupby:border-primary [&_input]:rounded-l-none [&_input]:border-0 [&_input]:shadow-none [&_input]:hover:shadow-none [&_input]:focus-visible:border-0">
                          <FormControl>
                            <TracesOrSpansPathsAutocomplete
                              hasError={Boolean(validationErrors?.message)}
                              rootKeys={["metadata"]}
                              projectId={projectId}
                              type={
                                isSpanMetric
                                  ? TRACE_DATA_TYPE.spans
                                  : TRACE_DATA_TYPE.traces
                              }
                              placeholder="key"
                              excludeRoot={true}
                              value={field.value || ""}
                              onValueChange={(value) => {
                                field.onChange(value);
                                onBreakdownChange({
                                  metadataKey: value,
                                });
                              }}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />
                )}
              </div>
            </div>
            {isTagsBreakdown && (
              <div className="flex-1">
                <Label className="comet-body-s-accented mb-1 flex items-center gap-1">
                  Filter tags
                </Label>
                <div className="flex flex-col gap-2">
                  <ToggleGroup
                    type="single"
                    variant="ghost"
                    value={tagValuesMode}
                    onValueChange={handleTagValuesModeChange}
                    className="w-fit justify-start"
                  >
                    <ToggleGroupItem
                      value="include"
                      aria-label="Include"
                      className="gap-1.5"
                    >
                      Include
                    </ToggleGroupItem>
                    <ToggleGroupItem
                      value="exclude"
                      aria-label="Exclude"
                      className="gap-1.5"
                    >
                      Exclude
                    </ToggleGroupItem>
                  </ToggleGroup>
                  <Input
                    placeholder="Type a tag and press Enter"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={handleTagInputKeyDown}
                    onBlur={() => {
                      if (tagInput.trim()) handleAddTag(tagInput);
                    }}
                  />
                  {tagValues.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {tagValues.map((tag) => (
                        <RemovableTag
                          key={tag}
                          label={tag}
                          onDelete={handleRemoveTag}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
            <div className="min-w-fit">
              <Label className="comet-body-s-accented mb-1 flex items-center gap-1">
                Aggregation mode{" "}
                <ExplainerIcon
                  className="inline"
                  description={`Choose how data is aggregated: 'Total' shows one value per group for the entire selected date range, while 'Time-based' shows values in time buckets (hourly, daily, or weekly).`}
                />
              </Label>
              <ToggleGroup
                type="single"
                variant="ghost"
                value={breakdown.aggregateTotal ? "total" : "interval"}
                onValueChange={(value) => {
                  if (value) {
                    onBreakdownChange({
                      aggregateTotal: value === "total",
                    });
                  }
                }}
                disabled={!hasBreakdownField}
                className="w-fit justify-start"
              >
                <ToggleGroupItem
                  value="total"
                  aria-label="Total"
                  className="gap-1.5"
                >
                  <span>Total</span>
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="interval"
                  aria-label="Time-based"
                  className="gap-1.5"
                >
                  <span>Time-based</span>
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
};

export default ProjectMetricsBreakdownSection;
