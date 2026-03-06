import React from "react";
import { FileSliders, GitCommitVertical } from "lucide-react";
import { Link } from "@tanstack/react-router";

import { Span, Trace } from "@/types/traces";
import useAgentConfigById from "@/api/agent-configs/useAgentConfigById";
import useConfigVersionMap from "@/api/agent-configs/useConfigVersionMap";
import BlueprintValuesList from "@/components/pages/TracesPage/ConfigurationTab/BlueprintValuesList";
import Loader from "@/components/shared/Loader/Loader";
import { Tag } from "@/components/ui/tag";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import useAppStore from "@/store/AppStore";

type AgentConfigurationMetadata = {
  blueprint_id: string;
};

export const isAgentConfigurationMetadata = (
  value: unknown,
): value is AgentConfigurationMetadata =>
  typeof value === "object" &&
  value !== null &&
  "blueprint_id" in value &&
  typeof (value as AgentConfigurationMetadata).blueprint_id === "string";

type AgentConfigurationTabProps = {
  data: Trace | Span;
  projectId: string;
};

const AgentConfigurationTab: React.FC<AgentConfigurationTabProps> = ({
  data,
  projectId,
}) => {
  const agentConfigMeta = (data.metadata as Record<string, unknown>)
    ?.agent_configuration;
  const blueprintId = isAgentConfigurationMetadata(agentConfigMeta)
    ? agentConfigMeta.blueprint_id
    : undefined;

  const { data: agentConfig, isPending } = useAgentConfigById({
    blueprintId: blueprintId ?? "",
  });

  const versionMap = useConfigVersionMap(projectId);
  const version = blueprintId ? versionMap[blueprintId] : undefined;
  const workspaceName = useAppStore((state) => state.activeWorkspaceName);

  if (isPending) return <Loader />;

  if (!agentConfig?.values?.length) {
    return (
      <p className="comet-body-s py-8 text-center text-muted-slate">
        No configuration values available
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between gap-2 px-1.5">
        <div className="flex gap-2">
          <span className="comet-body-s-accented">Agent configuration</span>
          {version !== undefined && (
            <Tag className="flex items-center gap-1" variant="gray" size="md">
              <GitCommitVertical className="size-3.5 shrink-0" />v{version}
            </Tag>
          )}
        </div>
        {blueprintId && (
          <Link
            to="/$workspaceName/projects/$projectId/traces"
            params={{ workspaceName, projectId }}
            search={{ tab: "configuration", configId: blueprintId }}
          >
            <Button variant="outline" size="2xs">
              <FileSliders className="mr-1 size-3 shrink-0" color="#DB46EF" />
              Go to details
            </Button>
          </Link>
        )}
      </div>
      <Separator />
      <BlueprintValuesList values={agentConfig.values} />
    </div>
  );
};

export default AgentConfigurationTab;
