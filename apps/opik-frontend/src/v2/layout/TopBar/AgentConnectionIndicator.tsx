import React from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useActiveWorkspaceName } from "@/store/AppStore";
import useSandboxConnectionStatus from "@/api/agent-sandbox/useSandboxConnectionStatus";
import { RunnerConnectionStatus } from "@/types/agent-sandbox";

const AgentConnectionIndicator: React.FC = () => {
  const workspaceName = useActiveWorkspaceName();

  const projectId = useRouterState({
    select: (state) => {
      const match = state.matches.find((m) => "projectId" in m.params);
      return (match?.params as { projectId?: string })?.projectId;
    },
  });

  const { data: runner, isLoading } = useSandboxConnectionStatus(
    { projectId: projectId! },
    { enabled: !!projectId },
  );

  if (
    !projectId ||
    isLoading ||
    runner?.status === RunnerConnectionStatus.CONNECTED
  ) {
    return null;
  }

  return (
    <Link
      to="/$workspaceName/projects/$projectId/agent-runner"
      params={{ workspaceName, projectId }}
      className="comet-body-xs flex items-center gap-1.5 text-rose-500 hover:underline"
    >
      <span className="size-1.5 rounded-full bg-rose-500" />
      Agent disconnected
    </Link>
  );
};

export default AgentConnectionIndicator;
