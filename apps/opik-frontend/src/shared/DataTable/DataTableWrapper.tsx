import React, { useCallback } from "react";

export type DataTableWrapperProps = {
  children: React.ReactNode;
};

const DataTableWrapper: React.FC<DataTableWrapperProps> = ({ children }) => {
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    target.toggleAttribute("data-scrolled-right", target.scrollLeft > 0);
  }, []);

  return (
    <div
      className="overflow-x-auto overflow-y-hidden rounded-md border"
      onScroll={handleScroll}
    >
      {children}
    </div>
  );
};

export default DataTableWrapper;
