import React, { useState } from "react";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/ui/tabs";
import useConfigHistoryListInfinite from "@/api/agent-configs/useConfigHistoryListInfinite";
import { LocalRunner } from "@/types/agent-sandbox";
import AgentRunnerInputForm from "./AgentRunnerInputForm";
import AgentRunnerConfigEditor from "./AgentRunnerConfigEditor";

type AgentRunnerConnectedStateProps = {
  projectId: string;
  runner: LocalRunner;
  onRun: (inputs: Record<string, unknown>, maskId?: string) => void;
  isRunning: boolean;
};

const AgentRunnerConnectedState: React.FC<AgentRunnerConnectedStateProps> = ({
  projectId,
  runner,
  onRun,
  isRunning,
}) => {
  const [activeTab, setActiveTab] = useState("input");

  const { data: configData } = useConfigHistoryListInfinite({ projectId });
  const latestConfig = configData?.pages?.[0]?.content?.[0];
  const configVersionLabel = latestConfig?.name;

  const agent = runner.agents?.[0];
  const inputFields = agent?.params ?? [];

  return (
    <div className="flex flex-1 flex-col">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList variant="underline" className="px-4">
          <TabsTrigger value="input" variant="underline">
            Input
          </TabsTrigger>
          <TabsTrigger value="configuration" variant="underline">
            Configuration
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="input"
          className="flex-1 px-4"
          forceMount
          hidden={activeTab !== "input"}
        >
          <AgentRunnerInputForm
            fields={inputFields}
            onSubmit={onRun}
            isRunning={isRunning}
          />
        </TabsContent>

        <TabsContent
          value="configuration"
          className="flex-1 px-4"
          forceMount
          hidden={activeTab !== "configuration"}
        >
          {latestConfig ? (
            <div>
              <div className="mb-4">
                <span className="comet-body-xs text-muted-slate">
                  Configuration: {configVersionLabel} (Prod)
                </span>
              </div>
              <AgentRunnerConfigEditor
                item={latestConfig}
                projectId={projectId}
                onClose={() => setActiveTab("input")}
              />
            </div>
          ) : (
            <p className="comet-body-s text-muted-slate">
              No agent configuration found for this project.
            </p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AgentRunnerConnectedState;
