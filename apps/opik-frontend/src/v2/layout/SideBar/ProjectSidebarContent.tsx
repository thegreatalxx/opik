import React from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useActiveWorkspaceName } from "@/store/AppStore";
import { Separator } from "@/ui/separator";
import { calculateWorkspaceName } from "@/lib/utils";
import TooltipWrapper from "@/shared/TooltipWrapper/TooltipWrapper";
import SideBarMenuItems from "@/v2/layout/SideBar/SideBarMenuItems";
import ProjectSelector from "@/v2/layout/SideBar/ProjectSelector/ProjectSelector";
import GitHubStarListItem from "@/v2/layout/SideBar/GitHubStarListItem/GitHubStarListItem";

interface ProjectSidebarContentProps {
  expanded: boolean;
}

const ProjectSidebarContent: React.FC<ProjectSidebarContentProps> = ({
  expanded,
}) => {
  const navigate = useNavigate();
  const workspaceName = useActiveWorkspaceName();
  const displayName = calculateWorkspaceName(workspaceName);

  const handleGoToWorkspace = () => {
    navigate({
      to: "/$workspaceName/configuration",
      params: { workspaceName },
    });
  };

  const workspaceButton = (
    <button
      onClick={handleGoToWorkspace}
      className="flex w-full flex-col rounded-md hover:bg-primary-foreground"
    >
      {expanded ? (
        <>
          <div className="w-full px-2 pt-1 text-left">
            <span className="comet-body-xs-accented text-light-slate">
              Workspace
            </span>
          </div>
          <div className="flex w-full items-center gap-2 px-2 py-1">
            <span className="comet-body-s flex-1 truncate text-left text-foreground">
              {displayName}
            </span>
            <ArrowRight className="size-3.5 shrink-0 text-muted-slate" />
          </div>
        </>
      ) : (
        <div className="flex size-7 items-center justify-center">
          <ArrowRight className="size-3.5 text-muted-slate" />
        </div>
      )}
    </button>
  );

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        <ProjectSelector expanded={expanded} />
        <ul className="mt-1 flex flex-col">
          <SideBarMenuItems expanded={expanded} />
        </ul>
      </div>

      <div className="shrink-0 pt-2">
        <Separator className="mb-3" />
        {expanded ? (
          workspaceButton
        ) : (
          <TooltipWrapper content="Workspace" side="right" delayDuration={0}>
            {workspaceButton}
          </TooltipWrapper>
        )}
        <ul className="mt-2 flex flex-col">
          <GitHubStarListItem expanded={expanded} />
        </ul>
      </div>
    </>
  );
};

export default ProjectSidebarContent;
