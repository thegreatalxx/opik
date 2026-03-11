import useLocalRunnerJobLogs from "@/api/local-runners/useLocalRunnerJobLogs";
import { LocalRunnerJobStatus } from "@/types/local-runners";
import { cn } from "@/lib/utils";

interface JobLogsPanelProps {
  jobId: string;
  status: LocalRunnerJobStatus;
}

const JobLogsPanel: React.FC<JobLogsPanelProps> = ({ jobId, status }) => {
  const isActive =
    status === LocalRunnerJobStatus.RUNNING ||
    status === LocalRunnerJobStatus.PENDING;

  const { data: logs } = useLocalRunnerJobLogs(
    { jobId },
    { refetchInterval: isActive ? 5000 : false },
  );

  if (!logs || logs.length === 0) {
    return (
      <div className="px-4 py-3 text-xs text-muted-slate">
        No logs available.
      </div>
    );
  }

  return (
    <div className="max-h-48 overflow-y-auto bg-[#1e1e1e] px-4 py-2 font-mono text-xs leading-5">
      {logs.map((entry, i) => (
        <div key={i} className="whitespace-pre-wrap break-all">
          <span
            className={cn(
              entry.stream === "stderr" ? "text-red-400" : "text-gray-300",
            )}
          >
            {entry.text}
          </span>
        </div>
      ))}
    </div>
  );
};

export default JobLogsPanel;
