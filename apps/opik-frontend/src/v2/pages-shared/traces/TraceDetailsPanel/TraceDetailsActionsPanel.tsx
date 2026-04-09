import React, { useCallback, useMemo, useState } from "react";
import copy from "clipboard-copy";
import FileSaver from "file-saver";
import { json2csv } from "json-2-csv";
import get from "lodash/get";
import {
  ChevronsRight,
  Copy,
  Download,
  ExternalLink,
  MoreHorizontal,
  Share,
  Sparkles,
  Trash,
} from "lucide-react";
import uniq from "lodash/uniq";
import isArray from "lodash/isArray";

import { COLUMN_FEEDBACK_SCORES_ID, OnChangeFn } from "@/types/shared";
import { BASE_TRACE_DATA_TYPE, Span, Trace } from "@/types/traces";
import useTraceDeleteMutation from "@/api/traces/useTraceDeleteMutation";
import { useToast } from "@/ui/use-toast";
import { Button } from "@/ui/button";
import { Separator } from "@/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/ui/dropdown-menu";
import TooltipWrapper from "@/shared/TooltipWrapper/TooltipWrapper";
import ConfirmDialog from "@/shared/ConfirmDialog/ConfirmDialog";
import BaseTraceDataTypeIcon from "@/shared/BaseTraceDataTypeIcon/BaseTraceDataTypeIcon";
import { useIsFeatureEnabled } from "@/contexts/feature-toggles-provider";
import { FeatureToggleKeys } from "@/types/feature-toggles";
import {
  DetailsActionSection,
  DetailsActionSectionValue,
} from "@/v2/pages-shared/traces/DetailsActionSection";
import {
  mapRowDataForExport,
  TRACE_EXPORT_COLUMNS,
} from "@/lib/traces/exportUtils";
import { TRACE_DATA_TYPE } from "@/hooks/useTracesOrSpansList";
import { usePermissions } from "@/contexts/PermissionsContext";
import { useHotkeys } from "react-hotkeys-hook";

type ArrowNavigationConfig = {
  hasPrevious: boolean;
  hasNext: boolean;
  onChange: (shift: 1 | -1) => void;
  previousTooltip?: string;
  nextTooltip?: string;
};

type TraceDetailsActionsPanelProps = {
  projectId: string;
  traceId: string;
  spanId: string;
  traceName?: string;
  traceType?: BASE_TRACE_DATA_TYPE;
  threadId?: string;
  setThreadId?: OnChangeFn<string | null | undefined>;
  onDelete: () => void;
  onClose: () => void;
  treeData: Array<Trace | Span>;
  setActiveSection: (v: DetailsActionSectionValue) => void;
  horizontalNavigation?: ArrowNavigationConfig;
};

const TraceDetailsActionsPanel: React.FunctionComponent<
  TraceDetailsActionsPanelProps
> = ({
  projectId,
  traceId,
  spanId,
  traceName,
  traceType,
  threadId,
  setThreadId,
  onDelete,
  onClose,
  treeData,
  setActiveSection,
  horizontalNavigation,
}) => {
  const [popupOpen, setPopupOpen] = useState<boolean>(false);
  const isAIInspectorEnabled = useIsFeatureEnabled(
    FeatureToggleKeys.TOGGLE_OPIK_AI_ENABLED,
  );
  const isExportEnabled = useIsFeatureEnabled(FeatureToggleKeys.EXPORT_ENABLED);

  const {
    permissions: { canDeleteTraces },
  } = usePermissions();

  const { toast } = useToast();
  const { mutate } = useTraceDeleteMutation();

  const hasThread = Boolean(setThreadId && threadId);

  useHotkeys(
    "j",
    () =>
      horizontalNavigation?.hasPrevious && horizontalNavigation.onChange(-1),
    { enabled: Boolean(horizontalNavigation) },
    [horizontalNavigation],
  );
  useHotkeys(
    "k",
    () => horizontalNavigation?.hasNext && horizontalNavigation.onChange(1),
    { enabled: Boolean(horizontalNavigation) },
    [horizontalNavigation],
  );

  const handleTraceDelete = useCallback(() => {
    onDelete();
    mutate({ traceId, projectId });
  }, [onDelete, mutate, traceId, projectId]);

  const getDataToExport = useCallback(
    (treeData: Array<Trace | Span>) => {
      let dataToExport: Array<Trace | Span>;
      let entityType: string;
      let entityId: string;

      const collectDescendants = (
        parentId: string,
        items: Array<Trace | Span>,
      ): Array<Span> => {
        const directChildren = items.filter(
          (item): item is Span =>
            "parent_span_id" in item && item.parent_span_id === parentId,
        );
        const allDescendants: Array<Span> = [...directChildren];
        directChildren.forEach((child) => {
          allDescendants.push(...collectDescendants(child.id, items));
        });
        return allDescendants;
      };

      if (spanId) {
        const span = treeData.find((item) => item.id === spanId);
        if (span) {
          const descendants = collectDescendants(spanId, treeData);
          dataToExport = [span, ...descendants];
        } else {
          dataToExport = [];
        }
        entityType = TRACE_DATA_TYPE.spans;
        entityId = spanId;
      } else {
        const trace = treeData.find((item) => item.id === traceId);
        const allSpans = treeData.filter(
          (item): item is Span =>
            "trace_id" in item && item.trace_id === traceId,
        );
        dataToExport = trace ? [trace, ...allSpans] : [];
        entityType = TRACE_DATA_TYPE.traces;
        entityId = traceId;
      }

      return { dataToExport, entityType, entityId };
    },
    [spanId, traceId],
  );

  const exportColumns = useMemo(() => {
    const feedbackScoreNames = uniq(
      treeData.reduce<string[]>((acc, d) => {
        return acc.concat(
          isArray(d.feedback_scores)
            ? d.feedback_scores.map(
                (score) => `${COLUMN_FEEDBACK_SCORES_ID}.${score.name}`,
              )
            : [],
        );
      }, []),
    );
    return [...TRACE_EXPORT_COLUMNS, ...feedbackScoreNames];
  }, [treeData]);

  const handleExportCSV = useCallback(async () => {
    try {
      const { dataToExport, entityType, entityId } = getDataToExport(treeData);
      const mappedData = await mapRowDataForExport(dataToExport, exportColumns);
      const csv = json2csv(mappedData);
      const fileSuffix =
        entityType === TRACE_DATA_TYPE.spans ? "span" : "trace";
      const fileName = `${entityId}-${fileSuffix}.csv`;
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      FileSaver.saveAs(blob, fileName);
      toast({
        title: "Export successful",
        description: `Exported ${fileSuffix} to CSV`,
      });
    } catch (error) {
      toast({
        title: "Export failed",
        description: get(error, "message", "Failed to export"),
        variant: "destructive",
      });
    }
  }, [treeData, exportColumns, getDataToExport, toast]);

  const handleExportJSON = useCallback(async () => {
    try {
      const { dataToExport, entityType, entityId } = getDataToExport(treeData);
      const mappedData = await mapRowDataForExport(dataToExport, exportColumns);
      const fileSuffix =
        entityType === TRACE_DATA_TYPE.spans ? "span" : "trace";
      const fileName = `${entityId}-${fileSuffix}.json`;
      const blob = new Blob([JSON.stringify(mappedData, null, 2)], {
        type: "application/json;charset=utf-8",
      });
      FileSaver.saveAs(blob, fileName);
      toast({
        title: "Export successful",
        description: `Exported ${fileSuffix} to JSON`,
      });
    } catch (error) {
      toast({
        title: "Export failed",
        description: get(error, "message", "Failed to export"),
        variant: "destructive",
      });
    }
  }, [treeData, exportColumns, getDataToExport, toast]);

  return (
    <div className="flex flex-auto items-center justify-between">
      <div className="flex items-center gap-1 overflow-hidden">
        <TooltipWrapper content="Close panel">
          <Button variant="ghost" size="icon-2xs" onClick={onClose}>
            <ChevronsRight />
          </Button>
        </TooltipWrapper>
        {traceType && <BaseTraceDataTypeIcon type={traceType} />}
        <span className="comet-body-s-accented truncate">{traceName}</span>
      </div>

      <div className="flex shrink-0 items-center gap-2 pl-4">
        {isAIInspectorEnabled && (
          <TooltipWrapper content="Debug your trace with AI assistance (OpikAssist)">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setActiveSection(DetailsActionSection.AIAssistants)
              }
            >
              <Sparkles className="size-3.5 shrink-0" />
              <span className="ml-1.5">Improve with Ollie</span>
            </Button>
          </TooltipWrapper>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon-sm">
              <span className="sr-only">Actions menu</span>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem
              onClick={() => {
                toast({ description: "URL copied to clipboard" });
                copy(window.location.href);
              }}
            >
              <Share className="mr-2 size-4" />
              Share
            </DropdownMenuItem>
            <TooltipWrapper content={traceId} side="left">
              <DropdownMenuItem
                onClick={() => {
                  toast({ description: "Trace ID copied to clipboard" });
                  copy(traceId);
                }}
              >
                <Copy className="mr-2 size-4" />
                Copy trace ID
              </DropdownMenuItem>
            </TooltipWrapper>
            {spanId && (
              <TooltipWrapper content={spanId} side="left">
                <DropdownMenuItem
                  onClick={() => {
                    toast({ description: "Span ID copied to clipboard" });
                    copy(spanId);
                  }}
                >
                  <Copy className="mr-2 size-4" />
                  Copy span ID
                </DropdownMenuItem>
              </TooltipWrapper>
            )}
            <DropdownMenuSeparator />
            {!isExportEnabled ? (
              <TooltipWrapper
                content="Export functionality is disabled for this installation"
                side="left"
              >
                <div>
                  <DropdownMenuItem
                    onClick={handleExportCSV}
                    disabled={!isExportEnabled}
                  >
                    <Download className="mr-2 size-4" />
                    Export as CSV
                  </DropdownMenuItem>
                </div>
              </TooltipWrapper>
            ) : (
              <DropdownMenuItem onClick={handleExportCSV}>
                <Download className="mr-2 size-4" />
                Export as CSV
              </DropdownMenuItem>
            )}
            {!isExportEnabled ? (
              <TooltipWrapper
                content="Export functionality is disabled for this installation"
                side="left"
              >
                <div>
                  <DropdownMenuItem
                    onClick={handleExportJSON}
                    disabled={!isExportEnabled}
                  >
                    <Download className="mr-2 size-4" />
                    Export as JSON
                  </DropdownMenuItem>
                </div>
              </TooltipWrapper>
            ) : (
              <DropdownMenuItem onClick={handleExportJSON}>
                <Download className="mr-2 size-4" />
                Export as JSON
              </DropdownMenuItem>
            )}
            {canDeleteTraces && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setPopupOpen(true)}
                  variant="destructive"
                >
                  <Trash className="mr-2 size-4" />
                  Delete trace
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {canDeleteTraces && (
          <ConfirmDialog
            open={popupOpen}
            setOpen={setPopupOpen}
            onConfirm={handleTraceDelete}
            title="Delete trace"
            description="Deleting a trace will also remove the trace data from related experiment samples. This action can't be undone. Are you sure you want to continue?"
            confirmText="Delete trace"
            confirmButtonVariant="destructive"
          />
        )}

        {horizontalNavigation && (
          <>
            <Separator orientation="vertical" className="mx-1 h-4" />
            <Button
              variant="outline"
              size="sm"
              disabled={!horizontalNavigation.hasPrevious}
              onClick={() => horizontalNavigation.onChange(-1)}
              className="gap-2"
            >
              Previous
              <kbd className="flex h-5 min-w-5 items-center justify-center rounded-sm border px-1 text-xs text-muted-foreground">
                J
              </kbd>
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!horizontalNavigation.hasNext}
              onClick={() => horizontalNavigation.onChange(1)}
              className="gap-2"
            >
              Next
              <kbd className="flex h-5 min-w-5 items-center justify-center rounded-sm border px-1 text-xs text-muted-foreground">
                K
              </kbd>
            </Button>
          </>
        )}

        {hasThread && (
          <TooltipWrapper content="Go to thread">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setThreadId!(threadId)}
            >
              Thread
              <ExternalLink className="ml-1 size-3.5" />
            </Button>
          </TooltipWrapper>
        )}
      </div>
    </div>
  );
};

export default TraceDetailsActionsPanel;
