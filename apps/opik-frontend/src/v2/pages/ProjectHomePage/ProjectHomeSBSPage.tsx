import React, { useCallback, useMemo } from "react";
import OpikConnectFlywheel from "./OpikConnectFlywheel";
import SuggestionPills, { getSuggestionPills } from "./SuggestionPills";
import { useOnboardingState } from "./useOnboardingState";

const ProjectHomeSBSPage: React.FunctionComponent = () => {
  const onboardingState = useOnboardingState();
  const pills = useMemo(
    () => getSuggestionPills(onboardingState),
    [onboardingState],
  );

  const handlePillClick = useCallback((text: string) => {
    const iframe = document.querySelector(
      'iframe[title="Assistant"]',
    ) as HTMLIFrameElement | null;
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage(
        { type: "opik:inject-input", text },
        "*",
      );
    }
  }, []);

  return (
    <div className="flex size-full flex-col gap-6 overflow-auto py-6">
      <div className="text-center">
        <h2 className="comet-title-m text-foreground">
          Hi, I&apos;m Ollie - I&apos;m a fully capable coding agent
        </h2>
      </div>

      <SuggestionPills pills={pills} onPillClick={handlePillClick} />

      <div className="mx-auto mt-4 w-full max-w-5xl">
        <h3 className="comet-title-s mb-4 text-foreground">
          Your road to a self-optimizing agent
        </h3>
        <OpikConnectFlywheel connectionState={onboardingState} />
      </div>
    </div>
  );
};

export default ProjectHomeSBSPage;
