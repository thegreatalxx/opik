import React, { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/ui/dropdown-menu";
import { Button } from "@/ui/button";
import useConfigHistoryListInfinite from "@/api/agent-configs/useConfigHistoryListInfinite";
import { LocalRunner } from "@/types/agent-sandbox";
import AgentRunnerInputForm from "./AgentRunnerInputForm";
import AgentConfigurationEditView from "@/v2/pages-shared/agent-configuration/AgentConfigurationEditView";

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
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null);

  const { data: configData } = useConfigHistoryListInfinite({ projectId });

  const allVersions = useMemo(
    () => configData?.pages?.flatMap((p) => p.content) ?? [],
    [configData],
  );

  const selectedConfig = useMemo(() => {
    if (selectedConfigId) {
      return (
        allVersions.find((v) => v.id === selectedConfigId) ??
        allVersions[0] ??
        null
      );
    }
    return allVersions[0] ?? null;
  }, [allVersions, selectedConfigId]);

  const versionLabel = selectedConfig
    ? `Configuration: ${selectedConfig.name}${
        selectedConfig.tags?.length ? ` (${selectedConfig.tags[0]})` : ""
      }`
    : "No configuration";

  const agent = runner.agents?.[0];
  const inputFields = agent?.params ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex min-h-0 flex-1 flex-col"
      >
        <TabsList variant="underline" className="shrink-0 px-4">
          <TabsTrigger value="input" variant="underline">
            Input
          </TabsTrigger>
          <TabsTrigger value="configuration" variant="underline">
            Configuration
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="input"
          className="mt-0 min-h-0 flex-1 overflow-y-auto p-4"
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
          className="mt-0 min-h-0 flex-1 overflow-y-auto p-4"
          forceMount
          hidden={activeTab !== "configuration"}
        >
          {selectedConfig ? (
            <AgentConfigurationEditView
              item={selectedConfig}
              projectId={projectId}
              onSaved={() => {}}
              headerLeft={
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="2xs" className="gap-1">
                      {versionLabel}
                      <ChevronDown className="size-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {allVersions.map((v) => (
                      <DropdownMenuItem
                        key={v.id}
                        onClick={() => setSelectedConfigId(v.id)}
                      >
                        {v.name}
                        {v.tags?.length > 0 && (
                          <span className="ml-2 text-muted-slate">
                            {v.tags.join(" · ")}
                          </span>
                        )}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              }
            />
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
