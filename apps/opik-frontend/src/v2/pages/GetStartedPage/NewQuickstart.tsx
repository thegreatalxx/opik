import React from "react";
import { Navigate } from "@tanstack/react-router";
import AgentOnboardingOverlay from "@/v2/pages-shared/AgentOnboarding/AgentOnboardingOverlay";
import {
  AGENT_ONBOARDING_KEY,
  AGENT_ONBOARDING_STEPS,
} from "@/v2/pages-shared/AgentOnboarding/AgentOnboardingContext";
import { useIsFeatureEnabled } from "@/contexts/feature-toggles-provider";
import { FeatureToggleKeys } from "@/types/feature-toggles";
import useLocalStorageState from "use-local-storage-state";
import useAppStore from "@/store/AppStore";

const NewQuickstart: React.FunctionComponent = () => {
  const [agentOnboardingState] = useLocalStorageState<{
    step: unknown;
  }>(AGENT_ONBOARDING_KEY);

  const isAgentConfigEnabled = useIsFeatureEnabled(
    FeatureToggleKeys.AGENT_CONFIGURATION_ENABLED,
  );

  const isOnboardingDone =
    !isAgentConfigEnabled ||
    agentOnboardingState?.step === AGENT_ONBOARDING_STEPS.DONE;

  console.log(
    "Agent Onboarding State:",
    isAgentConfigEnabled,
    agentOnboardingState,
  );

  if (!isOnboardingDone) {
    return <AgentOnboardingOverlay />;
  }

  return (
    <Navigate
      to="/$workspaceName/home"
      params={{ workspaceName: useAppStore.getState().activeWorkspaceName }}
    />
  );
};

export default NewQuickstart;
