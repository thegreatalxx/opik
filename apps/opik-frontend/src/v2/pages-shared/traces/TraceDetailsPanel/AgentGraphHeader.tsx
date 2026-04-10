import React from "react";
import { ChevronDown, Expand } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/ui/button";
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
        <Button variant="ghost" size="icon-2xs" onClick={onFullscreen}>
          <Expand className="size-3.5" />
        </Button>
      </TooltipWrapper>
      <Button variant="ghost" size="icon-2xs" onClick={onToggleCollapse}>
        <ChevronDown className={cn("size-3.5", isCollapsed && "-rotate-90")} />
      </Button>
    </div>
  </div>
);

export default AgentGraphHeader;
