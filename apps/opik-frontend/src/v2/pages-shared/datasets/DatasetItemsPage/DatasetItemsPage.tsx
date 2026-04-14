import React, { useCallback, useEffect, useMemo, useState } from "react";
import { StringParam, useQueryParam } from "use-query-params";
import { useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import {
  Blocks,
  Check,
  CheckCheck,
  Code2,
  GitCommitVertical,
  Settings2,
  X,
} from "lucide-react";
import get from "lodash/get";

import useDatasetById from "@/api/datasets/useDatasetById";
import useDatasetItemChangesMutation from "@/api/datasets/useDatasetItemChangesMutation";
import useDatasetUpdateMutation from "@/api/datasets/useDatasetUpdateMutation";
import useDatasetVersionsList from "@/api/datasets/useDatasetVersionsList";
import DatasetItemsTab, {
  StorageKeysConfig,
  EditPanelRenderProps,
  AddPanelRenderProps,
  AddDialogRenderProps,
} from "@/v2/pages-shared/datasets/DatasetItemsTab/DatasetItemsTab";
import EditTestSuiteSettingsDialog from "@/v2/pages-shared/datasets/TestSuiteComponents/EditTestSuiteSettingsDialog";
import TestSuiteItemPanel from "@/v2/pages-shared/datasets/TestSuiteComponents/TestSuiteItemPanel/TestSuiteItemPanel";
import AddDatasetItemPanel from "@/v2/pages-shared/datasets/DatasetItemPanel/AddDatasetItemPanel";
import AddDatasetItemDialog from "@/v2/pages-shared/datasets/DatasetItemPanel/AddDatasetItemDialog";
import AddTestSuiteItemPanel from "@/v2/pages-shared/datasets/TestSuiteComponents/TestSuiteItemPanel/AddTestSuiteItemPanel";
import DatasetItemEditor from "@/v2/pages-shared/datasets/DatasetItemEditor/DatasetItemEditor";
import { AssertionsCountCell } from "@/v2/pages-shared/datasets/TestSuiteComponents/AssertionsCountCell";
import { ExecutionPolicyCell } from "@/v2/pages-shared/datasets/TestSuiteComponents/ExecutionPolicyCell";
import AddVersionDialog from "@/v2/pages-shared/datasets/VersionHistoryTab/AddVersionDialog";
import VersionHistoryTab from "@/v2/pages-shared/datasets/VersionHistoryTab/VersionHistoryTab";
import OverrideVersionDialog from "@/v2/pages-shared/datasets/OverrideVersionDialog";
import DatasetExpansionDialog from "@/v2/pages-shared/datasets/DatasetExpansionDialog";
import { ExpansionDialogRenderProps } from "@/v2/pages-shared/datasets/DatasetItemsActionsPanel";
import UseDatasetDropdown from "@/v2/pages-shared/datasets/UseDatasetDropdown";
import ColoredTag from "@/shared/ColoredTag/ColoredTag";
import ConfirmDialog from "@/shared/ConfirmDialog/ConfirmDialog";
import DateTag from "@/shared/DateTag/DateTag";
import Loader from "@/shared/Loader/Loader";
import { RESOURCE_TYPE } from "@/shared/ResourceLink/ResourceLink";
import TagListRenderer from "@/shared/TagListRenderer/TagListRenderer";
import AutodetectCell from "@/shared/DataTableCells/AutodetectCell";
import IdCell from "@/shared/DataTableCells/IdCell";
import ListCell from "@/shared/DataTableCells/ListCell";
import TimeCell from "@/shared/DataTableCells/TimeCell";
import { usePermissions } from "@/contexts/PermissionsContext";
import { Button } from "@/ui/button";
import { Separator } from "@/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/ui/tabs";
import { Tag } from "@/ui/tag";
import {
  Tooltip,
  TooltipContent,
  TooltipPortal,
  TooltipTrigger,
} from "@/ui/tooltip";
import { ToastAction } from "@/ui/toast";
import { useToast } from "@/ui/use-toast";
import useLoadPlayground from "@/v2/pages-shared/playground/useLoadPlayground";
import useNavigationBlocker from "@/hooks/useNavigationBlocker";
import { useNavigateToExperiment } from "@/v2/pages-shared/experiments/useNavigateToExperiment";
import { useTestSuiteSavePayload } from "@/hooks/useTestSuiteSavePayload";
import { useDatasetEntityIdFromURL } from "@/v2/hooks/useDatasetEntityIdFromURL";
import { useClearDraft, useHasDraft } from "@/store/TestSuiteDraftStore";
import {
  DatasetItem,
  DatasetItemColumn,
  DATASET_STATUS,
  DATASET_TYPE,
} from "@/types/datasets";
import {
  COLUMN_ID_ID,
  COLUMN_TYPE,
  ColumnData,
  DynamicColumn,
} from "@/types/shared";
import { useEffectiveSuiteAssertions } from "@/hooks/useEffectiveSuiteAssertions";
import { AssertionsListTooltipContent } from "@/v2/pages-shared/experiments/TestSuiteExperiment/AssertionsListTooltipContent";
import { useActiveProjectId } from "@/store/AppStore";

const POLLING_INTERVAL_MS = 3000;

const SUITE_STORAGE_KEYS: StorageKeysConfig = {
  selectedColumnsKey: "test-suite-items-selected-columns-v2",
  selectedColumnsMigrationKey: "test-suite-items-selected-columns",
  migrationNewColumns: ["last_updated_at", "assertions"],
  columnsWidthKey: "test-suite-items-columns-width",
  columnsOrderKey: "test-suite-items-columns-order",
  dynamicColumnsKey: "test-suite-items-dynamic-columns",
  paginationSizeKey: "test-suite-items-pagination-size",
  rowHeightKey: "test-suite-items-row-height",
};

const DATASET_STORAGE_KEYS: StorageKeysConfig = {
  selectedColumnsKey: "dataset-items-selected-columns",
  columnsWidthKey: "dataset-items-columns-width",
  columnsOrderKey: "dataset-items-columns-order",
  dynamicColumnsKey: "dataset-items-dynamic-columns",
  paginationSizeKey: "dataset-items-pagination-size",
  rowHeightKey: "dataset-items-row-height",
};

const SUITE_DEFAULT_SELECTED_COLUMNS: string[] = [
  "description",
  "last_updated_at",
  "data",
  "assertions",
  "execution_policy",
];

const DATASET_DEFAULT_SELECTED_COLUMNS: string[] = [
  COLUMN_ID_ID,
  "created_at",
  "tags",
];

const buildSuiteColumns = (): ColumnData<DatasetItem>[] => [
  {
    id: COLUMN_ID_ID,
    label: "ID",
    type: COLUMN_TYPE.string,
    cell: IdCell as never,
  },
  {
    id: "description",
    label: "Description",
    type: COLUMN_TYPE.string,
    accessorFn: (row) => row.description ?? "",
  },
  {
    id: "last_updated_at",
    label: "Last updated",
    type: COLUMN_TYPE.time,
    cell: TimeCell as never,
  },
  {
    id: "data",
    label: "Data",
    type: COLUMN_TYPE.dictionary,
    accessorFn: (row) => row.data,
    cell: AutodetectCell as never,
    size: 400,
  },
  {
    id: "assertions",
    label: "Custom assertions",
    type: COLUMN_TYPE.string,
    iconType: "assertions",
    cell: AssertionsCountCell as never,
    size: 120,
  },
  {
    id: "execution_policy",
    label: "Execution policy",
    type: COLUMN_TYPE.string,
    iconType: "execution_policy",
    cell: ExecutionPolicyCell as never,
  },
  {
    id: "tags",
    label: "Tags",
    type: COLUMN_TYPE.list,
    iconType: "tags",
    accessorFn: (row) => row.tags || [],
    cell: ListCell as never,
  },
  {
    id: "created_at",
    label: "Created",
    type: COLUMN_TYPE.time,
    cell: TimeCell as never,
  },
  {
    id: "created_by",
    label: "Created by",
    type: COLUMN_TYPE.string,
  },
];

const buildDatasetColumns = (
  _datasetColumns: DatasetItemColumn[],
  dynamicDatasetColumns: DynamicColumn[],
): ColumnData<DatasetItem>[] => [
  {
    id: COLUMN_ID_ID,
    label: "ID",
    type: COLUMN_TYPE.string,
    cell: IdCell as never,
  },
  ...dynamicDatasetColumns.map(
    ({ label, id, columnType }) =>
      ({
        id,
        label,
        type: columnType,
        accessorFn: (row) => get(row, ["data", label], ""),
        cell: AutodetectCell as never,
      }) as ColumnData<DatasetItem>,
  ),
  {
    id: "tags",
    label: "Tags",
    type: COLUMN_TYPE.list,
    iconType: "tags",
    accessorFn: (row) => row.tags || [],
    cell: ListCell as never,
  },
  {
    id: "created_at",
    label: "Created",
    type: COLUMN_TYPE.time,
    cell: TimeCell as never,
  },
  {
    id: "last_updated_at",
    label: "Last updated",
    type: COLUMN_TYPE.time,
    cell: TimeCell as never,
  },
  {
    id: "created_by",
    label: "Created by",
    type: COLUMN_TYPE.string,
  },
];

function DatasetItemsPage(): React.ReactElement {
  const datasetId = useDatasetEntityIdFromURL();
  const activeProjectId = useActiveProjectId();

  const [tab, setTab] = useQueryParam("tab", StringParam);
  const [addVersionDialogOpen, setAddVersionDialogOpen] = useState(false);
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [pendingVersionData, setPendingVersionData] = useState<{
    tags?: string[];
    changeDescription?: string;
  } | null>(null);

  const queryClient = useQueryClient();
  const hasDraft = useHasDraft();
  const clearDraft = useClearDraft();
  const { toast } = useToast();
  const { navigate: navigateToExperiment } = useNavigateToExperiment();
  const { loadPlayground } = useLoadPlayground();

  const {
    permissions: { canEditDatasets },
  } = usePermissions();

  const { mutate: updateDataset } = useDatasetUpdateMutation();

  const { data: dataset, isPending } = useDatasetById(
    { datasetId },
    {
      refetchInterval: (query) => {
        const status = query.state.data?.status;
        return status === DATASET_STATUS.processing
          ? POLLING_INTERVAL_MS
          : false;
      },
    },
  );

  const datasetType = dataset?.type;
  const isTestSuite = datasetType === DATASET_TYPE.TEST_SUITE;
  const entityName = isTestSuite ? "test suite" : "dataset";
  const latestVersion = dataset?.latest_version;

  const datasetTags = dataset?.tags ?? [];
  const showTags = canEditDatasets || datasetTags.length > 0;
  const tagListProps = canEditDatasets
    ? { tags: datasetTags }
    : { tags: [] as string[], immutableTags: datasetTags };

  const { data: versionsData } = useDatasetVersionsList(
    { datasetId, page: 1, size: 1 },
    { enabled: isTestSuite },
  );
  const latestVersionData = versionsData?.content?.[0];
  const versionEvaluators = latestVersionData?.evaluators ?? [];
  const { buildPayload, buildInitialVersionPayload, hasNoVersion } =
    useTestSuiteSavePayload({
      suiteId: datasetId,
      suite: dataset,
      versionEvaluators,
    });

  const effectiveAssertions = useEffectiveSuiteAssertions(datasetId);

  useEffect(() => {
    return clearDraft;
  }, [datasetId, clearDraft]);

  const { DialogComponent } = useNavigationBlocker({
    condition: hasDraft,
    title: "Unsaved changes",
    description:
      "You have unsaved draft changes. Are you sure you want to leave?",
    confirmText: "Leave without saving",
    cancelText: "Stay",
  });

  const showSuccessToast = useCallback(
    (versionId?: string) => {
      toast({
        title: "New version created",
        description:
          "Your changes have been saved as a new version. You can now use it to run experiments in the SDK or the Playground.",
        actions: [
          <ToastAction
            variant="link"
            size="sm"
            className="comet-body-s-accented gap-1.5 px-0"
            altText="Run experiment in the SDK"
            key="sdk"
            onClick={() =>
              navigateToExperiment({
                newExperiment: true,
                datasetName: dataset?.name,
              })
            }
          >
            <Code2 className="size-4" />
            Run experiment in the SDK
          </ToastAction>,
          <ToastAction
            variant="link"
            size="sm"
            className="comet-body-s-accented gap-1.5 px-0"
            altText="Run experiment in the Playground"
            key="playground"
            onClick={() =>
              loadPlayground({
                datasetId,
                datasetVersionId: versionId,
              })
            }
          >
            <Blocks className="size-4" />
            Run experiment in the Playground
          </ToastAction>,
        ],
      });
    },
    [toast, navigateToExperiment, loadPlayground, dataset?.name, datasetId],
  );

  const changesMutation = useDatasetItemChangesMutation({
    onConflict: () => {
      setOverrideDialogOpen(true);
    },
  });

  const onSaveSuccess = async (version?: { id?: string }) => {
    setAddVersionDialogOpen(false);
    showSuccessToast(version?.id);
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["dataset-items", { datasetId }],
      }),
      queryClient.invalidateQueries({
        queryKey: ["dataset-versions"],
      }),
      queryClient.invalidateQueries({
        queryKey: ["dataset", { datasetId }],
      }),
    ]);
    clearDraft();
  };

  const handleSaveChanges = (tags?: string[], changeDescription?: string) => {
    if (changesMutation.isPending) return;

    if (hasNoVersion) {
      changesMutation.mutate(
        buildInitialVersionPayload({ tags, changeDescription }),
        {
          onSuccess: (initialVersion) => {
            const itemPayload = buildPayload({
              baseVersionOverride: initialVersion?.id,
              tags,
              changeDescription,
            });

            const hasItemChanges =
              itemPayload.payload.added_items.length > 0 ||
              itemPayload.payload.edited_items.length > 0 ||
              itemPayload.payload.deleted_ids.length > 0;

            if (!hasItemChanges) {
              onSaveSuccess(initialVersion);
              return;
            }

            changesMutation.mutate(itemPayload, {
              onSuccess: onSaveSuccess,
              onError: (error) => {
                if ((error as AxiosError).response?.status === 409) {
                  setPendingVersionData({ tags, changeDescription });
                }
              },
            });
          },
        },
      );
      return;
    }

    changesMutation.mutate(buildPayload({ tags, changeDescription }), {
      onSuccess: onSaveSuccess,
      onError: (error) => {
        if ((error as AxiosError).response?.status === 409) {
          setPendingVersionData({ tags, changeDescription });
        }
      },
    });
  };

  const handleOverrideConfirm = () => {
    if (!pendingVersionData) return;

    changesMutation.mutate(
      buildPayload({ ...pendingVersionData, override: true }),
      {
        onSuccess: async (version) => {
          setOverrideDialogOpen(false);
          setPendingVersionData(null);
          await onSaveSuccess(version);
        },
      },
    );
  };

  const handleDiscardChanges = () => {
    clearDraft();
    setDiscardDialogOpen(false);
  };

  const handleAddTag = (newTag: string) => {
    updateDataset({
      dataset: {
        ...dataset,
        id: datasetId,
        tags: [...(dataset?.tags ?? []), newTag],
      },
    });
  };

  const handleDeleteTag = (tag: string) => {
    updateDataset({
      dataset: {
        ...dataset,
        id: datasetId,
        tags: (dataset?.tags ?? []).filter((t) => t !== tag),
      },
    });
  };

  const buildColumns = useCallback(
    (
      datasetColumns: DatasetItemColumn[],
      dynamicDatasetColumns: DynamicColumn[],
    ) =>
      isTestSuite
        ? buildSuiteColumns()
        : buildDatasetColumns(datasetColumns, dynamicDatasetColumns),
    [isTestSuite],
  );

  const renderEditPanel = useCallback(
    (props: EditPanelRenderProps) =>
      isTestSuite ? (
        <TestSuiteItemPanel
          {...props}
          onOpenSettings={() => setSettingsDialogOpen(true)}
        />
      ) : (
        <DatasetItemEditor {...props} />
      ),
    [isTestSuite],
  );

  const renderAddPanel = useCallback(
    (props: AddPanelRenderProps) =>
      isTestSuite ? (
        <AddTestSuiteItemPanel
          {...props}
          onOpenSettings={() => setSettingsDialogOpen(true)}
        />
      ) : (
        <AddDatasetItemPanel {...props} />
      ),
    [isTestSuite],
  );

  const renderAddDialog = useMemo(
    () =>
      isTestSuite
        ? undefined
        : ({ key, datasetId: id, open, setOpen }: AddDialogRenderProps) => (
            <AddDatasetItemDialog
              key={key}
              datasetId={id}
              open={open}
              setOpen={setOpen}
            />
          ),
    [isTestSuite],
  );

  const renderExpansionDialog = useCallback(
    ({ open, setOpen, onSamplesGenerated }: ExpansionDialogRenderProps) => (
      <DatasetExpansionDialog
        datasetId={datasetId}
        open={open}
        setOpen={setOpen}
        onSamplesGenerated={onSamplesGenerated}
        datasetType={datasetType}
        suiteAssertions={isTestSuite ? effectiveAssertions : undefined}
      />
    ),
    [datasetId, datasetType, isTestSuite, effectiveAssertions],
  );

  if (isPending) {
    return <Loader />;
  }

  return (
    <div className="pt-4">
      <AddVersionDialog
        open={addVersionDialogOpen}
        setOpen={setAddVersionDialogOpen}
        onConfirm={handleSaveChanges}
        isSubmitting={changesMutation.isPending}
      />
      <ConfirmDialog
        open={discardDialogOpen}
        setOpen={setDiscardDialogOpen}
        onConfirm={handleDiscardChanges}
        title="Discard changes"
        description={`Discarding will remove all unsaved edits to this ${entityName}. This action can't be undone. Are you sure you want to continue?`}
        confirmText="Discard changes"
        confirmButtonVariant="destructive"
      />
      <OverrideVersionDialog
        open={overrideDialogOpen}
        setOpen={setOverrideDialogOpen}
        onConfirm={handleOverrideConfirm}
      />
      <EditTestSuiteSettingsDialog
        open={settingsDialogOpen}
        setOpen={setSettingsDialogOpen}
      />
      {DialogComponent}
      <div className="mb-4">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {hasDraft && (
              <Tag variant="orange" size="md">
                Draft
              </Tag>
            )}
            <h1 className="comet-title-l truncate break-words">
              {dataset?.name ?? (isTestSuite ? "Test suite" : "Dataset")}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {hasDraft && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDiscardDialogOpen(true)}
                >
                  <X className="mr-1 size-4" />
                  Discard changes
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setAddVersionDialogOpen(true)}
                >
                  <Check className="mr-1 size-4" />
                  Save changes
                </Button>
              </>
            )}
            <UseDatasetDropdown
              datasetName={dataset?.name}
              datasetId={datasetId}
              datasetVersionId={latestVersion?.id}
              entityName={entityName}
              projectId={activeProjectId}
              isEmpty={dataset?.dataset_items_count === 0}
            />
            {isTestSuite && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setSettingsDialogOpen(true)}
              >
                <Settings2 className="size-3.5 shrink-0" />
                Evaluation settings
              </Button>
            )}
          </div>
        </div>
        {dataset?.description && (
          <div className="-mt-3 mb-4 text-muted-slate">
            {dataset.description}
          </div>
        )}
        <div className="flex gap-2 overflow-x-auto">
          {dataset?.created_at && (
            <DateTag
              date={dataset.created_at}
              resource={RESOURCE_TYPE.testSuite}
            />
          )}
          {latestVersion && (
            <>
              <Tag
                size="md"
                variant="transparent"
                className="flex shrink-0 items-center gap-1"
              >
                <GitCommitVertical className="size-3 text-green-500" />
                {latestVersion.version_name}
              </Tag>
              {latestVersion.tags?.map((tag) => (
                <ColoredTag
                  key={tag}
                  label={tag}
                  size="md"
                  IconComponent={GitCommitVertical}
                />
              ))}
            </>
          )}
          {isTestSuite && effectiveAssertions.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className="flex shrink-0 cursor-pointer items-center gap-1 rounded bg-thread-active px-1.5 py-0.5"
                  onClick={() => setSettingsDialogOpen(true)}
                >
                  <CheckCheck className="size-3 text-muted-foreground" />
                  <span className="comet-body-s-accented text-muted-foreground">
                    {effectiveAssertions.length} global assertion
                    {effectiveAssertions.length !== 1 ? "s" : ""}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipPortal>
                <TooltipContent
                  side="bottom"
                  collisionPadding={16}
                  className="max-w-fit p-0"
                >
                  <AssertionsListTooltipContent
                    assertions={effectiveAssertions}
                  />
                </TooltipContent>
              </TooltipPortal>
            </Tooltip>
          )}
          {showTags && (
            <>
              <Separator orientation="vertical" className="ml-1.5 mt-1 h-4" />
              <TagListRenderer
                {...tagListProps}
                onAddTag={handleAddTag}
                onDeleteTag={handleDeleteTag}
                canAdd={canEditDatasets}
                align="start"
                className="min-h-0 w-auto"
              />
            </>
          )}
        </div>
      </div>
      <Tabs value={tab || "items"} onValueChange={setTab}>
        <TabsList variant="underline">
          <TabsTrigger variant="underline" value="items">
            Items
          </TabsTrigger>
          <TabsTrigger variant="underline" value="version-history">
            Version history
          </TabsTrigger>
        </TabsList>
        <TabsContent value="items">
          <DatasetItemsTab
            datasetId={datasetId}
            datasetName={dataset?.name}
            datasetStatus={dataset?.status}
            storageKeys={
              isTestSuite ? SUITE_STORAGE_KEYS : DATASET_STORAGE_KEYS
            }
            defaultSelectedColumns={
              isTestSuite
                ? SUITE_DEFAULT_SELECTED_COLUMNS
                : DATASET_DEFAULT_SELECTED_COLUMNS
            }
            entityName={entityName}
            buildColumns={buildColumns}
            renderEditPanel={renderEditPanel}
            renderAddPanel={renderAddPanel}
            renderAddDialog={renderAddDialog}
            renderExpansionDialog={renderExpansionDialog}
          />
        </TabsContent>
        <TabsContent value="version-history">
          <VersionHistoryTab datasetId={datasetId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default DatasetItemsPage;
