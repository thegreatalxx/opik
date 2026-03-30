import React from "react";
import { Header } from "@tanstack/react-table";
import { cn } from "@/lib/utils";

type DataTableColumnResizerProps<TData> = {
  header: Header<TData, unknown>;
};

const DataTableColumnResizer = <TData,>({
  header,
}: DataTableColumnResizerProps<TData>) => {
  if (
    !header.column.getCanResize() ||
    (!header.isPlaceholder && header.subHeaders.length > 0)
  )
    return null;

  return (
    <div
      {...{
        onMouseDown: header.getResizeHandler(),
        onTouchStart: header.getResizeHandler(),
        style: {
          userSelect: "none",
          touchAction: "none",
        },
      }}
      className={cn(
        "group absolute top-0 h-[var(--data-table-height,56px)] z-[5] flex cursor-ew-resize items-stretch transition-all",
        header.column.getIsLastColumn()
          ? "right-0 w-1 justify-end"
          : "-right-1 w-[9px] justify-center",
      )}
    >
      <div className="absolute inset-y-0 w-px bg-transparent transition-colors group-hover:bg-gray-600 group-active:bg-blue-600"></div>
    </div>
  );
};

export default DataTableColumnResizer;
