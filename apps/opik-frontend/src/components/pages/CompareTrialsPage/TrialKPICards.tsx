import React, { useMemo } from "react";
import { Clock, Coins, PenLine } from "lucide-react";

import { MetricKPICard } from "@/components/pages-shared/experiments/KPICard/KPICard";
import {
  formatAsPercentage,
  formatAsDuration,
  formatAsCurrency,
} from "@/lib/optimization-formatters";
import { Experiment } from "@/types/datasets";
import { aggregateExperimentMetrics } from "@/lib/experiment-metrics";

type TrialKPICardsProps = {
  experiments: Experiment[];
  allOptimizationExperiments: Experiment[];
  objectiveName?: string;
  isEvaluationSuite?: boolean;
};

const TrialKPICards: React.FunctionComponent<TrialKPICardsProps> = ({
  experiments,
  allOptimizationExperiments,
  objectiveName,
  isEvaluationSuite,
}) => {
  const currentMetrics = useMemo(
    () => aggregateExperimentMetrics(experiments, objectiveName),
    [experiments, objectiveName],
  );

  const baselineMetrics = useMemo(() => {
    if (!allOptimizationExperiments.length) return undefined;

    const sorted = allOptimizationExperiments
      .slice()
      .sort((a, b) => a.created_at.localeCompare(b.created_at));

    const baselineExpIds = new Set<string>();
    const firstMeta = sorted[0]?.metadata as
      | Record<string, unknown>
      | undefined;
    const firstCandidateId = firstMeta?.candidate_id as string | undefined;

    if (firstCandidateId) {
      for (const exp of sorted) {
        const meta = exp.metadata as Record<string, unknown> | undefined;
        if (meta?.candidate_id === firstCandidateId) {
          baselineExpIds.add(exp.id);
        }
      }
    } else {
      baselineExpIds.add(sorted[0].id);
    }

    const isViewingBaseline = experiments.every((e) =>
      baselineExpIds.has(e.id),
    );
    if (isViewingBaseline) return undefined;

    const baselineExps = allOptimizationExperiments.filter((e) =>
      baselineExpIds.has(e.id),
    );
    return aggregateExperimentMetrics(baselineExps, objectiveName);
  }, [allOptimizationExperiments, experiments, objectiveName]);

  return (
    <div className="grid grid-cols-3 gap-4">
      <MetricKPICard
        icon={PenLine}
        label={isEvaluationSuite ? "Pass rate" : objectiveName ?? "Accuracy"}
        baseline={baselineMetrics?.score}
        current={currentMetrics.score}
        formatter={formatAsPercentage}
      />

      <MetricKPICard
        icon={Clock}
        label="Latency"
        baseline={baselineMetrics?.latency}
        current={currentMetrics.latency}
        formatter={formatAsDuration}
        trend="inverted"
      />

      <MetricKPICard
        icon={Coins}
        label="Runtime cost"
        baseline={baselineMetrics?.cost}
        current={currentMetrics.cost}
        formatter={formatAsCurrency}
        trend="inverted"
      />
    </div>
  );
};

export default TrialKPICards;
