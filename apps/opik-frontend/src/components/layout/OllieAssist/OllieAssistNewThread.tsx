import React, { useState, useMemo } from "react";
import { Search, Loader2 } from "lucide-react";
import useOllieAssistStore from "./OllieAssistStore";
import {
  useThreadsList,
  ThreadSummary,
  extractThreadTitle,
  fetchThread,
} from "./useThreads";

const formatRelativeTime = (iso: string | null): string => {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
};

const ThreadItem: React.FC<{
  thread: ThreadSummary;
  loading: boolean;
  onSelect: (thread: ThreadSummary) => void;
}> = ({ thread, loading, onSelect }) => (
  <button
    className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left transition-colors hover:bg-muted/50"
    onClick={() => onSelect(thread)}
    disabled={loading}
  >
    <div className="min-w-0 flex-1">
      <div className="truncate text-sm text-foreground">
        {extractThreadTitle(thread)}
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground">
        {thread.message_count} messages
      </div>
    </div>
    {loading ? (
      <Loader2 className="ml-2 size-3 shrink-0 animate-spin text-muted-foreground" />
    ) : (
      <span className="ml-2 shrink-0 text-[10px] text-muted-foreground">
        {formatRelativeTime(thread.updated_at ?? thread.created_at)}
      </span>
    )}
  </button>
);

const OllieAssistNewThread: React.FC = () => {
  const [search, setSearch] = useState("");
  const threads = useOllieAssistStore((s) => s.threads);
  const setActiveThread = useOllieAssistStore((s) => s.setActiveThread);
  const loadThread = useOllieAssistStore((s) => s.loadThread);
  const attachToSession = useOllieAssistStore((s) => s.attachToSession);

  const { data: recentData } = useThreadsList(
    { page: 1, size: 20 },
    { staleTime: 10000 },
  );

  const { data: searchData } = useThreadsList(
    { page: 1, size: 20, search },
    { enabled: search.length >= 2, staleTime: 5000 },
  );

  const displayThreads = useMemo(() => {
    const source =
      search.length >= 2 ? searchData?.content : recentData?.content;
    return source ?? [];
  }, [search, searchData, recentData]);

  const handleSelectThread = async (thread: ThreadSummary) => {
    const title = extractThreadTitle(thread);
    try {
      const { messages, isLive } = await fetchThread(thread.id);
      loadThread(thread.id, thread.id, title, messages);
      if (isLive) {
        attachToSession?.(thread.id);
      }
    } catch {
      loadThread(thread.id, thread.id, title, []);
    }
  };

  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-4 py-4">
      <div className="relative mb-4">
        <Search className="absolute left-2.5 top-2 size-3.5 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search threads..."
          className="w-full rounded-md border border-border bg-background py-1.5 pl-8 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
      </div>

      {displayThreads.length > 0 && (
        <div>
          <div className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {search.length >= 2 ? "Search results" : "Recent threads"}
          </div>
          <div className="flex flex-col gap-0.5">
            {displayThreads.map((thread) => (
              <ThreadItem
                key={thread.id}
                thread={thread}
                loading={false}
                onSelect={handleSelectThread}
              />
            ))}
          </div>
        </div>
      )}

      {displayThreads.length === 0 && search.length >= 2 && (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          No threads found
        </div>
      )}

      {displayThreads.length === 0 && search.length < 2 && (
        <div className="flex flex-1 items-center justify-center text-center text-sm text-muted-foreground">
          Type a message below to start a new thread.
        </div>
      )}
    </div>
  );
};

export default OllieAssistNewThread;
