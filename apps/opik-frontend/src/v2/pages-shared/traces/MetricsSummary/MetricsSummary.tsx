import React, { useMemo, useState, useCallback } from "react";
import {
  Braces,
  AlertTriangle,
  Clock,
  Coins,
  ArrowUp,
  ArrowDown,
  LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/date";
import { formatCost } from "@/lib/money";
import { Skeleton } from "@/ui/skeleton";
import useProjectKpiCards, {
  KpiEntityType,
  KpiMetric,
  KpiMetricType,
} from "@/api/projects/useProjectKpiCards";
import { Filters } from "@/types/filters";
import { PercentageTrendType } from "@/shared/PercentageTrend/PercentageTrend";
import MetricContainerChart from "@/v2/pages-shared/dashboards/widgets/ProjectMetricsWidget/MetricChart/MetricChartContainer";
import {
  METRIC_NAME_TYPE,
} from "@/api/projects/useProjectMetric";
import { CHART_TYPE } from "@/constants/chart";
import {
  durationYTickFormatter,
  renderDurationTooltipValue,
  costYTickFormatter,
  renderCostTooltipValue,
} from "@/v2/pages-shared/dashboards/widgets/ProjectMetricsWidget/chartUtils";
import { ValueType } from "recharts/types/component/DefaultTooltipContent";
import { ChartTooltipRenderValueArguments } from "@/shared/Charts/ChartTooltipContent/ChartTooltipContent";
import {
  calculateIntervalType,
  calculateIntervalStartAndEnd,
} from "@/v2/pages-shared/traces/MetricDateRangeSelect/utils";
import { DateRangeValue } from "@/shared/DateRangeSelect";

type MetricCardDef = {
  type: KpiMetricType;
  icon: LucideIcon;
  label: string;
  formatter: (value: number) => string;
  trend: PercentageTrendType;
};

const METRIC_CARDS: MetricCardDef[] = [
  {
    type: "count",
    icon: Braces,
    label: "",
    formatter: (v) => v.toLocaleString(),
    trend: "direct",
  },
  {
    type: "errors",
    icon: AlertTriangle,
    label: "Error rate",
    formatter: (v) => `${v.toFixed(1)}%`,
    trend: "inverted",
  },
  {
    type: "avg_duration",
    icon: Clock,
    label: "Avg duration",
    formatter: formatDuration,
    trend: "inverted",
  },
  {
    type: "total_cost",
    icon: Coins,
    label: "Total cost",
    formatter: (v) => formatCost(v, { noValue: "$0" }),
    trend: "inverted",
  },
];

type ChartMetricConfig = {
  metricName: METRIC_NAME_TYPE;
  chartType: CHART_TYPE.line | CHART_TYPE.bar;
  customYTickFormatter?: (value: number, maxDecimalLength?: number) => string;
  renderValue?: (data: ChartTooltipRenderValueArguments) => ValueType;
  colorMap?: Record<string, string>;
  filterLineCallback?: (lineName: string) => boolean;
  labelsMap?: Record<string, string>;
};

const CHART_GREEN = "var(--chart-green)";
const CHART_RED = "var(--chart-red)";
const CHART_BLUE = "var(--chart-blue)";

const COUNT_METRIC_MAP: Record<KpiEntityType, METRIC_NAME_TYPE> = {
  traces: METRIC_NAME_TYPE.TRACE_COUNT,
  spans: METRIC_NAME_TYPE.SPAN_COUNT,
  threads: METRIC_NAME_TYPE.THREAD_COUNT,
};

const AVG_DURATION_LINE_NAME_MAP: Record<KpiEntityType, string> = {
  traces: "trace_average_duration",
  spans: "span_average_duration",
  threads: "thread_average_duration",
};

const AVG_DURATION_METRIC_MAP: Record<KpiEntityType, METRIC_NAME_TYPE> = {
  traces: METRIC_NAME_TYPE.TRACE_AVERAGE_DURATION,
  spans: METRIC_NAME_TYPE.SPAN_AVERAGE_DURATION,
  threads: METRIC_NAME_TYPE.THREAD_AVERAGE_DURATION,
};

const getChartConfig = (
  kpiType: KpiMetricType,
  entityType: KpiEntityType,
): ChartMetricConfig => {
  switch (kpiType) {
    case "count":
      return {
        metricName: COUNT_METRIC_MAP[entityType],
        chartType: CHART_TYPE.bar,
        colorMap: { [entityType]: CHART_GREEN },
      };
    case "errors":
      return {
        metricName: COUNT_METRIC_MAP[entityType],
        chartType: CHART_TYPE.bar,
        colorMap: { [entityType]: CHART_RED },
      };
    case "avg_duration":
      return {
        metricName: AVG_DURATION_METRIC_MAP[entityType],
        chartType: CHART_TYPE.line,
        customYTickFormatter: durationYTickFormatter,
        renderValue: renderDurationTooltipValue,
        colorMap: { [AVG_DURATION_LINE_NAME_MAP[entityType]]: CHART_GREEN },
      };
    case "total_cost":
      return {
        metricName: METRIC_NAME_TYPE.COST,
        chartType: CHART_TYPE.bar,
        customYTickFormatter: costYTickFormatter,
        renderValue: renderCostTooltipValue,
        colorMap: { cost: CHART_BLUE },
      };
  }
};

const computePercentageChange = (
  current: number | null,
  previous: number | null,
): number | undefined => {
  if (current === null || previous === null) return undefined;
  if (previous === 0) return current === 0 ? 0 : current > 0 ? Infinity : -Infinity;
  if (current === 0) return -100;
  return ((current - previous) / previous) * 100;
};

type MetricCardProps = {
  icon: LucideIcon;
  label: string;
  value: string;
  currentRaw?: number | null;
  previousRaw?: number | null;
  trend: PercentageTrendType;
  selected?: boolean;
  onClick?: () => void;
};

const MetricCard: React.FC<MetricCardProps> = ({
  icon: Icon,
  label,
  value,
  currentRaw,
  previousRaw,
  trend,
  selected = false,
  onClick,
}) => {
  const percentage = computePercentageChange(
    currentRaw ?? null,
    previousRaw ?? null,
  );

  const renderChange = () => {
    if (percentage === undefined) return null;
    if (percentage === 0) {
      return (
        <span className="text-xs text-muted-foreground">No changes</span>
      );
    }

    const isUp = percentage > 0;
    const isBetter =
      trend === "direct" ? isUp : !isUp;
    const ChangeIcon = isUp ? ArrowUp : ArrowDown;
    const colorClass = isBetter ? "text-primary" : "text-chart-red";
    const displayValue = isFinite(percentage)
      ? `${Math.abs(percentage).toFixed(1)}%`
      : "";

    return (
      <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium", colorClass)}>
        <ChangeIcon className="size-3" />
        {displayValue}
      </span>
    );
  };

  return (
    <div
      className={cn(
        "-mr-px flex cursor-pointer items-center justify-between border bg-white px-4 py-3 transition-colors hover:bg-muted/30",
        selected && "border-b-2 border-b-primary",
      )}
      onClick={onClick}
    >
      <div className="flex items-center gap-3">
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <div className="flex items-center gap-2">
          <span className="comet-body-s text-muted-foreground">{label}</span>
          <span className="comet-body-s-accented">{value}</span>
          {renderChange()}
        </div>
      </div>
    </div>
  );
};

const MetricCardSkeleton: React.FC = () => (
  <div className="-mr-px flex items-center gap-3 border bg-white px-4 py-3">
    <Skeleton className="size-4 shrink-0" />
    <div className="flex items-baseline gap-2">
      <Skeleton className="h-4 w-16" />
      <Skeleton className="h-4 w-12" />
    </div>
  </div>
);

const REFETCH_INTERVAL = 30000;

export type MetricsSummaryProps = {
  projectId: string;
  entityType: KpiEntityType;
  countLabel: string;
  filters?: Filters;
  intervalStart?: string;
  intervalEnd?: string;
  dateRange: DateRangeValue;
};

const MetricsSummary: React.FC<MetricsSummaryProps> = ({
  projectId,
  entityType,
  countLabel,
  filters,
  intervalStart,
  intervalEnd,
  dateRange,
}) => {
  const [selectedMetric, setSelectedMetric] = useState<KpiMetricType>("count");

  const { data, isPending } = useProjectKpiCards(
    {
      projectId,
      entityType,
      filters,
      intervalStart,
      intervalEnd,
    },
    {
      refetchInterval: REFETCH_INTERVAL,
    },
  );

  const metricsMap = useMemo(() => {
    const map = new Map<KpiMetricType, KpiMetric>();
    data?.stats?.forEach((s) => map.set(s.type, s));
    return map;
  }, [data?.stats]);

  const chartIntervalConfig = useMemo(() => {
    const interval = calculateIntervalType(dateRange);
    const { intervalStart: chartStart, intervalEnd: chartEnd } =
      calculateIntervalStartAndEnd(dateRange);
    return { interval, intervalStart: chartStart, intervalEnd: chartEnd };
  }, [dateRange]);

  const chartConfig = useMemo(
    () => getChartConfig(selectedMetric, entityType),
    [selectedMetric, entityType],
  );

  const chartFilters = useMemo(() => {
    if (entityType === "threads") return { threadFilters: filters };
    if (entityType === "spans") return { spanFilters: filters };
    return { traceFilters: filters };
  }, [entityType, filters]);

  const handleSelectMetric = useCallback(
    (type: KpiMetricType) => setSelectedMetric(type),
    [],
  );

  if (isPending) {
    return (
      <div>
        <div className="grid grid-cols-4">
          <MetricCardSkeleton />
          <MetricCardSkeleton />
          <MetricCardSkeleton />
          <MetricCardSkeleton />
        </div>
        <div className="flex h-20 items-center justify-center border bg-white">
          <Skeleton className="mx-6 h-14 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-4">
        {METRIC_CARDS.map((card) => {
          const metric = metricsMap.get(card.type);
          const currentValue = metric?.current_value;
          const value =
            currentValue !== null && currentValue !== undefined
              ? card.formatter(currentValue)
              : "-";
          const label = card.type === "count" ? countLabel : card.label;

          return (
            <MetricCard
              key={card.type}
              icon={card.icon}
              label={label}
              value={value}
              currentRaw={metric?.current_value}
              previousRaw={metric?.previous_value}
              trend={card.trend}
              selected={selectedMetric === card.type}
              onClick={() => handleSelectMetric(card.type)}
            />
          );
        })}
      </div>
      <div
        className="border bg-white p-4"
        style={{ "--chart-height": "80px" } as React.CSSProperties}
      >
        <MetricContainerChart
          name=""
          description=""
          chartType={chartConfig.chartType}
          projectId={projectId}
          interval={chartIntervalConfig.interval}
          intervalStart={chartIntervalConfig.intervalStart}
          intervalEnd={chartIntervalConfig.intervalEnd}
          metricName={chartConfig.metricName}
          customYTickFormatter={chartConfig.customYTickFormatter}
          renderValue={chartConfig.renderValue}
          chartId={`kpi-chart-${selectedMetric}`}
          chartOnly
          showLegend={false}
          colorMap={chartConfig.colorMap}
          filterLineCallback={chartConfig.filterLineCallback}
          labelsMap={chartConfig.labelsMap}
          {...chartFilters}
        />
      </div>
    </div>
  );
};

export default MetricsSummary;
