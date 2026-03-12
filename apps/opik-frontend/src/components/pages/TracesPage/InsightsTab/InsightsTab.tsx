import React, { useCallback, useEffect } from "react";
import { StringParam } from "use-query-params";

import Loader from "@/components/shared/Loader/Loader";
import {
  useMetricDateRangeWithQueryAndStorage,
  MetricDateRangeSelect,
} from "@/components/pages-shared/traces/MetricDateRangeSelect";
import DashboardSaveActions from "@/components/pages-shared/dashboards/DashboardSaveActions/DashboardSaveActions";
import DashboardContent from "@/components/pages-shared/dashboards/DashboardContent/DashboardContent";
import InsightsViewSelector from "@/components/pages/TracesPage/InsightsTab/InsightsViewSelector";
import ShareDashboardButton from "@/components/pages-shared/dashboards/ShareDashboardButton/ShareDashboardButton";
import useQueryParamAndLocalStorageState from "@/hooks/useQueryParamAndLocalStorageState";
import { useDashboardLifecycle } from "@/components/pages-shared/dashboards/hooks/useDashboardLifecycle";
import {
  useDashboardStore,
  selectSetRuntimeConfig,
  selectHasUnsavedChanges,
} from "@/store/DashboardStore";
import PageBodyStickyContainer from "@/components/layout/PageBodyStickyContainer/PageBodyStickyContainer";
import {
  PROJECT_TEMPLATE_LIST,
  DEPRECATED_PROJECT_METRICS_ID,
  DEPRECATED_PROJECT_PERFORMANCE_ID,
} from "@/lib/dashboard/templates";
import { Separator } from "@/components/ui/separator";
import TooltipWrapper from "@/components/shared/TooltipWrapper/TooltipWrapper";
import { useActiveWorkspaceName } from "@/store/AppStore";
import { usePermissions } from "@/contexts/PermissionsContext";

const DASHBOARD_QUERY_PARAM_KEY = "dashboardId";
const DASHBOARD_LOCAL_STORAGE_KEY_PREFIX = "opik-project-dashboard";

interface InsightsTabProps {
  projectId: string;
}

const DEFAULT_TEMPLATE_ID = PROJECT_TEMPLATE_LIST[0].id;

const InsightsTab: React.FunctionComponent<InsightsTabProps> = ({
  projectId,
}) => {
  const workspaceName = useActiveWorkspaceName();
  const { permissions } = usePermissions();
  const { canViewDashboards } = permissions;

  const [dashboardId, setDashboardId] = useQueryParamAndLocalStorageState({
    localStorageKey: `${DASHBOARD_LOCAL_STORAGE_KEY_PREFIX}-${workspaceName}`,
    queryKey: DASHBOARD_QUERY_PARAM_KEY,
    defaultValue: null as string | null,
    queryParamConfig: StringParam,
    syncQueryWithLocalStorageOnInit: true,
    syncLocalStorageAcrossTabs: false,
  });

  // Ensure a valid dashboard is always selected:
  // - no permission → lock to default template
  // - no selection or deprecated ID → fall back to default template
  useEffect(() => {
    const needsDefault =
      !canViewDashboards ||
      !dashboardId ||
      dashboardId === DEPRECATED_PROJECT_METRICS_ID ||
      dashboardId === DEPRECATED_PROJECT_PERFORMANCE_ID;

    if (needsDefault && dashboardId !== DEFAULT_TEMPLATE_ID) {
      setDashboardId(DEFAULT_TEMPLATE_ID);
    }
  }, [dashboardId, setDashboardId, canViewDashboards]);

  const { dashboard, isPending, save, discard } = useDashboardLifecycle({
    dashboardId: dashboardId || null,
    enabled: Boolean(dashboardId),
  });

  const hasUnsavedChanges = useDashboardStore(selectHasUnsavedChanges);
  const setRuntimeConfig = useDashboardStore(selectSetRuntimeConfig);

  const { dateRange, handleDateRangeChange, minDate, maxDate, dateRangeValue } =
    useMetricDateRangeWithQueryAndStorage({
      key: "dashboard_time_range",
      localStorageKey: "opik-project-insights-daterange",
    });

  useEffect(() => {
    setRuntimeConfig({
      projectIds: [projectId],
      dateRange: dateRangeValue,
      dashboardType: dashboard?.type,
    });

    return () => {
      setRuntimeConfig({});
    };
  }, [projectId, dateRangeValue, dashboard?.type, setRuntimeConfig]);

  const handleDashboardCreated = useCallback(
    (newDashboardId: string) => {
      setDashboardId(newDashboardId);
    },
    [setDashboardId],
  );

  const handleDashboardDeleted = useCallback(
    (deletedDashboardId: string) => {
      if (dashboardId === deletedDashboardId) {
        setDashboardId(PROJECT_TEMPLATE_LIST[0]?.id || null);
      }
    },
    [dashboardId, setDashboardId],
  );

  const viewSelector = (
    <InsightsViewSelector
      value={dashboardId || null}
      onChange={setDashboardId}
      onViewCreated={handleDashboardCreated}
      onViewDeleted={handleDashboardDeleted}
      disabled={hasUnsavedChanges}
    />
  );

  return (
    <>
      <PageBodyStickyContainer
        className="flex items-center justify-between gap-4 pb-3 pt-2"
        direction="bidirectional"
        limitWidth
      >
        {canViewDashboards &&
          (hasUnsavedChanges ? (
            <TooltipWrapper content="Save or discard your changes before switching">
              <div>{viewSelector}</div>
            </TooltipWrapper>
          ) : (
            viewSelector
          ))}

        <div className="flex shrink-0 items-center gap-2">
          {dashboard && (
            <DashboardSaveActions
              onSave={save}
              onDiscard={discard}
              dashboard={dashboard}
              navigateOnCreate={false}
              onDashboardCreated={handleDashboardCreated}
            />
          )}
          <MetricDateRangeSelect
            value={dateRange}
            onChangeValue={handleDateRangeChange}
            minDate={minDate}
            maxDate={maxDate}
            hideAlltime
          />
          <Separator orientation="vertical" className="mx-2 h-4" />
          <ShareDashboardButton />
        </div>
      </PageBodyStickyContainer>

      <div className="px-6 pb-4 pt-1">
        {isPending && <Loader />}

        {!isPending && !dashboardId && (
          <div className="flex h-full items-center justify-center">
            <p className="text-muted-foreground">
              No dashboard selected. Please select or create a dashboard.
            </p>
          </div>
        )}

        {!isPending && dashboardId && !dashboard && (
          <div className="flex h-full items-center justify-center">
            <p className="text-muted-foreground">
              Dashboard could not be loaded. Please select another dashboard
              from the dropdown.
            </p>
          </div>
        )}

        {!isPending && dashboard && <DashboardContent />}
      </div>
    </>
  );
};

export default InsightsTab;
