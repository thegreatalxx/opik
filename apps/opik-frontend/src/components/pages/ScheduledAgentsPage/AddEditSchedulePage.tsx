import React, { useCallback, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { keepPreviousData } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Loader from "@/components/shared/Loader/Loader";

import useAppStore from "@/store/AppStore";
import useBreadcrumbsStore from "@/store/BreadcrumbsStore";
import useScheduleById from "@/api/scheduled-agents/useScheduleById";
import useScheduleCreateMutation from "@/api/scheduled-agents/useScheduleCreateMutation";
import useScheduleUpdateMutation from "@/api/scheduled-agents/useScheduleUpdateMutation";
import useRunnersList from "@/api/scheduled-agents/useRunnersList";
import useAlertsList from "@/api/alerts/useAlertsList";

const ScheduleFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  agent_name: z.string().min(1, "Agent is required"),
  cron: z.string().min(1, "Cron expression is required"),
  enabled: z.boolean(),
  inputs: z.string().optional(),
  prompt: z.string().optional(),
  channels: z.array(z.string()).optional(),
});

type ScheduleFormType = z.infer<typeof ScheduleFormSchema>;

const AddEditSchedulePage: React.FunctionComponent = () => {
  const { scheduleId } = useParams({ strict: false });
  const navigate = useNavigate();
  const workspaceName = useAppStore((state) => state.activeWorkspaceName);
  const setBreadcrumbParam = useBreadcrumbsStore((state) => state.setParam);

  const isEdit = Boolean(scheduleId && scheduleId !== "new");

  const { data: schedule, isPending: isScheduleLoading } = useScheduleById(
    { scheduleId: scheduleId || "" },
    { enabled: isEdit },
  );

  const createMutation = useScheduleCreateMutation();
  const updateMutation = useScheduleUpdateMutation();

  const { data: runnersData } = useRunnersList({
    placeholderData: keepPreviousData,
  });

  const { data: alertsData } = useAlertsList(
    { workspaceName, page: 1, size: 100 },
    { placeholderData: keepPreviousData },
  );

  const agentOptions = useMemo(() => {
    if (!runnersData?.content) return [];
    return runnersData.content.flatMap((runner) =>
      runner.agents.map((agent) => ({
        value: agent,
        label: agent,
        runnerId: runner.id,
      })),
    );
  }, [runnersData]);

  const channelOptions = useMemo(() => {
    if (!alertsData?.content) return [];
    return alertsData.content.map((alert) => ({
      value: alert.id!,
      label: alert.name,
    }));
  }, [alertsData]);

  useEffect(() => {
    if (isEdit && schedule?.name) {
      setBreadcrumbParam("scheduleId", scheduleId!, schedule.name);
    }
  }, [isEdit, scheduleId, schedule?.name, setBreadcrumbParam]);

  const form = useForm<ScheduleFormType>({
    resolver: zodResolver(ScheduleFormSchema),
    defaultValues: {
      name: "",
      agent_name: "",
      cron: "",
      enabled: true,
      inputs: "",
      prompt: "",
      channels: [],
    },
  });

  useEffect(() => {
    if (schedule && isEdit) {
      form.reset({
        name: schedule.name,
        agent_name: schedule.agent_name,
        cron: schedule.cron,
        enabled: schedule.enabled,
        inputs: schedule.inputs ? JSON.stringify(schedule.inputs, null, 2) : "",
        prompt: schedule.prompt || "",
        channels: schedule.channels || [],
      });
    }
  }, [schedule, isEdit, form]);

  const isPending = createMutation.isPending || updateMutation.isPending;

  const handleNavigateBack = useCallback(() => {
    navigate({
      to: "/$workspaceName/scheduled-agents",
      params: { workspaceName },
    });
  }, [navigate, workspaceName]);

  const onSubmit = useCallback(
    async (values: ScheduleFormType) => {
      let parsedInputs: Record<string, unknown> | undefined;
      if (values.inputs) {
        try {
          parsedInputs = JSON.parse(values.inputs);
        } catch {
          form.setError("inputs", { message: "Invalid JSON" });
          return;
        }
      }

      const payload = {
        name: values.name,
        agent_name: values.agent_name,
        cron: values.cron,
        enabled: values.enabled,
        inputs: parsedInputs,
        prompt: values.prompt || undefined,
        channels: values.channels?.length ? values.channels : undefined,
      };

      if (isEdit && scheduleId) {
        await updateMutation.mutateAsync({
          schedule: payload,
          scheduleId,
        });
      } else {
        await createMutation.mutateAsync({ schedule: payload });
      }

      handleNavigateBack();
    },
    [
      isEdit,
      scheduleId,
      createMutation,
      updateMutation,
      handleNavigateBack,
      form,
    ],
  );

  if (isEdit && isScheduleLoading) {
    return <Loader />;
  }

  const title = isEdit ? "Edit schedule" : "Create a new schedule";
  const submitText = isEdit ? "Update schedule" : "Create schedule";

  return (
    <div className="mx-auto max-w-2xl pt-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="comet-title-l">{title}</h1>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <Label>Name</Label>
                <FormControl>
                  <Input placeholder="My schedule" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="agent_name"
            render={({ field }) => (
              <FormItem>
                <Label>Agent</Label>
                <FormControl>
                  {agentOptions.length > 0 ? (
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select an agent" />
                      </SelectTrigger>
                      <SelectContent>
                        {agentOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input placeholder="Agent name" {...field} />
                  )}
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="cron"
            render={({ field }) => (
              <FormItem>
                <Label>Cron expression</Label>
                <FormControl>
                  <Input placeholder="0 */6 * * *" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="prompt"
            render={({ field }) => (
              <FormItem>
                <Label>Prompt (optional)</Label>
                <FormControl>
                  <Textarea
                    placeholder="Instructions for the agent..."
                    rows={3}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="inputs"
            render={({ field }) => (
              <FormItem>
                <Label>Inputs JSON (optional)</Label>
                <FormControl>
                  <Textarea
                    placeholder='{"key": "value"}'
                    rows={4}
                    className="font-mono text-sm"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {channelOptions.length > 0 && (
            <FormField
              control={form.control}
              name="channels"
              render={({ field }) => (
                <FormItem>
                  <Label>Channels (optional)</Label>
                  <div className="flex flex-wrap gap-2">
                    {channelOptions.map((ch) => {
                      const isSelected = field.value?.includes(ch.value);
                      return (
                        <Button
                          key={ch.value}
                          type="button"
                          variant={isSelected ? "default" : "outline"}
                          size="sm"
                          onClick={() => {
                            const current = field.value || [];
                            field.onChange(
                              isSelected
                                ? current.filter((id) => id !== ch.value)
                                : [...current, ch.value],
                            );
                          }}
                        >
                          {ch.label}
                        </Button>
                      );
                    })}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          <FormField
            control={form.control}
            name="enabled"
            render={({ field }) => (
              <FormItem className="flex items-center gap-3">
                <Label>Enabled</Label>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <div className="flex items-center gap-4 pt-4">
            <Button type="submit" disabled={isPending}>
              {submitText}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleNavigateBack}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
};

export default AddEditSchedulePage;
