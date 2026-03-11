import React, { useEffect } from "react";
import { PanelRightClose, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import TooltipWrapper from "@/components/shared/TooltipWrapper/TooltipWrapper";
import useOllieAssistStore from "./OllieAssistStore";
import OllieAssistMessages from "./OllieAssistMessages";
import OllieAssistInput from "./OllieAssistInput";
import OllieAssistThreadTabs from "./OllieAssistThreadTabs";
import OllieAssistNewThread from "./OllieAssistNewThread";
import useOllieAssistSSE from "./useOllieAssistSSE";

const PANEL_WIDTH = 440;

const OllieAssistSidebar: React.FC = () => {
  const open = useOllieAssistStore((s) => s.open);
  const toggle = useOllieAssistStore((s) => s.toggle);
  const activeThreadId = useOllieAssistStore((s) => s.activeThreadId);
  const showNewThread = useOllieAssistStore((s) => s.showNewThread);
  const threads = useOllieAssistStore((s) => s.threads);
  const { sendMessage, abort, confirmTool } = useOllieAssistSSE();
  const setConfirmTool = useOllieAssistStore((s) => s.setConfirmTool);

  const hasThreads = Object.keys(threads).length > 0;
  const showLanding = showNewThread || !activeThreadId;

  useEffect(() => {
    setConfirmTool(confirmTool);
    return () => setConfirmTool(null);
  }, [confirmTool, setConfirmTool]);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--ollie-panel-width",
      open ? `${PANEL_WIDTH}px` : "0px",
    );
  }, [open]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "o") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggle]);

  return (
    <>
      {!open && (
        <TooltipWrapper content="Open assistant (Cmd+Shift+O)">
          <Button
            variant="default"
            size="icon"
            className="fixed bottom-4 right-4 z-50 size-10 rounded-full shadow-lg"
            onClick={toggle}
          >
            <Sparkles className="size-4" />
          </Button>
        </TooltipWrapper>
      )}

      <div
        data-ollie-assist
        className={cn(
          "fixed bottom-0 right-0 z-20 flex flex-col border-l-2 border-border bg-white text-foreground transition-transform duration-200",
          open ? "translate-x-0" : "translate-x-full",
        )}
        style={{ width: PANEL_WIDTH, top: "var(--banner-height, 0px)" }}
      >
        {/* Header */}
        <div
          className="flex shrink-0 items-center justify-between border-b border-border bg-muted/50 px-4"
          style={{ height: "var(--header-height)" }}
        >
          <div className="flex items-center gap-2">
            <Sparkles className="size-3.5 text-primary" />
            <span className="text-sm font-medium text-foreground">
              Assistant
            </span>
          </div>
          <div className="flex items-center gap-1">
            <TooltipWrapper content="Close sidebar">
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={toggle}
              >
                <PanelRightClose className="size-3.5" />
              </Button>
            </TooltipWrapper>
          </div>
        </div>

        {/* Thread tabs */}
        {hasThreads && <OllieAssistThreadTabs />}

        {/* Content area */}
        {showLanding ? (
          <OllieAssistNewThread />
        ) : (
          <OllieAssistMessages />
        )}

        <OllieAssistInput onSend={sendMessage} onStop={abort} />
      </div>
    </>
  );
};

export { PANEL_WIDTH };
export default OllieAssistSidebar;
