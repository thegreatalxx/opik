import React, { useState } from "react";
import { Button } from "@/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/ui/tabs";
import {
  useAgentOnboarding,
  AGENT_ONBOARDING_STEPS,
} from "./AgentOnboardingContext";
import AgentOnboardingCard from "./AgentOnboardingCard";
import InstallWithAITab from "./InstallWithAITab";
import ManualIntegrationList from "./ManualIntegrationList";
import ManualIntegrationDetail from "./ManualIntegrationDetail";
import { INTEGRATIONS } from "@/constants/integrations";

const ConnectAgentStep: React.FC = () => {
  const { goToStep, agentName } = useAgentOnboarding();
  const [activeTab, setActiveTab] = useState("install-with-ai");
  const [selectedIntegrationId, setSelectedIntegrationId] = useState<
    string | null
  >(null);

  const selectedIntegration = selectedIntegrationId
    ? INTEGRATIONS.find((i) => i.id === selectedIntegrationId)
    : undefined;

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setSelectedIntegrationId(null);
  };

  const handleBack = () => {
    goToStep(AGENT_ONBOARDING_STEPS.AGENT_NAME, { agentName });
  };

  const handleSkip = () => {
    goToStep(AGENT_ONBOARDING_STEPS.DONE, { agentName });
  };

  return (
    <AgentOnboardingCard
      title={`Connect ${agentName} to Opik`}
      description="Follow these steps to start sending traces to Opik."
      showFooterSeparator
      footer={
        <>
          <Button
            variant="link"
            onClick={handleBack}
            className="mr-auto text-muted-slate"
            id="onboarding-step2-back"
            data-fs-element="onboarding-step2-back"
          >
            Back
          </Button>
          <Button
            variant="link"
            onClick={handleSkip}
            className="text-muted-slate"
            id="onboarding-step2-skip"
            data-fs-element="onboarding-step2-skip"
          >
            Skip for now
          </Button>
        </>
      }
    >
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList variant="underline">
          <TabsTrigger value="install-with-ai" variant="underline">
            Install with AI
          </TabsTrigger>
          <TabsTrigger value="manual-integration" variant="underline">
            Manual integration
          </TabsTrigger>
        </TabsList>

        <TabsContent value="install-with-ai">
          <InstallWithAITab />
        </TabsContent>

        <TabsContent value="manual-integration">
          {selectedIntegration ? (
            <ManualIntegrationDetail
              integration={selectedIntegration}
              onBack={() => setSelectedIntegrationId(null)}
            />
          ) : (
            <ManualIntegrationList
              onSelectIntegration={setSelectedIntegrationId}
            />
          )}
        </TabsContent>
      </Tabs>
    </AgentOnboardingCard>
  );
};

export default ConnectAgentStep;
