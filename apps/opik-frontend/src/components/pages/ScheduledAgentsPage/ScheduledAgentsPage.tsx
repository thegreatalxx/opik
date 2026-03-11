import React, { useCallback, useMemo, useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import useLocalStorageState from "use-local-storage-state";
import { StringParam, useQueryParam } from "use-query-params";
import { useNavigate } from "@tanstack/react-router";

import useSchedulesList from "@/api/scheduled-agents/useSchedulesList";
import useAlertsList from "@/api/alerts/useAlertsList";
import DataTable from "@/components/shared/DataTable/DataTable";
import DataTablePagination from "@/components/shared/DataTablePagination/DataTablePagination";
import DataTableNoData from "@/components/shared/DataTableNoData/DataTableNoData";
import StatusCell from "@/components/shared/DataTableCells/StatusCell";
import TimeCell from "@/components/shared/DataTableCells/TimeCell";
import ListCell from "@/components/shared/DataTableCells/ListCell";
import Loader from "@/components/shared/Loader/Loader";
import SearchInput from "@/components/shared/SearchInput/SearchInput";
import ColumnsButton from "@/components/shared/ColumnsButton/ColumnsButton";
import { Button } from "@/components/ui/button";
import useAppStore from "@/store/AppStore";
import { Schedule } from "@/types/scheduled-agents";
import {
  COLUMN_NAME_ID,
  COLUMN_TYPE,
  ColumnData,
} from "@/types/shared";
import { convertColumnDataToColumn } from "@/lib/table";
import {
  ColumnPinningState,
  ColumnSort,
} from "@tanstack/react-table";
import ScheduleRowActionsCell from "@/components/pages/ScheduledAgentsPage/ScheduleRowActionsCell";
import {
  generateActionsColumDef,
} from "@/components/shared/DataTable/utils";

const getRowId = (s: Schedule) => s.id;

const SELECTED_COLUMNS_KEY = "scheduled-agents-selected-columns";
const COLUMNS_WIDTH_KEY = "scheduled-agents-columns-width";
const COLUMNS_ORDER_KEY = "scheduled-agents-columns-order";
const COLUMNS_SORT_KEY = "scheduled-agents-columns-sort";
const PAGINATION_SIZE_KEY = "scheduled-agents-pagination-size";

const DEFAULT_COLUMNS: ColumnData<Schedule>[] = [
  {
    id: COLUMN_NAME_ID,
    label: "Name",
    type: COLUMN_TYPE.string,
    sortable: true,
  },
  {
    id: "cron",
    label: "Schedule",
    type: COLUMN_TYPE.string,
  },
  {
    id: "status",
    label: "Status",
    type: COLUMN_TYPE.string,
    cell: StatusCell as never,
    accessorFn: (row) => row.enabled,
  },
  {
    id: "channels",
    label: "Channels",
    type: COLUMN_TYPE.list,
    cell: ListCell as never,
  },
  {
    id: "last_run",
    label: "Last Run",
    type: COLUMN_TYPE.time,
    cell: TimeCell as never,
  },
  {
    id: "next_run",
    label: "Next Run",
    type: COLUMN_TYPE.time,
    cell: TimeCell as never,
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
];

const DEFAULT_SELECTED_COLUMNS: string[] = [
  COLUMN_NAME_ID,
  "cron",
  "status",
  "channels",
  "last_run",
  "next_run",
];

const DEFAULT_COLUMNS_ORDER: string[] = [
  COLUMN_NAME_ID,
  "cron",
  "status",
  "channels",
  "last_run",
  "next_run",
  "created_at",
  "last_updated_at",
];

const DEFAULT_COLUMN_PINNING: ColumnPinningState = {
  left: [],
  right: [],
};

const ScheduledAgentsPage: React.FunctionComponent = () => {
  const workspaceName = useAppStore((state) => state.activeWorkspaceName);
  const navigate = useNavigate();

  const [search = "", setSearch] = useQueryParam(
    "schedules_search",
    StringParam,
    { updateType: "replaceIn" },
  );

  const [page, setPage] = useState(1);
  const [size, setSize] = useLocalStorageState<number>(PAGINATION_SIZE_KEY, {
    defaultValue: 10,
  });

  const [sortedColumns, setSortedColumns] = useLocalStorageState<ColumnSort[]>(
    COLUMNS_SORT_KEY,
    { defaultValue: [] },
  );

  const { data, isPending, isPlaceholderData, isFetching } = useSchedulesList(
    { page, size },
    {
      placeholderData: keepPreviousData,
      refetchInterval: 30000,
    },
  );

  const { data: alertsData } = useAlertsList(
    { workspaceName, page: 1, size: 100 },
    { placeholderData: keepPreviousData },
  );

  const alertNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const alert of alertsData?.content ?? []) {
      if (alert.id) map[alert.id] = alert.name;
    }
    return map;
  }, [alertsData]);

  const schedules = useMemo(() => {
    return (data?.content ?? []).map((s) => ({
      ...s,
      channels: s.channels?.map((id) => alertNameMap[id] ?? id),
    }));
  }, [data?.content, alertNameMap]);
  const total = data?.total ?? 0;
  const noData = !search;
  const noDataText = noData
    ? "There are no scheduled agents yet"
    : "No search results";

  const [selectedColumns, setSelectedColumns] = useLocalStorageState<string[]>(
    SELECTED_COLUMNS_KEY,
    { defaultValue: DEFAULT_SELECTED_COLUMNS },
  );

  const [columnsOrder, setColumnsOrder] = useLocalStorageState<string[]>(
    COLUMNS_ORDER_KEY,
    { defaultValue: DEFAULT_COLUMNS_ORDER },
  );

  const [columnsWidth, setColumnsWidth] = useLocalStorageState<
    Record<string, number>
  >(COLUMNS_WIDTH_KEY, { defaultValue: {} });

  const columns = useMemo(() => {
    return [
      ...convertColumnDataToColumn<Schedule, Schedule>(DEFAULT_COLUMNS, {
        columnsOrder,
        selectedColumns,
        sortableColumns: [],
      }),
      generateActionsColumDef({
        cell: ScheduleRowActionsCell,
      }),
    ];
  }, [columnsOrder, selectedColumns]);

  const resizeConfig = useMemo(
    () => ({
      enabled: true,
      columnSizing: columnsWidth,
      onColumnResize: setColumnsWidth,
    }),
    [columnsWidth, setColumnsWidth],
  );

  const sortConfig = useMemo(
    () => ({
      enabled: true,
      sorting: sortedColumns,
      setSorting: setSortedColumns,
    }),
    [sortedColumns, setSortedColumns],
  );

  const handleNewScheduleClick = useCallback(() => {
    navigate({
      to: "/$workspaceName/scheduled-agents/new",
      params: { workspaceName },
      search: (prev) => prev,
    });
  }, [navigate, workspaceName]);

  if (isPending) {
    return <Loader />;
  }

  return (
    <div className="pt-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="comet-title-l">Scheduled Agents</h1>
      </div>

      <div className="mt-2">
        <div className="mb-4 flex items-center justify-between gap-8">
          <div className="flex items-center gap-2">
            <SearchInput
              searchText={search!}
              setSearchText={setSearch}
              placeholder="Search by name"
              className="w-[320px]"
              dimension="sm"
            />
          </div>

          <div className="flex items-center gap-2">
            <ColumnsButton
              columns={DEFAULT_COLUMNS}
              selectedColumns={selectedColumns}
              onSelectionChange={setSelectedColumns}
              order={columnsOrder}
              onOrderChange={setColumnsOrder}
            />
            <Button
              variant="default"
              size="sm"
              onClick={handleNewScheduleClick}
            >
              Create schedule
            </Button>
          </div>
        </div>
        <DataTable
          columns={columns}
          data={schedules}
          resizeConfig={resizeConfig}
          sortConfig={sortConfig}
          getRowId={getRowId}
          columnPinning={DEFAULT_COLUMN_PINNING}
          noData={
            <DataTableNoData title={noDataText}>
              {noData && (
                <Button variant="link" onClick={handleNewScheduleClick}>
                  Create schedule
                </Button>
              )}
            </DataTableNoData>
          }
          showLoadingOverlay={isPlaceholderData && isFetching}
        />
        <div className="py-4">
          <DataTablePagination
            page={page}
            pageChange={setPage}
            size={size}
            sizeChange={setSize}
            total={total}
          />
        </div>
      </div>
    </div>
  );
};

export default ScheduledAgentsPage;
