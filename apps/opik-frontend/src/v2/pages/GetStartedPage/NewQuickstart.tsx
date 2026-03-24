import React, { useEffect } from "react";
import { Navigate } from "@tanstack/react-router";
import { IntegrationExplorer } from "@/v2/pages-shared/onboarding/IntegrationExplorer";
import OnboardingOverlay from "@/v2/pages-shared/OnboardingOverlay/OnboardingOverlay";
import AgentOnboardingOverlay from "@/v2/pages-shared/AgentOnboarding/AgentOnboardingOverlay";
import {
  ONBOARDING_STEP_FINISHED,
  ONBOARDING_STEP_KEY,
} from "@/v2/pages-shared/OnboardingOverlay/OnboardingOverlayContext";
import {
  AGENT_ONBOARDING_KEY,
  AGENT_ONBOARDING_STEPS,
} from "@/v2/pages-shared/AgentOnboarding/AgentOnboardingContext";
import { useIsFeatureEnabled } from "@/contexts/feature-toggles-provider";
import { FeatureToggleKeys } from "@/types/feature-toggles";
import useLocalStorageState from "use-local-storage-state";
import useAppStore from "@/store/AppStore";
import posthog from "posthog-js";

export interface NewQuickstartProps {
  shouldSkipQuestions?: boolean;
}

const NewQuickstart: React.FunctionComponent<NewQuickstartProps> = ({
  shouldSkipQuestions = false,
}) => {
  const [currentOnboardingStep] = useLocalStorageState(ONBOARDING_STEP_KEY);
  const [agentOnboardingState] = useLocalStorageState<{
    step: unknown;
  }>(AGENT_ONBOARDING_KEY);

  const isAgentConfigEnabled = useIsFeatureEnabled(
    FeatureToggleKeys.AGENT_CONFIGURATION_ENABLED,
  );

  console.log("[NewQuickstart] isAgentConfigEnabled:", isAgentConfigEnabled);

  const isOnboardingDone = isAgentConfigEnabled
    ? agentOnboardingState?.step === AGENT_ONBOARDING_STEPS.DONE
    : currentOnboardingStep === ONBOARDING_STEP_FINISHED;

  const showIntegrationList = isOnboardingDone || shouldSkipQuestions;

  // Update URL hash when showing integration list
  // This allows FullStory and PostHog to distinguish this step by URL
  useEffect(() => {
    if (!showIntegrationList) return;

    const hash = "#integration_list";

    if (window.location.hash !== hash) {
      window.history.replaceState(null, "", hash);

      // Manually trigger PostHog pageview for hash changes
      try {
        if (posthog.is_capturing()) {
          posthog.capture("$pageview");
        }
      } catch (error) {
        // PostHog may not be initialized or available
      }
    }
  }, [showIntegrationList]);

  if (!showIntegrationList) {
    if (isAgentConfigEnabled) {
      return <AgentOnboardingOverlay />;
    }
    return <OnboardingOverlay />;
  }

  if (isAgentConfigEnabled) {
    return (
      <Navigate
        to="/$workspaceName/home"
        params={{ workspaceName: useAppStore.getState().activeWorkspaceName }}
      />
    );
  }

  return (
    <div className="w-full pb-10">
      <div className="mx-auto max-w-[1040px]">
        <div className="mb-3 mt-6 flex items-center justify-between md:mt-10">
          <h1 className="md:comet-title-xl comet-title-l">
            Get started with Opik
          </h1>
          {/* <LoggedDataStatus status="waiting" /> */}
        </div>
        <div className="comet-body-s mb-10 text-muted-slate">
          Opik helps you improve your LLM features by tracking what happens
          behind the scenes. Integrate Opik to unlock evaluations, experiments,
          and debugging.
        </div>

        <IntegrationExplorer source="get-started">
          <div className="mb-8 flex flex-col justify-between gap-6 md:flex-row md:items-center">
            <IntegrationExplorer.Search />

            <div className="flex flex-wrap items-center gap-6 md:gap-3">
              <IntegrationExplorer.CopyApiKey />
              <IntegrationExplorer.GetHelp />
              <IntegrationExplorer.Skip />
            </div>
          </div>

          <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <IntegrationExplorer.QuickInstall />
            <IntegrationExplorer.TypeScriptSDK />
          </div>

          <IntegrationExplorer.Tabs>
            <IntegrationExplorer.Grid />
          </IntegrationExplorer.Tabs>
        </IntegrationExplorer>
      </div>
    </div>
  );
};

export default NewQuickstart;
