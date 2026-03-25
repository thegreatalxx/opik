import React from "react";
import Breadcrumbs from "@/v2/layout/Breadcrumbs/Breadcrumbs";
import usePluginsStore from "@/store/PluginsStore";
import AppDebugInfo from "@/v2/layout/AppDebugInfo/AppDebugInfo";
import SettingsMenu from "../SettingsMenu/SettingsMenu";
import SupportHub from "@/v2/layout/SupportHub/SupportHub";
import GitHubStarButton from "@/v2/layout/TopBar/GitHubStarButton";
import { ArrowLeftRight } from "lucide-react";
import { setVersionOverride } from "@/lib/workspaceVersion";

type TopBarProps = {
  startSlot?: React.ReactNode;
};

const TopBar: React.FunctionComponent<TopBarProps> = ({ startSlot }) => {
  const UserMenu = usePluginsStore((state) => state.UserMenu);
  const UpgradeButton = usePluginsStore((state) => state.UpgradeButton);

  return (
    <nav className="comet-header-height flex w-full items-center justify-between gap-6 border-b pl-4 pr-6">
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
        {startSlot}
        <div className="min-w-0 flex-1">
          <Breadcrumbs />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <AppDebugInfo />
        {UpgradeButton && <UpgradeButton />}
        <GitHubStarButton />
        <button
          className="flex items-center gap-1 rounded border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
          onClick={() => setVersionOverride("v1")}
        >
          <ArrowLeftRight className="size-3" />
          v1
        </button>
        <SupportHub />
        {UserMenu ? <UserMenu /> : <SettingsMenu />}
      </div>
    </nav>
  );
};

export default TopBar;
