import React, { useState } from "react";

const MAX_ROWS = 10;

type TableData = {
  columns?: string[];
  rows?: unknown[][];
};

type OllieAssistTableResultProps = {
  data: unknown;
};

const OllieAssistTableResult: React.FC<OllieAssistTableResultProps> = ({
  data,
}) => {
  const [showAll, setShowAll] = useState(false);
  const tableData = data as TableData;

  if (!tableData?.columns || !tableData?.rows) return null;

  const displayRows = showAll
    ? tableData.rows
    : tableData.rows.slice(0, MAX_ROWS);
  const hasMore = tableData.rows.length > MAX_ROWS;

  return (
    <div className="my-1 max-h-64 overflow-auto rounded border">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b bg-muted">
            {tableData.columns.map((col, i) => (
              <th key={i} className="px-2 py-1 text-left font-medium">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {displayRows.map((row, ri) => (
            <tr key={ri} className="border-b last:border-0">
              {row.map((cell, ci) => (
                <td key={ci} className="px-2 py-1 whitespace-nowrap">
                  {String(cell ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {hasMore && !showAll && (
        <button
          className="w-full py-1 text-center text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setShowAll(true)}
        >
          Show all {tableData.rows.length} rows
        </button>
      )}
    </div>
  );
};

export default OllieAssistTableResult;
