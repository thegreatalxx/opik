import React, { useMemo } from "react";
import { Clock, Coins, PenLine } from "lucide-react";

import {
  KPICard,
  MetricKPICard,
} from "@/components/pages-shared/experiments/KPICard/KPICard";
import {
  formatAsPercentage,
  formatAsDuration,
  formatAsCurrency,
} from "@/lib/optimization-formatters";
import { Experiment } from "@/types/datasets";
import { AggregatedCandidate } from "@/types/optimizations";

type OptimizationKPICardsProps = {
  experiments: Experiment[];
  baselineCandidate?: AggregatedCandidate;
  bestCandidate?: AggregatedCandidate;
  isEvaluationSuite?: boolean;
};

const OptimizationKPICards: React.FunctionComponent<
  OptimizationKPICardsProps
> = ({ experiments, baselineCandidate, bestCandidate, isEvaluationSuite }) => {
  const kpiData = useMemo(() => {
    const totalOptCost = experiments.reduce(
      (sum, e) => sum + (e.total_estimated_cost ?? 0),
      0,
    );

    let totalDuration: number | undefined;
    if (experiments.length >= 2) {
      const sorted = experiments
        .slice()
        .sort((a, b) => a.created_at.localeCompare(b.created_at));
      const first = new Date(sorted[0].created_at).getTime();
      const last = new Date(sorted[sorted.length - 1].created_at).getTime();
      totalDuration = (last - first) / 1000;
    }

    return { totalOptCost, totalDuration };
  }, [experiments]);

  return (
    <div className="grid grid-cols-4 gap-4">
      <MetricKPICard
        icon={PenLine}
        label={isEvaluationSuite ? "Pass rate" : "Accuracy"}
        baseline={baselineCandidate?.score}
        current={bestCandidate?.score}
        formatter={formatAsPercentage}
      />

      <MetricKPICard
        icon={Clock}
        label="Latency"
        baseline={baselineCandidate?.latencyP50}
        current={bestCandidate?.latencyP50}
        formatter={formatAsDuration}
        trend="inverted"
      />

      <MetricKPICard
        icon={Coins}
        label="Runtime cost"
        baseline={baselineCandidate?.runtimeCost}
        current={bestCandidate?.runtimeCost}
        formatter={formatAsCurrency}
        trend="inverted"
      />

      <KPICard icon={Coins} label="Optimization cost">
        <div className="flex items-baseline gap-1.5">
          <span className="comet-body-s-accented">
            {kpiData.totalOptCost > 0
              ? formatAsCurrency(kpiData.totalOptCost)
              : "-"}
          </span>
          {kpiData.totalDuration != null && kpiData.totalDuration > 0 && (
            <span className="comet-body-xs text-muted-slate">
              {formatAsDuration(kpiData.totalDuration)} total
            </span>
          )}
        </div>
      </KPICard>
    </div>
  );
};

export default OptimizationKPICards;
