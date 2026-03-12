import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ChartLine,
  ChevronDown,
  CopyPlus,
  Pencil,
  Plus,
  SquareActivity,
  Trash,
} from "lucide-react";
import { format } from "date-fns";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tag } from "@/components/ui/tag";
import { ListAction } from "@/components/ui/list-action";
import SearchInput from "@/components/shared/SearchInput/SearchInput";
import ConfirmDialog from "@/components/shared/ConfirmDialog/ConfirmDialog";
import AddEditCloneDashboardDialog, {
  DashboardDialogMode,
  DashboardDialogLabels,
  DashboardDialogToastConfig,
} from "@/components/pages-shared/dashboards/AddEditCloneDashboardDialog/AddEditCloneDashboardDialog";
import useDashboardsList from "@/api/dashboards/useDashboardsList";
import useDashboardBatchDeleteMutation from "@/api/dashboards/useDashboardBatchDeleteMutation";
import useAppStore from "@/store/AppStore";
import {
  Dashboard,
  DASHBOARD_SCOPE,
  DASHBOARD_TYPE,
  DashboardTemplate,
} from "@/types/dashboard";
import { PROJECT_TEMPLATE_LIST } from "@/lib/dashboard/templates";
import { isTemplateId } from "@/lib/dashboard/utils";
import {
  generateDashboardScopeFilter,
  generateDashboardTypeFilter,
} from "@/lib/filters";
import TooltipWrapper from "@/components/shared/TooltipWrapper/TooltipWrapper";
import { cn } from "@/lib/utils";

const VIEW_DIALOG_LABELS: DashboardDialogLabels = {
  create: {
    title: "Create view",
    buttonText: "Create view",
  },
  edit: {
    title: "Edit view",
    buttonText: "Rename view",
  },
  clone: {
    title: "Duplicate view",
    description:
      "Create a copy to customize it without affecting the original.",
    buttonText: "Duplicate view",
  },
};

const VIEW_TOAST_CONFIG: DashboardDialogToastConfig = {
  create: {
    title: "View created",
    description: "Start customizing it by adding widgets",
    actionLabel: "Add your first widget",
  },
  clone: {
    title: "View created",
    description: "Start customizing it by adding or editing widgets",
    actionLabel: "Add a widget",
  },
  edit: {
    title: "View updated",
    description: "Your changes have been saved.",
  },
};

interface InsightsViewSelectorProps {
  value: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
  onViewCreated?: (dashboardId: string) => void;
  onViewDeleted?: (deletedDashboardId: string) => void;
}

interface DialogState {
  isOpen: boolean;
  mode: DashboardDialogMode;
  dashboard?: Dashboard;
}

interface DeleteState {
  isOpen: boolean;
  dashboard?: Dashboard;
}

const getWidgetCount = (dashboard: Dashboard): number => {
  try {
    return dashboard.config.sections.flatMap((s) => s.widgets).length;
  } catch {
    return 0;
  }
};

const InsightsViewSelector: React.FC<InsightsViewSelectorProps> = ({
  value,
  onChange,
  disabled = false,
  onViewCreated,
  onViewDeleted,
}) => {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [search, setSearch] = useState("");
  const resetDialogKeyRef = useRef(0);

  const [dialogState, setDialogState] = useState<DialogState>({
    isOpen: false,
    mode: "create",
  });

  const [deleteState, setDeleteState] = useState<DeleteState>({
    isOpen: false,
  });

  const workspaceName = useAppStore((state) => state.activeWorkspaceName);
  const { mutate: deleteMutate } = useDashboardBatchDeleteMutation();

  const processedFilters = useMemo(() => {
    return [
      ...generateDashboardScopeFilter(DASHBOARD_SCOPE.INSIGHTS),
      ...generateDashboardTypeFilter(DASHBOARD_TYPE.MULTI_PROJECT),
    ];
  }, []);

  const { data: dashboardsData } = useDashboardsList(
    {
      workspaceName,
      filters: processedFilters,
      page: 1,
      size: 1000,
    },
    {
      enabled: Boolean(workspaceName),
    },
  );

  const dashboards = useMemo(
    () => dashboardsData?.content || [],
    [dashboardsData?.content],
  );

  const templates = PROJECT_TEMPLATE_LIST;

  const filteredTemplates = useMemo(
    () =>
      templates.filter((t) =>
        t.name.toLowerCase().includes(search.toLowerCase()),
      ),
    [search, templates],
  );

  const filteredDashboards = useMemo(
    () =>
      dashboards.filter((d) =>
        d.name.toLowerCase().includes(search.toLowerCase()),
      ),
    [dashboards, search],
  );

  const selectedItem = useMemo(() => {
    if (isTemplateId(value)) {
      return templates.find((t) => t.id === value);
    }
    return dashboards.find((d) => d.id === value);
  }, [value, dashboards, templates]);

  const selectedName = selectedItem?.name ?? "Select a view";

  const handleSelect = useCallback(
    (id: string) => {
      if (value !== id) {
        onChange(id);
      }
      setIsPopoverOpen(false);
    },
    [onChange, value],
  );

  const handleEditDashboard = useCallback((dashboard: Dashboard) => {
    resetDialogKeyRef.current += 1;
    setDialogState({ isOpen: true, mode: "edit", dashboard });
    setIsPopoverOpen(false);
  }, []);

  const handleDuplicateDashboard = useCallback((dashboard: Dashboard) => {
    resetDialogKeyRef.current += 1;
    setDialogState({ isOpen: true, mode: "clone", dashboard });
    setIsPopoverOpen(false);
  }, []);

  const handleDuplicateTemplate = useCallback((template: DashboardTemplate) => {
    resetDialogKeyRef.current += 1;
    const syntheticDashboard = {
      id: template.id,
      name: template.name,
      description: template.description,
      config: template.config,
      type: DASHBOARD_TYPE.MULTI_PROJECT,
      scope: DASHBOARD_SCOPE.INSIGHTS,
    } as Dashboard;
    setDialogState({
      isOpen: true,
      mode: "clone",
      dashboard: syntheticDashboard,
    });
    setIsPopoverOpen(false);
  }, []);

  const handleDeleteDashboard = useCallback((dashboard: Dashboard) => {
    setDeleteState({ isOpen: true, dashboard });
  }, []);

  const confirmDelete = useCallback(() => {
    if (!deleteState.dashboard) return;
    const deletedId = deleteState.dashboard.id;
    deleteMutate(
      { ids: [deletedId] },
      {
        onSuccess: () => {
          onViewDeleted?.(deletedId);
        },
      },
    );
    setDeleteState({ isOpen: false });
    setIsPopoverOpen(false);
  }, [deleteState.dashboard, deleteMutate, onViewDeleted]);

  const handleCreateNew = useCallback(() => {
    resetDialogKeyRef.current += 1;
    setIsPopoverOpen(false);
    setDialogState({ isOpen: true, mode: "create" });
  }, []);

  const handleDialogCreateSuccess = useCallback(
    (dashboardId: string) => {
      onViewCreated?.(dashboardId);
    },
    [onViewCreated],
  );

  const closeDialog = useCallback((open: boolean) => {
    if (!open) {
      setDialogState({ isOpen: false, mode: "create" });
    }
  }, []);

  const handleOpenChange = useCallback((open: boolean) => {
    setIsPopoverOpen(open);
    if (!open) {
      setSearch("");
    }
  }, []);

  const hasResults =
    filteredTemplates.length > 0 || filteredDashboards.length > 0;
  const showSeparator =
    filteredTemplates.length > 0 && filteredDashboards.length > 0;

  return (
    <>
      <Popover open={isPopoverOpen} onOpenChange={handleOpenChange}>
        <TooltipWrapper content={selectedName}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn("max-w-[400px] gap-1.5", {
                "disabled:cursor-not-allowed disabled:border-input disabled:bg-muted-disabled disabled:text-muted-gray disabled:placeholder:text-muted-gray hover:disabled:shadow-none":
                  disabled,
              })}
              disabled={disabled}
              type="button"
            >
              <SquareActivity className="size-3.5 shrink-0 text-chart-pink" />
              <span className="comet-body-s-accented truncate">
                {selectedName}
              </span>
              <ChevronDown className="ml-1 size-3.5 shrink-0 text-light-slate" />
            </Button>
          </PopoverTrigger>
        </TooltipWrapper>

        <PopoverContent
          className="w-[392px] p-1"
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div onKeyDown={(e) => e.stopPropagation()}>
            <SearchInput
              searchText={search}
              setSearchText={setSearch}
              placeholder="Search"
              variant="ghost"
            />
          </div>
          <Separator className="my-1" />

          <div className="max-h-[40vh] overflow-y-auto overflow-x-hidden">
            {!hasResults ? (
              <div className="flex min-h-24 flex-col items-center justify-center px-6 py-4">
                <div className="comet-body-s text-center text-muted-slate">
                  No search results
                </div>
              </div>
            ) : (
              <>
                {filteredTemplates.map((template) => (
                  <BuiltInViewItem
                    key={template.id}
                    template={template}
                    isSelected={value === template.id}
                    onSelect={handleSelect}
                    onDuplicate={handleDuplicateTemplate}
                  />
                ))}

                {showSeparator && <Separator className="my-1" />}

                {filteredDashboards.map((dashboard) => (
                  <CustomViewItem
                    key={dashboard.id}
                    dashboard={dashboard}
                    isSelected={value === dashboard.id}
                    onSelect={handleSelect}
                    onEdit={handleEditDashboard}
                    onDuplicate={handleDuplicateDashboard}
                    onDelete={handleDeleteDashboard}
                  />
                ))}
              </>
            )}
          </div>

          <Separator className="my-1" />
          <ListAction onClick={handleCreateNew}>
            <Plus className="size-4 shrink-0" />
            Add new
          </ListAction>
        </PopoverContent>
      </Popover>

      <AddEditCloneDashboardDialog
        key={resetDialogKeyRef.current}
        mode={dialogState.mode}
        dashboard={dialogState.dashboard}
        open={dialogState.isOpen}
        setOpen={closeDialog}
        onCreateSuccess={handleDialogCreateSuccess}
        navigateOnCreate={false}
        dashboardType={DASHBOARD_TYPE.MULTI_PROJECT}
        dashboardScope={DASHBOARD_SCOPE.INSIGHTS}
        labels={VIEW_DIALOG_LABELS}
        toastConfig={VIEW_TOAST_CONFIG}
      />

      <ConfirmDialog
        open={deleteState.isOpen}
        setOpen={(open) => setDeleteState({ isOpen: open })}
        onConfirm={confirmDelete}
        title="Delete view"
        description={`Are you sure you want to delete "${deleteState.dashboard?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        confirmButtonVariant="destructive"
      />
    </>
  );
};

interface BuiltInViewItemProps {
  template: DashboardTemplate;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onDuplicate: (template: DashboardTemplate) => void;
}

const BuiltInViewItem: React.FC<BuiltInViewItemProps> = ({
  template,
  isSelected,
  onSelect,
  onDuplicate,
}) => {
  return (
    <div
      className={cn(
        "group cursor-pointer rounded px-4 py-2.5 hover:bg-primary-foreground",
        isSelected && "bg-primary-foreground",
      )}
      onClick={() => onSelect(template.id)}
    >
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <SquareActivity className="size-4 shrink-0 text-chart-pink" />
            <span className="comet-body-s-accented truncate text-foreground">
              {template.name}
            </span>
            <Tag variant="pink" size="sm" className="shrink-0">
              Built-in
            </Tag>
          </div>
          <div className="shrink-0 opacity-0 group-hover:opacity-100">
            <TooltipWrapper content="Duplicate">
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-muted-slate hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  onDuplicate(template);
                }}
              >
                <CopyPlus className="size-3.5" />
              </Button>
            </TooltipWrapper>
          </div>
        </div>
        <div className="comet-body-s text-light-slate">
          {template.description}
        </div>
      </div>
    </div>
  );
};

interface CustomViewItemProps {
  dashboard: Dashboard;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onEdit: (dashboard: Dashboard) => void;
  onDuplicate: (dashboard: Dashboard) => void;
  onDelete: (dashboard: Dashboard) => void;
}

const CustomViewItem: React.FC<CustomViewItemProps> = ({
  dashboard,
  isSelected,
  onSelect,
  onEdit,
  onDuplicate,
  onDelete,
}) => {
  const widgetCount = getWidgetCount(dashboard);
  const lastUpdated = dashboard.last_updated_at
    ? format(new Date(dashboard.last_updated_at), "dd MMM yyyy HH:mm")
    : "";

  const subtext = [
    `${widgetCount} widget${widgetCount !== 1 ? "s" : ""}`,
    lastUpdated,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div
      className={cn(
        "group cursor-pointer rounded px-4 py-2.5 hover:bg-primary-foreground",
        isSelected && "bg-primary-foreground",
      )}
      onClick={() => onSelect(dashboard.id)}
    >
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-2 pr-2">
            <ChartLine className="size-4 shrink-0 text-muted-slate" />
            <span className="comet-body-s-accented truncate text-foreground">
              {dashboard.name}
            </span>
          </div>
          <div className="flex shrink-0 items-stretch gap-1.5 rounded-sm p-0.5 opacity-0 group-hover:opacity-100">
            <TooltipWrapper content="Rename">
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-muted-slate hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(dashboard);
                }}
              >
                <Pencil className="size-3.5" />
              </Button>
            </TooltipWrapper>
            <Separator orientation="vertical" />
            <TooltipWrapper content="Duplicate">
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-muted-slate hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  onDuplicate(dashboard);
                }}
              >
                <CopyPlus className="size-3.5" />
              </Button>
            </TooltipWrapper>
            <Separator orientation="vertical" />
            <TooltipWrapper content="Delete">
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-muted-slate hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(dashboard);
                }}
              >
                <Trash className="size-3.5" />
              </Button>
            </TooltipWrapper>
          </div>
        </div>
        <div className="comet-body-s truncate text-light-slate">{subtext}</div>
      </div>
    </div>
  );
};

export default InsightsViewSelector;
