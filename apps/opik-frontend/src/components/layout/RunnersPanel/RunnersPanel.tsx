import { useMemo, useState } from "react";
import { CellContext, ExpandedState } from "@tanstack/react-table";
import { ChevronDown, ChevronRight, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import DataTable from "@/components/shared/DataTable/DataTable";
import DataTableNoData from "@/components/shared/DataTableNoData/DataTableNoData";
import CellWrapper from "@/components/shared/DataTableCells/CellWrapper";
import PrettyCell from "@/components/shared/DataTableCells/PrettyCell";
import TimeCell from "@/components/shared/DataTableCells/TimeCell";
import NavigationTag from "@/components/shared/NavigationTag";
import { RESOURCE_TYPE } from "@/components/shared/ResourceLink/ResourceLink";
import { TableCell, TableRow } from "@/components/ui/table";
import useLocalRunnersList from "@/api/local-runners/useLocalRunnersList";
import useLocalRunnerJobs from "@/api/local-runners/useLocalRunnerJobs";
import useProjectByName from "@/api/projects/useProjectByName";
import {
  LocalRunnerJob,
  LocalRunnerJobStatus,
  LocalRunnerStatus,
} from "@/types/local-runners";
import { COLUMN_TYPE, ColumnData } from "@/types/shared";
import { mapColumnDataFields } from "@/lib/table";

import ConnectRunnerDialog from "./ConnectRunnerDialog";
import JobLogsPanel from "./JobLogsPanel";

type JobTableRow = LocalRunnerJob & {
  _isLogRow?: boolean;
  subRows?: JobTableRow[];
};

const JOB_STATUS_STYLES: Record<LocalRunnerJobStatus, string> = {
  [LocalRunnerJobStatus.COMPLETED]: "bg-emerald-100 text-emerald-700",
  [LocalRunnerJobStatus.RUNNING]: "bg-blue-100 text-blue-700",
  [LocalRunnerJobStatus.PENDING]: "bg-gray-100 text-gray-700",
  [LocalRunnerJobStatus.FAILED]: "bg-red-100 text-red-700",
  [LocalRunnerJobStatus.CANCELLED]: "bg-yellow-100 text-yellow-700",
};

const ExpandCell = (context: CellContext<JobTableRow, unknown>) => {
  const row = context.row;
  if (!row.getCanExpand()) return null;

  return (
    <CellWrapper
      metadata={context.column.columnDef.meta}
      tableMetadata={context.table.options.meta}
    >
      <Button
        variant="minimal"
        size="icon-xs"
        onClick={(e) => {
          e.stopPropagation();
          row.toggleExpanded();
        }}
      >
        {row.getIsExpanded() ? (
          <ChevronDown className="size-3.5" />
        ) : (
          <ChevronRight className="size-3.5" />
        )}
      </Button>
    </CellWrapper>
  );
};

const TraceCell = (context: CellContext<JobTableRow, unknown>) => {
  const job = context.row.original;
  const traceId = job.trace_id;
  const { data: project } = useProjectByName(
    { projectName: job.project },
    { enabled: Boolean(traceId) },
  );

  return (
    <CellWrapper
      metadata={context.column.columnDef.meta}
      tableMetadata={context.table.options.meta}
    >
      {traceId && project?.id ? (
        <NavigationTag
          id={project.id}
          name={traceId}
          resource={RESOURCE_TYPE.traces}
          search={{
            traces_filters: [
              {
                id: "id",
                field: "id",
                type: COLUMN_TYPE.string,
                operator: "=",
                value: traceId,
              },
            ],
          }}
        />
      ) : (
        <span className="truncate">{traceId}</span>
      )}
    </CellWrapper>
  );
};

const StatusCell = (context: CellContext<JobTableRow, unknown>) => {
  const value = context.getValue() as string;
  return (
    <CellWrapper
      metadata={context.column.columnDef.meta}
      tableMetadata={context.table.options.meta}
    >
      <span
        className={cn(
          "comet-body-xs rounded-full px-2 py-0.5",
          JOB_STATUS_STYLES[value as LocalRunnerJobStatus],
        )}
      >
        {value}
      </span>
    </CellWrapper>
  );
};

const COLUMN_DEFS: ColumnData<JobTableRow>[] = [
  {
    id: "expand",
    label: "",
    type: COLUMN_TYPE.string,
    cell: ExpandCell as never,
    size: 40,
  },
  {
    id: "status",
    label: "Status",
    type: COLUMN_TYPE.string,
    cell: StatusCell as never,
    size: 100,
  },
  {
    id: "agent_name",
    label: "Agent",
    type: COLUMN_TYPE.string,
  },
  {
    id: "input",
    label: "Input",
    type: COLUMN_TYPE.string,
    accessorFn: (row) => row.inputs as never,
    cell: PrettyCell as never,
    customMeta: { fieldType: "input" },
    size: 150,
  },
  {
    id: "output",
    label: "Output",
    type: COLUMN_TYPE.string,
    accessorFn: (row) => row.result as never,
    cell: PrettyCell as never,
    customMeta: { fieldType: "output" },
    size: 150,
  },
  {
    id: "trace",
    label: "Trace",
    type: COLUMN_TYPE.string,
    cell: TraceCell as never,
  },
  {
    id: "created_at",
    label: "Created",
    type: COLUMN_TYPE.time,
    cell: TimeCell as never,
    size: 160,
  },
];

const columns = COLUMN_DEFS.map((col) =>
  mapColumnDataFields<JobTableRow, JobTableRow>(col),
);

const RunnersPanel = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const [expanded, setExpanded] = useState<ExpandedState>({});

  const { data } = useLocalRunnersList({
    refetchInterval: 30000,
  });

  const runners = useMemo(() => {
    return data?.content || [];
  }, [data]);

  const firstRunnerId = runners[0]?.id ?? "";

  const { data: jobsData } = useLocalRunnerJobs(
    { runnerId: firstRunnerId },
    { refetchInterval: 10000 },
  );

  const jobs = useMemo(() => {
    return jobsData?.content || [];
  }, [jobsData]);

  const tableRows: JobTableRow[] = useMemo(() => {
    return jobs.map((job) => ({
      ...job,
      subRows: [{ ...job, _isLogRow: true }],
    }));
  }, [jobs]);

  const activeRunners = useMemo(() => {
    return runners.filter(
      (r) =>
        r.status === LocalRunnerStatus.CONNECTED ||
        r.status === LocalRunnerStatus.PAIRING,
    );
  }, [runners]);

  const hasActiveRunner = activeRunners.length > 0;

  const statusLabel = useMemo(() => {
    if (!hasActiveRunner) {
      return "Runner disconnected";
    }
    if (activeRunners.length === 1) {
      const runner = activeRunners[0];
      const agentCount = runner.agents.length;
      return `${runner.name} · ${runner.status} · ${agentCount} agent${
        agentCount !== 1 ? "s" : ""
      }`;
    }
    return `${activeRunners.length} runners connected`;
  }, [activeRunners, hasActiveRunner]);

  return (
    <>
      <div className="comet-content-inset fixed bottom-0 right-0 z-50 border-t bg-background shadow-[0_-2px_10px_rgba(0,0,0,0.1)] transition-all">
        <button
          className="flex w-full items-center justify-between px-4 py-2 hover:bg-muted/50"
          onClick={() => setIsExpanded((prev) => !prev)}
        >
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "size-2 rounded-full",
                hasActiveRunner ? "bg-emerald-500" : "bg-gray-400",
              )}
            />
            <span className="comet-body-s">{statusLabel}</span>
          </div>
          <ChevronUp
            className={cn(
              "size-4 text-muted-foreground transition-transform duration-200",
              isExpanded && "rotate-180",
            )}
          />
        </button>
        {isExpanded && (
          <div className="border-t px-4 py-3">
            {!hasActiveRunner ? (
              <div className="flex flex-col items-center gap-3 py-4">
                <p className="comet-body-s text-muted-slate">
                  Connect your machine to execute agents.
                </p>
                <Button
                  variant="outline"
                  onClick={() => setConnectDialogOpen(true)}
                >
                  Connect
                </Button>
              </div>
            ) : (
              <div className="overflow-y-auto">
                <DataTable
                  columns={columns}
                  data={tableRows}
                  getRowId={(row) => (row._isLogRow ? `${row.id}-log` : row.id)}
                  getSubRows={(row) => row.subRows}
                  expandingConfig={{
                    expanded,
                    setExpanded,
                    autoResetExpanded: false,
                  }}
                  getIsCustomRow={(row) => row.original._isLogRow === true}
                  renderCustomRow={(row) => (
                    <TableRow key={row.id}>
                      <TableCell colSpan={columns.length}>
                        <JobLogsPanel
                          jobId={row.original.id}
                          status={row.original.status}
                        />
                      </TableCell>
                    </TableRow>
                  )}
                  noData={<DataTableNoData title="No jobs yet." />}
                  autoWidth
                />
              </div>
            )}
          </div>
        )}
      </div>
      <ConnectRunnerDialog
        open={connectDialogOpen}
        setOpen={setConnectDialogOpen}
      />
    </>
  );
};

export default RunnersPanel;
