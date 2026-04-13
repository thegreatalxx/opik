import React, { useMemo, useState } from "react";
import { StringParam, useQueryParam } from "use-query-params";

import { useActiveProjectId } from "@/store/AppStore";
import Loader from "@/shared/Loader/Loader";
import PageBodyScrollContainer from "@/v2/layout/PageBodyScrollContainer/PageBodyScrollContainer";
import useConfigHistoryListInfinite from "@/api/agent-configs/useConfigHistoryListInfinite";
import { ConfigHistoryItem } from "@/types/agent-configs";
import AgentConfigurationHistoryTimeline from "@/v2/pages/AgentConfigurationPage/AgentConfigurationTab/AgentConfigurationHistoryTimeline";
import AgentConfigurationDetailView from "@/v2/pages/AgentConfigurationPage/AgentConfigurationTab/AgentConfigurationDetailView";
import AgentConfigurationEditView from "@/v2/pages-shared/agent-configuration/AgentConfigurationEditView";
import AgentConfigurationEmptyState from "@/v2/pages/AgentConfigurationPage/AgentConfigurationEmptyState";

const AgentConfigurationPage = () => {
  const projectId = useActiveProjectId()!;
  const [selectedId, setSelectedId] = useQueryParam("configId", StringParam, {
    updateType: "replaceIn",
  });
  const [editItem, setEditItem] = useState<ConfigHistoryItem | null>(null);

  const { data, isPending, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useConfigHistoryListInfinite({ projectId });

  const allRows = useMemo(
    () => data?.pages.flatMap((p) => p.content) ?? [],
    [data],
  );

  const selectedIndex = useMemo(() => {
    if (!selectedId) return 0;
    const idx = allRows.findIndex((r) => r.id === selectedId);
    return idx >= 0 ? idx : 0;
  }, [allRows, selectedId]);

  if (isPending) {
    return <Loader />;
  }

  const isEmpty = allRows.length === 0;
  const selectedItem = allRows[selectedIndex] as ConfigHistoryItem;

  if (editItem) {
    return (
      <div className="w-full p-4">
        <AgentConfigurationEditView
          item={editItem}
          projectId={projectId}
          onSaved={() => {
            setSelectedId(undefined);
            setEditItem(null);
          }}
        />
      </div>
    );
  }

  return (
    <PageBodyScrollContainer>
      <div className="flex min-h-full flex-col pt-4">
        <div className="mb-1 flex min-h-7 items-center px-6">
          <h1 className="comet-title-xs truncate break-words">
            Agent configuration
          </h1>
        </div>
        {isEmpty ? (
          <AgentConfigurationEmptyState />
        ) : (
          <div className="flex gap-0">
            <div className="w-[50vw] min-w-0 flex-1 [overflow-anchor:none]">
              {selectedItem ? (
                <AgentConfigurationDetailView
                  item={selectedItem}
                  projectId={projectId}
                  versions={allRows}
                  onEdit={() => setEditItem(allRows[0])}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-slate">
                  Select a version to view its configuration
                </div>
              )}
            </div>
            <div className="w-[25vw] shrink-0 pr-2">
              <AgentConfigurationHistoryTimeline
                items={allRows}
                selectedIndex={selectedIndex}
                onSelect={(index) =>
                  setSelectedId(allRows[index]?.id ?? undefined)
                }
                hasNextPage={hasNextPage}
                isFetchingNextPage={isFetchingNextPage}
                onLoadMore={fetchNextPage}
              />
            </div>
          </div>
        )}
      </div>
    </PageBodyScrollContainer>
  );
};

export default AgentConfigurationPage;
