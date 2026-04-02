import React, { useCallback, useRef } from "react";
import usePluginsStore from "@/store/PluginsStore";
import SilentErrorBoundary from "@/shared/SilentErrorBoundary/SilentErrorBoundary";
import OpikConnectFlywheel from "./OpikConnectFlywheel";

const SUGGESTION_PILLS = ["Create an Eval", "Fix a problem", "Optimize Agent"];

const noop = () => {};

const ProjectHomePage: React.FunctionComponent = () => {
  const AssistantSidebar = usePluginsStore((state) => state.AssistantSidebar);
  const iframeContainerRef = useRef<HTMLDivElement>(null);

  const handleSuggestionClick = useCallback((text: string) => {
    const iframe = iframeContainerRef.current?.querySelector("iframe");
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage(
        { type: "opik:inject-input", text },
        "*",
      );
    }
  }, []);

  return (
    <div className="flex size-full flex-col gap-6 overflow-auto py-6">
      {/* Intro text */}
      <div className="text-center">
        <h2 className="comet-title-m text-foreground">
          Hi, I&apos;m Ollie &ndash; I&apos;m a fully capable coding agent
        </h2>
      </div>

      {/* Inline OLLI assist iframe */}
      <div
        ref={iframeContainerRef}
        className="mx-auto h-[560px] w-full max-w-5xl shrink-0 overflow-hidden rounded-lg border"
      >
        {AssistantSidebar ? (
          <SilentErrorBoundary>
            <AssistantSidebar onWidthChange={noop} />
          </SilentErrorBoundary>
        ) : (
          <div className="flex size-full items-center justify-center text-muted-slate">
            Assistant not available
          </div>
        )}
      </div>

      {/* Suggestion pills */}
      <div className="mx-auto flex flex-wrap justify-center gap-3">
        {SUGGESTION_PILLS.map((text) => (
          <button
            key={text}
            className="rounded-full border px-4 py-2 text-sm text-foreground transition-colors hover:bg-primary-foreground"
            onClick={() => handleSuggestionClick(text)}
          >
            {text}
          </button>
        ))}
      </div>

      {/* Opik Connect Flywheel */}
      <div className="mx-auto mt-8 w-full max-w-5xl">
        <h3 className="comet-title-s mb-4 text-foreground">
          Your road to a self-optimizing agent
        </h3>
        <OpikConnectFlywheel />
      </div>
    </div>
  );
};

export default ProjectHomePage;
