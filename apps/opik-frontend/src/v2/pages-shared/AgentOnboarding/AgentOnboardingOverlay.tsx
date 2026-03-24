import React from "react";
import AgentOnboardingProvider from "./AgentOnboardingContext";
import AgentNameStep from "./AgentNameStep";

const AgentOnboardingOverlay: React.FC = () => {
  return (
    <AgentOnboardingProvider>
      <AgentNameStep />
    </AgentOnboardingProvider>
  );
};

export default AgentOnboardingOverlay;
