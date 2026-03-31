import React, { useMemo } from "react";
import isObject from "lodash/isObject";
import { CellContext } from "@tanstack/react-table";
import { ROW_HEIGHT } from "@/types/shared";
import CellWrapper from "@/shared/DataTableCells/CellWrapper";
import CellTooltipWrapper from "@/shared/DataTableCells/CellTooltipWrapper";
import LinkifyText from "@/shared/LinkifyText/LinkifyText";
import { prettifyMessage } from "@/lib/traces";
import { cn } from "@/lib/utils";
import useLocalStorageState from "use-local-storage-state";
import { useTruncationEnabled } from "@/contexts/server-sync-provider";

type CustomMeta = {
  fieldType: "input" | "output";
  colorIndicator?: boolean;
};

const MAX_DATA_LENGTH_KEY = "pretty-cell-data-length-limit";
const MAX_DATA_LENGTH = 10000;

const PrettyCell = <TData,>(context: CellContext<TData, string | object>) => {
  const truncationEnabled = useTruncationEnabled();
  const [maxDataLength] = useLocalStorageState(MAX_DATA_LENGTH_KEY, {
    defaultValue: MAX_DATA_LENGTH,
  });
  const { custom } = context.column.columnDef.meta ?? {};
  const { fieldType = "input", colorIndicator = false } = (custom ??
    {}) as CustomMeta;
  const value = context.getValue() as string | object | undefined | null;

  const { displayMessage, isMonospace } = useMemo(() => {
    if (!value) return { displayMessage: "-", isMonospace: false };

    const pretty = prettifyMessage(value, { type: fieldType });

    let message: string;
    let mono: boolean;
    if (isObject(pretty.message)) {
      message = JSON.stringify(value, null, 2);
      mono = true;
    } else {
      message = pretty.message || "";
      mono = !pretty.prettified;
    }

    if (truncationEnabled && message.length > maxDataLength) {
      return {
        displayMessage: message.slice(0, maxDataLength) + " [truncated]",
        isMonospace: mono,
      };
    }

    return { displayMessage: message, isMonospace: mono };
  }, [value, fieldType, truncationEnabled, maxDataLength]);

  const rowHeight =
    context.column.columnDef.meta?.overrideRowHeight ??
    context.table.options.meta?.rowHeight ??
    ROW_HEIGHT.small;

  const isTruncated = rowHeight !== ROW_HEIGHT.large;

  const content = useMemo(() => {
    if (isTruncated) {
      return (
        <CellTooltipWrapper content={displayMessage}>
          <span className={cn(isMonospace && "comet-code", "truncate")}>
            <LinkifyText>{displayMessage}</LinkifyText>
          </span>
        </CellTooltipWrapper>
      );
    }

    return (
      <div className={cn(isMonospace && "comet-code", "size-full overflow-y-auto whitespace-pre-wrap break-words")}>
        <LinkifyText>{displayMessage}</LinkifyText>
      </div>
    );
  }, [isTruncated, displayMessage, isMonospace]);

  const indicatorColor = colorIndicator
    ? fieldType === "input"
      ? "var(--color-green)"
      : "var(--color-primary)"
    : null;

  return (
    <CellWrapper
      metadata={context.column.columnDef.meta}
      tableMetadata={context.table.options.meta}
    >
      {indicatorColor && (
        <div
          className="mr-2 shrink-0 self-stretch rounded-full"
          style={{ width: 3, backgroundColor: indicatorColor }}
        />
      )}
      {content}
    </CellWrapper>
  );
};

export default PrettyCell;
