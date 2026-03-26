import React, { useMemo, useState } from "react";
import { CellContext } from "@tanstack/react-table";

import { cn } from "@/lib/utils";
import { ROW_HEIGHT } from "@/types/shared";
import ColoredTag from "@/shared/ColoredTag/ColoredTag";
import CellWrapper from "@/shared/DataTableCells/CellWrapper";
import TooltipWrapper from "@/shared/TooltipWrapper/TooltipWrapper";
import TagListTooltipContent from "@/shared/TagListTooltipContent/TagListTooltipContent";
import ChildrenWidthMeasurer from "@/shared/ChildrenWidthMeasurer/ChildrenWidthMeasurer";
import { useVisibleItemsByWidth } from "@/hooks/useVisibleItemsByWidth";

const LIST_CELL_CONFIG = { itemGap: 4 };

const ListCell = (context: CellContext<unknown, unknown>) => {
  const items = context.getValue() as string[];

  const isSmall =
    (context.table.options.meta?.rowHeight ?? ROW_HEIGHT.small) ===
    ROW_HEIGHT.small;

  const isEmpty = !Array.isArray(items) || items.length === 0;
  const sortedList = useMemo(
    () => (isEmpty ? [] : [...items].sort()),
    [items, isEmpty],
  );

  const [expanded, setExpanded] = useState(false);

  const { cellRef, visibleItems, hasHiddenItems, remainingCount, onMeasure } =
    useVisibleItemsByWidth(sortedList, LIST_CELL_CONFIG);

  if (isEmpty) {
    return null;
  }

  const displayedItems = expanded ? sortedList : visibleItems;

  return (
    <CellWrapper
      metadata={context.column.columnDef.meta}
      tableMetadata={context.table.options.meta}
      className={cn(isSmall && "py-0", expanded && "overflow-auto")}
    >
      <div ref={cellRef} className="w-full min-w-0 flex-1 overflow-hidden">
        <div
          className={cn(
            "flex flex-row items-start gap-1",
            expanded
              ? "flex-wrap"
              : isSmall
                ? "max-h-full overflow-x-hidden"
                : "max-h-full flex-wrap overflow-auto",
          )}
        >
          {!expanded && (
            <ChildrenWidthMeasurer onMeasure={onMeasure}>
              {sortedList.map((item) => (
                <div key={item}>
                  <ColoredTag
                    label={item}
                    variant="primary"
                    className="shrink-0"
                    size={isSmall ? "sm" : "md"}
                  />
                </div>
              ))}
            </ChildrenWidthMeasurer>
          )}
          {displayedItems.map((item) => (
            <ColoredTag
              key={item}
              label={item}
              variant="primary"
              className="min-w-0 max-w-full"
              size={isSmall ? "sm" : "md"}
            />
          ))}
          {hasHiddenItems && !expanded && (
            <TooltipWrapper
              content={
                <TagListTooltipContent
                  tags={sortedList}
                  variant="primary"
                  hint="Click to show all"
                />
              }
            >
              <div
                className={cn(
                  "flex cursor-pointer items-center rounded-sm text-primary-hover hover:underline",
                  isSmall
                    ? "comet-body-xs h-4 px-2"
                    : "comet-body-s h-6 rounded-md px-1.5",
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded(true);
                }}
              >
                +{remainingCount}
              </div>
            </TooltipWrapper>
          )}
        </div>
      </div>
    </CellWrapper>
  );
};

export default ListCell;
