import React, {
  useMemo,
  forwardRef,
  useImperativeHandle,
  useEffect,
  useCallback,
} from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import get from "lodash/get";
import isEmpty from "lodash/isEmpty";
import isNumber from "lodash/isNumber";

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Description } from "@/components/ui/description";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import ExperimentWidgetDataSection from "@/components/shared/Dashboard/widgets/shared/ExperimentWidgetDataSection/ExperimentWidgetDataSection";
import WidgetRankingSettingsSection from "@/components/shared/Dashboard/widgets/ExperimentsLeaderboardWidget/WidgetRankingSettingsSection";
import ColumnsButton from "@/components/shared/ColumnsButton/ColumnsButton";

import { cn } from "@/lib/utils";
import { Filters } from "@/types/filters";
import { extractExperimentIdsFilter } from "@/lib/filters";

import {
  DashboardWidget,
  ExperimentsLeaderboardWidgetType,
  WidgetEditorHandle,
} from "@/types/dashboard";
import {
  useDashboardStore,
  selectUpdatePreviewWidget,
  selectRuntimeConfig,
} from "@/store/DashboardStore";
import {
  ExperimentsLeaderboardWidgetSchema,
  ExperimentsLeaderboardWidgetFormData,
} from "./schema";
import WidgetEditorBaseLayout from "@/components/shared/Dashboard/WidgetConfigDialog/WidgetEditorBaseLayout";
import {
  parseMetadataKeys,
  formatConfigColumnName,
  PREDEFINED_COLUMNS,
  getExperimentListParams,
} from "./helpers";
import useExperimentsList from "@/api/datasets/useExperimentsList";
import useAppStore from "@/store/AppStore";
import { useExperimentsFeedbackScores } from "@/components/pages-shared/experiments/useExperimentsFeedbackScores";
import { COLUMN_METADATA_ID, COLUMN_TYPE } from "@/types/shared";
import {
  MIN_MAX_EXPERIMENTS,
  MAX_MAX_EXPERIMENTS,
  DEFAULT_MAX_EXPERIMENTS,
} from "@/lib/dashboard/utils";

const ExperimentsLeaderboardWidgetEditor = forwardRef<WidgetEditorHandle>(
  (_, ref) => {
    const workspaceName = useAppStore((state) => state.activeWorkspaceName);
    const widgetData = useDashboardStore(
      (state) => state.previewWidget!,
    ) as DashboardWidget & ExperimentsLeaderboardWidgetType;
    const updatePreviewWidget = useDashboardStore(selectUpdatePreviewWidget);
    const runtimeConfig = useDashboardStore(selectRuntimeConfig);

    const { config } = widgetData;

    const selectedColumns = config.selectedColumns || [];

    const widgetFilters = useMemo(() => config.filters || [], [config.filters]);

    const hasRuntimeExperiments =
      (runtimeConfig?.experimentIds?.length ?? 0) > 0;

    const { experimentIds: filterExperimentIds, remainingFilters } = useMemo(
      () => extractExperimentIdsFilter(widgetFilters),
      [widgetFilters],
    );

    const computedExperimentIds = useMemo(() => {
      return hasRuntimeExperiments
        ? runtimeConfig?.experimentIds || []
        : filterExperimentIds;
    }, [
      hasRuntimeExperiments,
      runtimeConfig?.experimentIds,
      filterExperimentIds,
    ]);

    const enableRanking = config.enableRanking ?? true;
    const rankingMetric = config.rankingMetric;
    const rankingDirection = config.rankingDirection ?? true;
    const columnsOrder = config.columnsOrder || [];

    const scoresColumnsOrder = useMemo(
      () => config.scoresColumnsOrder || [],
      [config.scoresColumnsOrder],
    );

    const metadataColumnsOrder = useMemo(
      () => config.metadataColumnsOrder || [],
      [config.metadataColumnsOrder],
    );

    const maxRows = config.maxRows || DEFAULT_MAX_EXPERIMENTS;

    const form = useForm<ExperimentsLeaderboardWidgetFormData>({
      resolver: zodResolver(ExperimentsLeaderboardWidgetSchema),
      mode: "onTouched",
      defaultValues: {
        filters: widgetFilters,
        selectedColumns,
        enableRanking,
        rankingMetric,
        rankingDirection,
        columnsOrder,
        scoresColumnsOrder,
        metadataColumnsOrder,
        maxRows: String(maxRows),
      },
    });

    const currentFilters = form.watch("filters") || [];

    useEffect(() => {
      if (form.formState.errors.filters) {
        form.clearErrors("filters");
      }
    }, [currentFilters.length, form]);

    const { dynamicScoresColumns } = useExperimentsFeedbackScores({
      experimentIds:
        computedExperimentIds.length > 0 ? computedExperimentIds : undefined,
      refetchInterval: 0,
    });

    const experimentListParams = getExperimentListParams({
      experimentIds: computedExperimentIds,
      filters: remainingFilters,
    });

    const { data: experimentsData } = useExperimentsList(
      {
        workspaceName,
        experimentIds: experimentListParams.experimentIds,
        filters: experimentListParams.filters,
        page: 1,
        size: 100,
      },
      {
        enabled: experimentListParams.isEnabled,
      },
    );

    const availableMetadataKeys = useMemo(() => {
      if (!experimentsData?.content) return [];
      return parseMetadataKeys(experimentsData.content);
    }, [experimentsData]);

    useImperativeHandle(ref, () => ({
      submit: async () => {
        return await form.trigger();
      },
      isValid: form.formState.isValid,
    }));

    const updateWidgetConfig = useCallback(
      (partialConfig: Partial<typeof config>) => {
        updatePreviewWidget({
          config: {
            ...config,
            ...partialConfig,
          },
        });
      },
      [config, updatePreviewWidget],
    );

    const handleFiltersChange = (newFilters: Filters) => {
      updateWidgetConfig({ filters: newFilters });
    };

    const handleSelectedColumnsChange = (newSelectedColumns: string[]) => {
      form.setValue("selectedColumns", newSelectedColumns);
      updateWidgetConfig({ selectedColumns: newSelectedColumns });
    };

    const handleEnableRankingChange = (checked: boolean) => {
      form.setValue("enableRanking", checked, { shouldValidate: true });
      updateWidgetConfig({ enableRanking: checked });
    };

    const handleRankingMetricChange = (value: string) => {
      form.setValue("rankingMetric", value, { shouldValidate: true });
      updateWidgetConfig({ rankingMetric: value });
    };

    const handleRankingHigherIsBetterChange = (value: boolean) => {
      form.setValue("rankingDirection", value);
      updateWidgetConfig({ rankingDirection: value });
    };

    const handleColumnsOrderChange = (newOrder: string[]) => {
      form.setValue("columnsOrder", newOrder);
      updateWidgetConfig({ columnsOrder: newOrder });
    };

    const handleScoresColumnsOrderChange = useCallback(
      (newOrder: string[]) => {
        form.setValue("scoresColumnsOrder", newOrder);
        updateWidgetConfig({ scoresColumnsOrder: newOrder });
      },
      [form, updateWidgetConfig],
    );

    const handleMetadataColumnsOrderChange = useCallback(
      (newOrder: string[]) => {
        form.setValue("metadataColumnsOrder", newOrder);
        updateWidgetConfig({ metadataColumnsOrder: newOrder });
      },
      [form, updateWidgetConfig],
    );

    const handleMaxRowsChange = (value: string) => {
      form.setValue("maxRows", value, {
        shouldValidate: true,
      });
      const numValue = isEmpty(value) ? undefined : parseInt(value, 10);
      updateWidgetConfig({
        maxRows: isNumber(numValue) ? numValue : undefined,
      });
    };

    const dynamicMetadataColumns = useMemo(() => {
      return availableMetadataKeys.map((key) => ({
        id: `${COLUMN_METADATA_ID}.${key}`,
        label: formatConfigColumnName(key),
        columnType: COLUMN_TYPE.string,
      }));
    }, [availableMetadataKeys]);

    const columnSections = useMemo(
      () => [
        {
          title: "Configuration",
          columns: dynamicMetadataColumns,
          order: metadataColumnsOrder,
          onOrderChange: handleMetadataColumnsOrderChange,
        },
        {
          title: "Feedback scores",
          columns: dynamicScoresColumns,
          order: scoresColumnsOrder,
          onOrderChange: handleScoresColumnsOrderChange,
        },
      ],
      [
        dynamicMetadataColumns,
        dynamicScoresColumns,
        handleMetadataColumnsOrderChange,
        handleScoresColumnsOrderChange,
        metadataColumnsOrder,
        scoresColumnsOrder,
      ],
    );

    return (
      <Form {...form}>
        <WidgetEditorBaseLayout>
          <div className="space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex-1 pr-4">
                <div className="flex flex-col gap-0.5 px-0.5">
                  <Label className="comet-body-s-accented">Columns</Label>
                  <Description>
                    Select and reorder columns to display.
                  </Description>
                </div>
              </div>
              <ColumnsButton
                columns={PREDEFINED_COLUMNS}
                selectedColumns={selectedColumns}
                onSelectionChange={handleSelectedColumnsChange}
                order={columnsOrder}
                onOrderChange={handleColumnsOrderChange}
                sections={columnSections}
              />
            </div>

            <WidgetRankingSettingsSection
              control={form.control}
              dynamicScoresColumns={dynamicScoresColumns}
              onEnableRankingChange={handleEnableRankingChange}
              onRankingMetricChange={handleRankingMetricChange}
              onRankingHigherIsBetterChange={handleRankingHigherIsBetterChange}
            />

            {hasRuntimeExperiments ? (
              <FormItem>
                <FormLabel>Data source</FormLabel>
                <Description>
                  Experiments are provided by the page context.
                </Description>
              </FormItem>
            ) : (
              <>
                <ExperimentWidgetDataSection
                  control={form.control}
                  filtersFieldName="filters"
                  filters={widgetFilters}
                  onFiltersChange={handleFiltersChange}
                />
                <FormField
                  control={form.control}
                  name="maxRows"
                  render={({ field, formState }) => {
                    const validationErrors = get(formState.errors, ["maxRows"]);
                    return (
                      <FormItem>
                        <FormLabel>Maximum rows</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={MIN_MAX_EXPERIMENTS}
                            max={MAX_MAX_EXPERIMENTS}
                            value={field.value ?? ""}
                            onChange={(e) => {
                              const value = e.target.value;
                              handleMaxRowsChange(value);
                            }}
                            className={cn({
                              "border-destructive": Boolean(
                                validationErrors?.message,
                              ),
                            })}
                          />
                        </FormControl>
                        <Description>
                          Limit how many experiments are loaded (max{" "}
                          {MAX_MAX_EXPERIMENTS}).
                        </Description>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />
              </>
            )}
          </div>
        </WidgetEditorBaseLayout>
      </Form>
    );
  },
);

ExperimentsLeaderboardWidgetEditor.displayName =
  "ExperimentsLeaderboardWidgetEditor";

export default ExperimentsLeaderboardWidgetEditor;
