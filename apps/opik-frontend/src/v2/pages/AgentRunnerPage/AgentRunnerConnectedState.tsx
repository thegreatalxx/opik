import React, { useState } from "react";
import { Settings2 } from "lucide-react";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/ui/tabs";
import useConfigHistoryListInfinite from "@/api/agent-configs/useConfigHistoryListInfinite";
import { LocalRunner } from "@/types/agent-sandbox";
import AgentRunnerInputForm from "./AgentRunnerInputForm";

type AgentRunnerConnectedStateProps = {
  projectId: string;
  runner: LocalRunner;
  onRun: (inputs: Record<string, unknown>, maskId?: string) => void;
  isRunning: boolean;
  result: React.ReactNode;
};

const AgentRunnerConnectedState: React.FC<AgentRunnerConnectedStateProps> = ({
  projectId,
  runner,
  onRun,
  isRunning,
  result,
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
        <div className="border-b px-6">
          <TabsList variant="underline">
            <TabsTrigger value="input" variant="underline">
              Input
            </TabsTrigger>
            <TabsTrigger value="configuration" variant="underline">
              Configuration
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="input" className="flex-1 p-6">
          <AgentRunnerInputForm
            fields={inputFields}
            onSubmit={onRun}
            isRunning={isRunning}
          />
        </TabsContent>

        <TabsContent value="configuration" className="flex-1 p-6">
          {latestConfig ? (
            <div className="flex items-center gap-2">
              <Settings2 className="size-3.5 text-muted-slate" />
              <span className="comet-body-xs text-muted-slate">
                Configuration: {configVersionLabel}
              </span>
            </div>
          ) : (
            <p className="comet-body-s text-muted-slate">
              No agent configuration found for this project.
            </p>
          )}
        </TabsContent>
      </Tabs>

      {/* Result section */}
      <div className="border-t p-6">{result}</div>
    </div>
  );
};

export default AgentRunnerConnectedState;
