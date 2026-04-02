import React from "react";
import type { OnboardingState } from "./useOnboardingState";

const PILLS_BY_CONNECTED_COUNT: Record<number, string[]> = {
  0: [
    "Help me log my first trace",
    "What can Opik do for me?",
    "Show me a quick demo",
  ],
  1: [
    "Set up online evaluation metrics",
    "Help me find underperforming traces",
    "Create an evaluation suite",
  ],
  2: [
    "Run an experiment with my config",
    "Help me find underperforming traces",
    "Connect my local runner",
  ],
  3: [
    "Start an optimization run",
    "Compare my experiments",
    "Set up production alerts",
  ],
  4: [
    "Analyze my latest optimization",
    "Help me improve my evaluation metrics",
    "Review production quality trends",
  ],
};

export function getSuggestionPills(connectionState: OnboardingState): string[] {
  const count = connectionState.filter(Boolean).length;
  return PILLS_BY_CONNECTED_COUNT[count] ?? PILLS_BY_CONNECTED_COUNT[0];
}

interface SuggestionPillsProps {
  pills: string[];
  onPillClick: (text: string) => void;
}

const SuggestionPills: React.FunctionComponent<SuggestionPillsProps> = ({
  pills,
  onPillClick,
}) => {
  return (
    <div className="mx-auto flex flex-col items-center gap-3">
      <span className="comet-body-s text-muted-slate">How can I help you?</span>
      <div className="flex flex-wrap justify-center gap-3">
        {pills.map((text) => (
          <button
            key={text}
            className="rounded-full border border-primary/30 bg-primary-100/40 px-5 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-primary-100"
            onClick={() => onPillClick(text)}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
};

export default SuggestionPills;
