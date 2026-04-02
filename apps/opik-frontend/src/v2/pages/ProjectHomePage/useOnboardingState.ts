/**
 * Onboarding connection state for the project.
 * Order: [Observability, Agent Config, Local Runner, Optimizer]
 *
 * TODO: Replace hardcoded state with actual feature-usage detection
 * (e.g. check whether the project has traces, configs, a paired runner, etc.)
 */
export type OnboardingState = [boolean, boolean, boolean, boolean];

export function useOnboardingState(): OnboardingState {
  return [true, false, false, false];
}
