import React from "react";
import { Braces, AlertTriangle, Clock, Coins } from "lucide-react";
import { formatDuration } from "@/lib/date";
import { formatCost } from "@/lib/money";
import MetricCard from "@/v2/pages-shared/traces/MetricsSummary/MetricCard";

const TestCard: React.FC<
  React.ComponentProps<typeof MetricCard> & { description: string }
> = ({ description, ...props }) => (
  <div>
    <MetricCard {...props} />
    <div className="px-4 py-1 text-xs">
      <span className="text-foreground">previous: </span>
      <span className="text-muted-foreground">
        {props.previousRaw ?? "null"}
      </span>
      <span className="text-foreground"> → current: </span>
      <span className="text-muted-foreground">
        {props.currentRaw ?? "null"}
      </span>
    </div>
  </div>
);

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <div className="mb-8">
    <h2 className="comet-title-m mb-3">{title}</h2>
    <div className="grid grid-cols-4">{children}</div>
  </div>
);

const KpiCardsTestPage: React.FC = () => {
  return (
    <div className="p-8">
      <h1 className="comet-title-l mb-6">KPI Cards - All Cases</h1>

      <Section title="1. No changes (current = previous)">
        <TestCard
          description="count equal"
          icon={Braces}
          label="Traces"
          value="1,250"
          currentRaw={1250}
          previousRaw={1250}
          trend="direct"
        />
        <TestCard
          description="errors equal"
          icon={AlertTriangle}
          label="Error rate"
          value="3.2%"
          currentRaw={3.2}
          previousRaw={3.2}
          trend="inverted"
        />
        <TestCard
          description="duration equal"
          icon={Clock}
          label="Avg duration"
          value={formatDuration(0.45)}
          currentRaw={0.45}
          previousRaw={0.45}
          trend="inverted"
        />
        <TestCard
          description="cost equal"
          icon={Coins}
          label="Total cost"
          value={formatCost(12.5, { noValue: "$0" })}
          currentRaw={12.5}
          previousRaw={12.5}
          trend="inverted"
        />
      </Section>

      <Section title="2. Changes going up">
        <TestCard
          description="count up"
          icon={Braces}
          label="Traces"
          value="1,800"
          currentRaw={1800}
          previousRaw={1200}
          trend="direct"
        />
        <TestCard
          description="errors up"
          icon={AlertTriangle}
          label="Error rate"
          value="5.1%"
          currentRaw={5.1}
          previousRaw={2.3}
          trend="inverted"
        />
        <TestCard
          description="duration up"
          icon={Clock}
          label="Avg duration"
          value={formatDuration(0.82)}
          currentRaw={0.82}
          previousRaw={0.45}
          trend="inverted"
        />
        <TestCard
          description="cost up"
          icon={Coins}
          label="Total cost"
          value={formatCost(25.0, { noValue: "$0" })}
          currentRaw={25.0}
          previousRaw={12.5}
          trend="inverted"
        />
      </Section>

      <Section title="3. Changes going down">
        <TestCard
          description="count down"
          icon={Braces}
          label="Traces"
          value="800"
          currentRaw={800}
          previousRaw={1500}
          trend="direct"
        />
        <TestCard
          description="errors down"
          icon={AlertTriangle}
          label="Error rate"
          value="1.2%"
          currentRaw={1.2}
          previousRaw={4.8}
          trend="inverted"
        />
        <TestCard
          description="duration down"
          icon={Clock}
          label="Avg duration"
          value={formatDuration(0.21)}
          currentRaw={0.21}
          previousRaw={0.65}
          trend="inverted"
        />
        <TestCard
          description="cost down"
          icon={Coins}
          label="Total cost"
          value={formatCost(5.3, { noValue: "$0" })}
          currentRaw={5.3}
          previousRaw={18.7}
          trend="inverted"
        />
      </Section>

      <Section title="4. No previous data (null)">
        <TestCard
          description="no previous"
          icon={Braces}
          label="Traces"
          value="500"
          currentRaw={500}
          previousRaw={null}
          trend="direct"
        />
        <TestCard
          description="no previous"
          icon={AlertTriangle}
          label="Error rate"
          value="2.0%"
          currentRaw={2.0}
          previousRaw={null}
          trend="inverted"
        />
        <TestCard
          description="no previous"
          icon={Clock}
          label="Avg duration"
          value={formatDuration(0.33)}
          currentRaw={0.33}
          previousRaw={null}
          trend="inverted"
        />
        <TestCard
          description="no previous"
          icon={Coins}
          label="Total cost"
          value={formatCost(8.0, { noValue: "$0" })}
          currentRaw={8.0}
          previousRaw={null}
          trend="inverted"
        />
      </Section>

      <Section title="5. Edge cases">
        <TestCard
          description="from zero"
          icon={Braces}
          label="From zero"
          value="100"
          currentRaw={100}
          previousRaw={0}
          trend="direct"
        />
        <TestCard
          description="to zero"
          icon={AlertTriangle}
          label="To zero"
          value="0.0%"
          currentRaw={0}
          previousRaw={5.0}
          trend="inverted"
        />
        <TestCard
          description="large increase"
          icon={Clock}
          label="Large increase"
          value={formatDuration(10.5)}
          currentRaw={10.5}
          previousRaw={0.1}
          trend="inverted"
        />
        <TestCard
          description="tiny change"
          icon={Coins}
          label="Tiny change"
          value={formatCost(12.51, { noValue: "$0" })}
          currentRaw={12.51}
          previousRaw={12.5}
          trend="inverted"
        />
      </Section>
    </div>
  );
};

export default KpiCardsTestPage;
