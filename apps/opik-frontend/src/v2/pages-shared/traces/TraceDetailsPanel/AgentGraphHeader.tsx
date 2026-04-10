import React from "react";
import { ChevronDown, Expand } from "lucide-react";

import { cn } from "@/lib/utils";
import TooltipWrapper from "@/shared/TooltipWrapper/TooltipWrapper";

type AgentGraphHeaderProps = {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onFullscreen: () => void;
  border: "top" | "bottom";
};

const AgentGraphHeader: React.FC<AgentGraphHeaderProps> = ({
  isCollapsed,
  onToggleCollapse,
  onFullscreen,
  border,
}) => (
  <div
    className={cn(
      "flex h-10 shrink-0 items-center justify-between bg-muted/50 px-3",
      border === "top" ? "border-t" : "border-b",
    )}
  >
    <span className="comet-body-xs-accented">Agent graph</span>
    <div className="flex items-center gap-1">
      <TooltipWrapper content="Open in fullscreen">
        <button
          className="flex size-6 cursor-pointer items-center justify-center rounded-sm text-muted-foreground hover:bg-muted"
          onClick={onFullscreen}
        >
          <Expand className="size-3.5" />
        </button>
      </TooltipWrapper>
      <button
        className="flex size-6 cursor-pointer items-center justify-center rounded-sm text-muted-foreground hover:bg-muted"
        onClick={onToggleCollapse}
      >
        <ChevronDown className={cn("size-3.5", isCollapsed && "-rotate-90")} />
      </button>
    </div>
  </div>
);

export default AgentGraphHeader;
