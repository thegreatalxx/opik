import React from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import useAppStore, { useActiveWorkspaceName } from "@/store/AppStore";
import { OnChangeFn } from "@/types/shared";
import { Button } from "@/ui/button";
import { Separator } from "@/ui/separator";
import { cn, calculateWorkspaceName } from "@/lib/utils";
import Logo from "@/shared/Logo/Logo";
import usePluginsStore from "@/store/PluginsStore";
import SideBarMenuItems from "@/v2/layout/SideBar/SideBarMenuItems";
import ProjectSelector from "@/v2/layout/SideBar/ProjectSelector/ProjectSelector";
import SidebarMenuItem from "@/v2/layout/SideBar/MenuItem/SidebarMenuItem";
import GitHubStarListItem from "@/v2/layout/SideBar/GitHubStarListItem/GitHubStarListItem";
import { getWorkspaceMenuItems } from "@/v2/layout/SideBar/helpers/getMenuItems";
import { usePermissions } from "@/contexts/PermissionsContext";

const HOME_PATH = "/$workspaceName/home";

type SideBarProps = {
  expanded: boolean;
  setExpanded: OnChangeFn<boolean | undefined>;
};

const SideBar: React.FunctionComponent<SideBarProps> = ({
  expanded,
  setExpanded,
}) => {
  const workspaceName = useActiveWorkspaceName();
  const SidebarWorkspaceSelectorComponent = usePluginsStore(
    (state) => state.SidebarWorkspaceSelector,
  );
  const {
    permissions: { canViewDashboards },
  } = usePermissions();

  const menuGroups = getWorkspaceMenuItems({ canViewDashboards });
  const displayName = calculateWorkspaceName(
    useAppStore((state) => state.activeWorkspaceName),
  );

  const logo = <Logo expanded={expanded} />;

  const workspaceSelector = SidebarWorkspaceSelectorComponent ? (
    <SidebarWorkspaceSelectorComponent />
  ) : (
    <div className="comet-body-s-accented truncate rounded-md px-2 py-1 text-foreground">
      {displayName}
    </div>
  );

  const renderExpandCollapseButton = () => {
    return (
      <Button
        variant="outline"
        size="icon-2xs"
        onClick={() => setExpanded((s) => !s)}
        className={cn(
          "absolute -right-3 top-2 hidden rounded-full z-50 lg:group-hover:flex",
        )}
      >
        {expanded ? <ChevronLeft /> : <ChevronRight />}
      </Button>
    );
  };

  return (
    <aside className="comet-sidebar-width group h-[calc(100vh-var(--banner-height))] border-r transition-all">
      <div className="comet-header-height relative flex w-full items-center justify-between gap-6 border-b">
        <Link
          to={HOME_PATH}
          className="absolute left-[18px] z-10 block"
          params={{ workspaceName }}
        >
          {logo}
        </Link>
      </div>
      <div className="relative flex h-[calc(100%-var(--header-height))]">
        {renderExpandCollapseButton()}
        <div className="flex min-h-0 grow flex-col justify-between overflow-auto p-3">
          <div className="flex flex-col gap-1">
            <ProjectSelector expanded={expanded} />
            <ul className="mt-1 flex flex-col">
              <SideBarMenuItems expanded={expanded} />
            </ul>
          </div>

          <div className="shrink-0 gap-y-1">
            <Separator className="my-1" />
            <div className="flex flex-col">
              {expanded && (
                <div className="comet-body-s truncate py-1 pl-2.5 pr-3 text-light-slate">
                  Workspace
                </div>
              )}
              {expanded && workspaceSelector}
              <ul className="flex flex-col">
                {menuGroups.flatMap((group) =>
                  group.items.map((item) => (
                    <SidebarMenuItem
                      key={item.id}
                      item={item}
                      expanded={expanded}
                    />
                  )),
                )}
              </ul>
            </div>
            <Separator />
            <ul className="flex flex-col">
              <GitHubStarListItem expanded={expanded} />
            </ul>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default SideBar;
