import React from "react";
import { UseFormReturn } from "react-hook-form";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/ui/form";
import { OptimizationConfigFormType } from "@/v2/pages-shared/optimizations/OptimizationConfigForm/schema";
import { PROVIDER_MODEL_TYPE, LLMPromptConfigsType } from "@/types/providers";
import { LLM_MESSAGE_ROLE, LLMMessage } from "@/types/llm";
import { generateDefaultLLMPromptMessage } from "@/lib/llm";
import LLMPromptMessages from "@/v2/pages-shared/llm/LLMPromptMessages/LLMPromptMessages";
import OptimizationModelSelect from "@/v2/pages-shared/optimizations/OptimizationModelSelect/OptimizationModelSelect";
import OptimizationTemperatureConfig from "@/v2/pages-shared/optimizations/OptimizationConfigForm/OptimizationTemperatureConfig";
import { OPTIMIZATION_MESSAGE_TYPE_OPTIONS } from "@/constants/optimizations";

type OptimizationsNewPromptSectionProps = {
  form: UseFormReturn<OptimizationConfigFormType>;
  model: PROVIDER_MODEL_TYPE | "";
  config: OptimizationConfigFormType["modelConfig"];
  datasetVariables: string[];
  onNameChange: (value: string) => void;
  onModelChange: (model: PROVIDER_MODEL_TYPE) => void;
  onModelConfigChange: (configs: Partial<LLMPromptConfigsType>) => void;
};

const OptimizationsNewPromptSection: React.FC<
  OptimizationsNewPromptSectionProps
> = ({
  form,
  model,
  config,
  datasetVariables,
  onNameChange,
  onModelChange,
  onModelConfigChange,
}) => {
  return (
    <div className="flex-1 space-y-6">
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="comet-body-s-accented">Name</FormLabel>
            <FormControl>
              <Input
                {...field}
                onChange={(e) => onNameChange(e.target.value)}
                placeholder="Enter optimization name, or the name will be generated automatically"
                className="h-10"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <div>
        <div className="mb-2 flex h-8 items-center justify-between">
          <Label className="comet-body-s-accented">Prompt</Label>
          <div className="flex h-full items-center gap-1">
            <FormField
              control={form.control}
              name="modelName"
              render={({ field }) => (
                <FormItem className="flex h-full flex-row items-center gap-1">
                  <FormControl>
                    <div className="h-full w-56">
                      <OptimizationModelSelect
                        value={field.value as PROVIDER_MODEL_TYPE | ""}
                        onChange={onModelChange}
                        hasError={Boolean(form.formState.errors.modelName)}
                      />
                    </div>
                  </FormControl>
                  <OptimizationTemperatureConfig
                    size="icon-sm"
                    model={model}
                    configs={config}
                    onChange={onModelConfigChange}
                  />
                </FormItem>
              )}
            />
          </div>
        </div>
        <FormField
          control={form.control}
          name="messages"
          render={({ field }) => {
            const fieldMessages = field.value;

            return (
              <FormItem>
                <LLMPromptMessages
                  messages={fieldMessages}
                  possibleTypes={OPTIMIZATION_MESSAGE_TYPE_OPTIONS}
                  hidePromptActions={false}
                  disableMedia
                  promptVariables={datasetVariables}
                  onChange={(newMessages: LLMMessage[]) => {
                    field.onChange(newMessages);
                  }}
                  onAddMessage={() =>
                    field.onChange([
                      ...fieldMessages,
                      generateDefaultLLMPromptMessage({
                        role: LLM_MESSAGE_ROLE.user,
                      }),
                    ])
                  }
                />
                <FormMessage />
              </FormItem>
            );
          }}
        />
      </div>
    </div>
  );
};

export default OptimizationsNewPromptSection;
