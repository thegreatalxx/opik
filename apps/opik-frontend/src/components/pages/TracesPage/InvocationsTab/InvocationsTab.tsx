import React, { useMemo } from "react";
import useLocalRunnersList from "@/api/local-runners/useLocalRunnersList";
import { LocalRunnerStatus } from "@/types/local-runners";
import AgentCard from "./AgentCard";

type InvocationsTabProps = {
  projectId: string;
  projectName: string;
};

const InvocationsTab: React.FC<InvocationsTabProps> = ({
  projectId,
  projectName,
}) => {
  const { data: runnersData } = useLocalRunnersList({
    refetchInterval: 30000,
  });

  const runners = useMemo(() => {
    return runnersData?.content || [];
  }, [runnersData]);

  const connectedRunners = useMemo(() => {
    return runners.filter((r) => r.status === LocalRunnerStatus.CONNECTED);
  }, [runners]);

  const agents = useMemo(() => {
    return connectedRunners.flatMap((r) =>
      r.agents.filter((a) => a.project === projectName),
    );
  }, [connectedRunners, projectName]);

  if (runners.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12">
        <p className="comet-body-s text-muted-slate">
          Connect a runner to execute agents for this project.
        </p>
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12">
        <p className="comet-body-s text-muted-slate">
          No agents registered for this project.
        </p>
      </div>
    );
  }

  return (
    <div className="px-6 py-4">
      <h2 className="comet-body-s mb-4 text-muted-foreground">
        Agents registered for this project
      </h2>
      <div className="flex flex-col gap-4">
        {agents.map((agent) => (
          <AgentCard
            key={agent.name}
            agent={agent}
            projectName={projectName}
          />
        ))}
      </div>
    </div>
  );
};

export default InvocationsTab;
