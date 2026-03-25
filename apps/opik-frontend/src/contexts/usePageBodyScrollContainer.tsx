import React from "react";

type PageBodyScrollContainerContextData = {
  scrollContainer: HTMLDivElement | null;
  tableOffset: number;
  recalculateOffsets: () => void;
};

const noop = () => {};

export const PageBodyScrollContainerContext =
  React.createContext<PageBodyScrollContainerContextData>({
    scrollContainer: null,
    tableOffset: 0,
    recalculateOffsets: noop,
  });

const usePageBodyScrollContainer = () => {
  const context = React.useContext(PageBodyScrollContainerContext);
  if (context === null) {
    throw new Error(
      "useContainerRef must be used within PageBodyScrollContainer!",
    );
  }
  return context;
};

export default usePageBodyScrollContainer;
