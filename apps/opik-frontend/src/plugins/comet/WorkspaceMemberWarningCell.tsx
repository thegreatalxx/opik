import { CellContext } from "@tanstack/react-table";
import { AlertTriangle } from "lucide-react";
import { Tag } from "@/ui/tag";
import CellWrapper from "@/shared/DataTableCells/CellWrapper";
import TooltipWrapper from "@/shared/TooltipWrapper/TooltipWrapper";
import { ROW_HEIGHT } from "@/types/shared";
import { TAG_SIZE_MAP } from "@/constants/shared";
import { WorkspaceMember } from "./types";

const WorkspaceMemberWarningCell = (
  context: CellContext<WorkspaceMember, string>,
) => {
  const row = context.row.original;
  const mismatch = row.permissionMismatch;

  if (!mismatch) {
    return null;
  }

  const rowHeight = context.table.options.meta?.rowHeight ?? ROW_HEIGHT.small;
  const tagSize = TAG_SIZE_MAP[rowHeight];

  return (
    <CellWrapper
      metadata={context.column.columnDef.meta}
      tableMetadata={context.table.options.meta}
    >
      <TooltipWrapper content={mismatch.message}>
        <Tag variant="yellow" size={tagSize}>
          <div className="flex items-center gap-1">
            <AlertTriangle className="size-3 shrink-0" />
            <span className="truncate">Permissions mismatch</span>
          </div>
        </Tag>
      </TooltipWrapper>
    </CellWrapper>
  );
};

export default WorkspaceMemberWarningCell;
