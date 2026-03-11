import { CellContext } from "@tanstack/react-table";
import { Terminal } from "lucide-react";
import CellWrapper from "@/components/shared/DataTableCells/CellWrapper";
import CellTooltipWrapper from "@/components/shared/DataTableCells/CellTooltipWrapper";
import { ProjectWithStatistic } from "@/types/projects";

const OLLIE_ASSIST_PROJECT_NAME = "Ollie Assist";

const ProjectNameCell = (
  context: CellContext<ProjectWithStatistic, string>,
) => {
  const value = context.getValue();
  const isOllie = value === OLLIE_ASSIST_PROJECT_NAME;

  return (
    <CellWrapper
      metadata={context.column.columnDef.meta}
      tableMetadata={context.table.options.meta}
    >
      <CellTooltipWrapper content={value}>
        <span className="flex items-center gap-1.5 truncate">
          {isOllie && (
            <Terminal className="size-3.5 shrink-0 text-primary" />
          )}
          <span className={isOllie ? "font-semibold text-primary" : ""}>
            {value}
          </span>
        </span>
      </CellTooltipWrapper>
    </CellWrapper>
  );
};

export default ProjectNameCell;
