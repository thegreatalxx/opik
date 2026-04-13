import { useCallback, useMemo, useState } from "react";

export type FieldsCollapseController = {
  isExpanded: (key: string) => boolean;
  toggle: (key: string) => void;
  expandAll: () => void;
  collapseAll: () => void;
  allExpanded: boolean;
};

type UseFieldsCollapseOptions = {
  collapsibleKeys: string[];
  defaultExpanded?: boolean;
};

export const useFieldsCollapse = ({
  collapsibleKeys,
  defaultExpanded = false,
}: UseFieldsCollapseOptions): FieldsCollapseController => {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() =>
    defaultExpanded ? new Set(collapsibleKeys) : new Set(),
  );

  const isExpanded = useCallback(
    (key: string) => expandedKeys.has(key),
    [expandedKeys],
  );

  const toggle = useCallback((key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setExpandedKeys(new Set(collapsibleKeys));
  }, [collapsibleKeys]);

  const collapseAll = useCallback(() => {
    setExpandedKeys(new Set());
  }, []);

  const allExpanded = useMemo(
    () =>
      collapsibleKeys.length > 0 &&
      collapsibleKeys.every((k) => expandedKeys.has(k)),
    [collapsibleKeys, expandedKeys],
  );

  return { isExpanded, toggle, expandAll, collapseAll, allExpanded };
};
