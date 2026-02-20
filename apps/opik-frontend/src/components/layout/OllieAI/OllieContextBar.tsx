import React from "react";
import { FileText } from "lucide-react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { PAGE_ID, PAGE_SHORT_LABELS } from "@/constants/pageIds";
import { OllieTableState } from "@/store/OllieStore";

type OllieContextBarProps = {
  pageId: PAGE_ID;
  pageDescription: string;
  params: Record<string, string>;
  tableState: OllieTableState | null;
};

const PARAM_LABELS: Record<string, string> = {
  projectId: "Project",
  datasetId: "Dataset",
  promptId: "Prompt",
  traceId: "Trace",
  spanId: "Span",
  threadId: "Thread",
  dashboardId: "Dashboard",
  alertId: "Alert",
  annotationQueueId: "Queue",
  optimizationId: "Optimization",
};

// Priority order: most specific entity first — determines what the chip label shows.
const LEAF_ENTITY_PRIORITY = [
  "spanId",
  "traceId",
  "threadId",
  "annotationQueueId",
  "alertId",
  "optimizationId",
  "promptId",
  "datasetId",
  "dashboardId",
  "projectId",
];

function getChipLabel(
  pageLabel: string,
  params: Record<string, string>,
): string {
  for (const key of LEAF_ENTITY_PRIORITY) {
    if (params[key]) {
      return PARAM_LABELS[key] ?? key;
    }
  }
  return pageLabel;
}

function getTableStateSummary(tableState: OllieTableState): {
  filterCount: number | null;
  search: string | null;
  sortField: string | null;
  sortDirection: string | null;
  page: number | undefined;
  size: number | undefined;
} {
  let filterCount: number | null = null;
  if (tableState.filters) {
    try {
      const parsed = JSON.parse(tableState.filters);
      const count = Array.isArray(parsed) ? parsed.length : 1;
      if (count > 0) filterCount = count;
    } catch {
      /* ignore */
    }
  }

  let sortField: string | null = null;
  let sortDirection: string | null = null;
  if (tableState.sorting) {
    try {
      const parsed = JSON.parse(tableState.sorting);
      if (Array.isArray(parsed) && parsed[0]?.field) {
        sortField = parsed[0].field;
        sortDirection = parsed[0].direction ?? null;
      }
    } catch {
      /* ignore */
    }
  }

  return {
    filterCount,
    search: tableState.search ?? null,
    sortField,
    sortDirection,
    page: tableState.page,
    size: tableState.size,
  };
}

function hasTableStateContent(tableState: OllieTableState): boolean {
  if (tableState.filters) {
    try {
      const parsed = JSON.parse(tableState.filters);
      if (Array.isArray(parsed) && parsed.length > 0) return true;
      if (!Array.isArray(parsed)) return true;
    } catch {
      return true;
    }
  }
  return !!(tableState.search || tableState.sorting || tableState.groups);
}

const OllieContextBar: React.FC<OllieContextBarProps> = ({
  pageId,
  pageDescription,
  params,
  tableState,
}) => {
  const pageLabel = PAGE_SHORT_LABELS[pageId] ?? pageId;
  const chipLabel = getChipLabel(pageLabel, params);
  const entityParams = Object.entries(params).filter(([, v]) => v);
  const showTableState =
    tableState !== null && hasTableStateContent(tableState);
  const tableSummary = showTableState
    ? getTableStateSummary(tableState!)
    : null;

  return (
    <div className="border-t px-4 py-2">
      <HoverCard openDelay={200} closeDelay={100}>
        <HoverCardTrigger asChild>
          <div className="inline-flex cursor-default items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <FileText className="size-3 shrink-0" />
            <span className="comet-body-xs max-w-[200px] truncate">
              {chipLabel}
            </span>
          </div>
        </HoverCardTrigger>
        <HoverCardContent
          className="w-72"
          side="top"
          align="start"
          sideOffset={8}
        >
          <div className="space-y-2">
            <div>
              <p className="comet-body-s-accented text-foreground">
                Page context
              </p>
              <p className="comet-body-xs mt-0.5 text-muted-foreground">
                {pageDescription}
              </p>
            </div>

            {entityParams.length > 0 && (
              <div className="space-y-0.5 border-t pt-2">
                {entityParams.map(([key, value]) => {
                  const humanLabel = PARAM_LABELS[key] ?? key;
                  return (
                    <p
                      key={key}
                      className="comet-body-xs text-muted-foreground"
                    >
                      <span className="font-medium text-foreground">
                        {humanLabel}:
                      </span>{" "}
                      <span className="font-mono">{value}</span>
                    </p>
                  );
                })}
              </div>
            )}

            {tableSummary && (
              <div className="space-y-0.5 border-t pt-2">
                {tableSummary.filterCount !== null && (
                  <p className="comet-body-xs text-muted-foreground">
                    <span className="font-medium text-foreground">
                      Filters:
                    </span>{" "}
                    {tableSummary.filterCount} active
                  </p>
                )}
                {tableSummary.search && (
                  <p className="comet-body-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Search:</span>{" "}
                    &ldquo;{tableSummary.search}&rdquo;
                  </p>
                )}
                {tableSummary.sortField && (
                  <p className="comet-body-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Sort:</span>{" "}
                    {tableSummary.sortField}{" "}
                    {tableSummary.sortDirection === "DESC"
                      ? "(descending)"
                      : "(ascending)"}
                  </p>
                )}
                {tableSummary.page !== undefined && (
                  <p className="comet-body-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Page:</span>{" "}
                    {tableSummary.page}
                    {tableSummary.size !== undefined
                      ? `, ${tableSummary.size} rows`
                      : ""}
                  </p>
                )}
              </div>
            )}
          </div>
        </HoverCardContent>
      </HoverCard>
    </div>
  );
};

export default OllieContextBar;
