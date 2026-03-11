import React, { useCallback, useState } from "react";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LocalRunnerAgent } from "@/types/local-runners";
import useCreateLocalRunnerJob from "@/api/local-runners/useCreateLocalRunnerJob";

type AgentCardProps = {
  agent: LocalRunnerAgent;
  projectName: string;
};

const AgentCard: React.FC<AgentCardProps> = ({ agent, projectName }) => {
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const createJob = useCreateLocalRunnerJob();

  const paramsSignature = agent.params
    .map((p) => `${p.name}: ${p.type}`)
    .join(", ");

  const handleInputChange = useCallback((paramName: string, value: string) => {
    setInputs((prev) => ({ ...prev, [paramName]: value }));
  }, []);

  const handleRun = useCallback(() => {
    createJob.mutate(
      {
        agent_name: agent.name,
        inputs,
        project: projectName,
      },
      {
        onSuccess: () => {
          setInputs({});
        },
      },
    );
  }, [agent.name, inputs, projectName, createJob]);

  return (
    <div className="rounded-lg border">
      <div className="flex flex-col gap-2 p-4">
        <div className="comet-title-s flex items-center gap-2">
          <span>🤖</span>
          <span>
            {agent.name}{" "}
            <span className="font-normal text-muted-foreground">
              ({paramsSignature})
            </span>
          </span>
        </div>
        <div className="comet-body-xs flex gap-4 text-muted-foreground">
          <span>
            <span className="text-foreground">Source</span>{" "}
            {agent.source_file}
          </span>
          <span>
            <span className="text-foreground">Interpreter</span>{" "}
            {agent.executable}
          </span>
        </div>
        <p className="comet-body-s text-muted-foreground">
          {agent.description}
        </p>
      </div>
      <div className="border-t px-4 py-3">
        <h4 className="comet-body-xs mb-2 font-semibold uppercase tracking-wide text-primary">
          Parameters
        </h4>
        {agent.params.map((param) => (
          <div key={param.name} className="mb-1">
            <span className="comet-body-s font-medium">{param.name}</span>
            {" : "}
            <span className="comet-body-s italic text-muted-foreground">
              {param.type}
            </span>
            <p className="comet-body-xs text-muted-foreground">
              No description available.
            </p>
          </div>
        ))}
      </div>
      <div className="border-t px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="comet-body-s text-muted-foreground">Invoke</span>
          <Button
            size="sm"
            onClick={handleRun}
            disabled={createJob.isPending}
          >
            <Play className="mr-1.5 size-3" />
            {createJob.isPending ? "Running..." : "Run"}
          </Button>
        </div>
        <div className="mt-3 flex flex-col gap-2">
          {agent.params.map((param) => (
            <div key={param.name} className="flex items-center gap-3">
              <div className="flex w-36 shrink-0 items-center gap-2">
                <span className="comet-body-s font-medium">{param.name}</span>
                <span className="comet-body-xs rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                  {param.type}
                </span>
              </div>
              <Input
                placeholder={`Enter ${param.type} value...`}
                value={inputs[param.name] ?? ""}
                onChange={(e) => handleInputChange(param.name, e.target.value)}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AgentCard;
