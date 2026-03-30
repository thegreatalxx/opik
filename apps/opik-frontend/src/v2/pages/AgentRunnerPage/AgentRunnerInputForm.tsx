import React from "react";
import { useForm } from "react-hook-form";

import { Input } from "@/ui/input";
import { Textarea } from "@/ui/textarea";
import { Switch } from "@/ui/switch";
import { Label } from "@/ui/label";

type AgentParam = {
  name: string;
  type: string;
};

type AgentRunnerInputFormProps = {
  fields: AgentParam[];
  onSubmit: (inputs: Record<string, unknown>, maskId?: string) => void;
  isRunning: boolean;
};

const AgentRunnerInputForm: React.FC<AgentRunnerInputFormProps> = ({
  fields,
  onSubmit,
  isRunning,
}) => {
  const { register, handleSubmit, setValue, watch } = useForm({
    defaultValues: fields.reduce(
      (acc, field) => {
        acc[field.name] = "";
        return acc;
      },
      {} as Record<string, string>,
    ),
  });

  const onFormSubmit = handleSubmit((data) => {
    const inputs: Record<string, unknown> = {};
    for (const field of fields) {
      const value = data[field.name];
      if (field.type === "integer" || field.type === "int") {
        inputs[field.name] = parseInt(value, 10);
      } else if (field.type === "float" || field.type === "double") {
        inputs[field.name] = parseFloat(value);
      } else if (field.type === "boolean") {
        inputs[field.name] = value === "true";
      } else {
        inputs[field.name] = value;
      }
    }
    onSubmit(inputs);
  });

  return (
    <form id="agent-runner-form" onSubmit={onFormSubmit}>
      {fields.length === 0 ? (
        <div className="flex flex-col items-center py-8 text-muted-slate">
          <p className="comet-body-s">No input fields defined by this agent.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {fields.map((field) => (
            <div key={field.name} className="flex flex-col gap-1.5">
              <Label className="comet-body-xs-accented">{field.name}</Label>

              {field.type === "boolean" ? (
                <Switch
                  checked={watch(field.name) === "true"}
                  onCheckedChange={(checked) =>
                    setValue(field.name, String(checked))
                  }
                  disabled={isRunning}
                />
              ) : field.type === "object" || field.type === "json" ? (
                <Textarea
                  {...register(field.name)}
                  placeholder={field.name}
                  rows={4}
                  disabled={isRunning}
                />
              ) : (
                <Input
                  {...register(field.name)}
                  placeholder={field.name}
                  inputMode={
                    field.type === "integer" || field.type === "int"
                      ? "numeric"
                      : field.type === "float" || field.type === "double"
                        ? "decimal"
                        : "text"
                  }
                  disabled={isRunning}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </form>
  );
};

export default AgentRunnerInputForm;
