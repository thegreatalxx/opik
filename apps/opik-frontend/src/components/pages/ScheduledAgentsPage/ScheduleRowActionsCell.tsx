import React, { useCallback } from "react";
import { CellContext } from "@tanstack/react-table";
import { useNavigate } from "@tanstack/react-router";
import { MoreHorizontal, Pencil, Trash, List } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import useScheduleDeleteMutation from "@/api/scheduled-agents/useScheduleDeleteMutation";
import useProjectByName from "@/api/projects/useProjectByName";
import useAppStore from "@/store/AppStore";
import { Schedule } from "@/types/scheduled-agents";
import { COLUMN_TYPE } from "@/types/shared";

const ScheduleRowActionsCell: React.FunctionComponent<
  CellContext<Schedule, unknown>
> = ({ row }) => {
  const schedule = row.original;
  const workspaceName = useAppStore((state) => state.activeWorkspaceName);
  const navigate = useNavigate();
  const deleteMutation = useScheduleDeleteMutation();

  const { data: ollieProject } = useProjectByName(
    { projectName: "Ollie Assist" },
    { enabled: true },
  );

  const handleEdit = useCallback(() => {
    if (!schedule.id) return;

    navigate({
      to: "/$workspaceName/scheduled-agents/$scheduleId",
      params: { workspaceName, scheduleId: schedule.id },
      search: (prev) => prev,
    });
  }, [navigate, workspaceName, schedule.id]);

  const handleDelete = useCallback(() => {
    if (!schedule.id) return;
    deleteMutation.mutate({ scheduleId: schedule.id });
  }, [deleteMutation, schedule.id]);

  const handleViewTraces = useCallback(() => {
    if (!ollieProject?.id) return;

    const tag = `Scheduled: ${schedule.name}`;
    navigate({
      to: "/$workspaceName/projects/$projectId/traces",
      params: { workspaceName, projectId: ollieProject.id },
      search: {
        traces_filters: [
          {
            id: "scheduled_tag",
            field: "tags",
            type: COLUMN_TYPE.list,
            operator: "contains",
            key: "",
            value: tag,
          },
        ],
      },
    });
  }, [navigate, workspaceName, schedule.name, ollieProject?.id]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="minimal" size="icon-xs">
          <MoreHorizontal className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem
          onClick={handleViewTraces}
          disabled={!ollieProject?.id}
        >
          <List className="mr-2 size-4" />
          View traces
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleEdit}>
          <Pencil className="mr-2 size-4" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleDelete}>
          <Trash className="mr-2 size-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ScheduleRowActionsCell;
