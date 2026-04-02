import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Eye,
  Lock,
  Settings2,
  Terminal,
  Wand2,
  ExternalLink,
} from "lucide-react";
import { Link, useParams } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { Button } from "@/ui/button";
import { Tag } from "@/ui/tag";
import type { OnboardingState } from "./useOnboardingState";

const Code: React.FunctionComponent<{ children: React.ReactNode }> = ({
  children,
}) => (
  <code className="comet-code rounded bg-muted px-1 py-0.5">{children}</code>
);

type FlywheelItem = {
  title: string;
  icon: React.FunctionComponent<{ className?: string }>;
  desc: string;
  steps: React.ReactNode[];
  cta: string;
  route: string;
};

const FLYWHEEL_ITEMS: FlywheelItem[] = [
  {
    title: "Observability",
    icon: Eye,
    desc: "See every LLM call, latency, token cost, and error in real time. The foundation for everything else \u2014 without traces, there\u2019s nothing to optimize.",
    steps: [
      <>
        Install the SDK: <Code>pip install opik</Code>
      </>,
      <>
        Add the <Code>@track</Code> decorator to your agent function
      </>,
      <>
        Set your <Code>OPIK_API_KEY</Code> environment variable
      </>,
      <>Run your agent {"\u2014"} traces appear automatically</>,
    ],
    cta: "View integration guide",
    route: "/$workspaceName/get-started",
  },
  {
    title: "Agent configuration",
    icon: Settings2,
    desc: "Decouple prompts, model parameters, and logic from your code. Opik becomes the single source of truth for your agent\u2019s configuration \u2014 enabling remote updates and versioning without redeploys.",
    steps: [
      <>Open the Config Library in your Opik dashboard</>,
      <>
        Create a configuration item (prompt, temperature, model, tools{"\u2026"}
        )
      </>,
      <>
        Tag your active version as <Code>production</Code>
      </>,
      <>Fetch the configuration in your agent at runtime via the SDK</>,
    ],
    cta: "Set up config library",
    route: "/$workspaceName/projects/$projectId/agent-configuration",
  },
  {
    title: "Local runner",
    icon: Terminal,
    desc: "Lets Opik trigger your agent programmatically with different configurations and measure the quality of each response. This enables automated experiments without you lifting a finger.",
    steps: [
      <>
        Install the Opik CLI: <Code>pip install opik</Code>
      </>,
      <>
        Pair your local agent using <Code>opik connect --pair [CODE]</Code>
      </>,
      <>Opik starts your app and intercepts its configuration calls</>,
      <>Confirm the pairing in your dashboard under Experiments</>,
    ],
    cta: "Connect local runner",
    route: "/$workspaceName/projects/$projectId/agent-runner",
  },
  {
    title: "Optimizer",
    icon: Wand2,
    desc: "With all components connected, Opik runs automated experiments \u2014 trying different configurations via the Local Runner, measuring outcomes, and publishing the best-performing version as the new production configuration.",
    steps: [
      <>All 3 previous components must be connected first</>,
      <>Define an evaluation metric (e.g. answer relevance, task completion)</>,
      <>
        Click <Code>Start optimization</Code> in the Opik dashboard
      </>,
      <>Opik deploys the winning config version automatically</>,
    ],
    cta: "Unlock optimizer",
    route: "/$workspaceName/projects/$projectId/optimizations",
  },
];

// SVG coordinate system: center at (220, 180), ring radius 100
// viewBox wide enough (440x370) so side labels are never clipped
const SVG_CENTER_X = 220;
const SVG_CENTER_Y = 180;
const RING_RADIUS = 100;

const NODE_LABELS = [
  "Observability",
  "Agent config",
  "Local runner",
  "Optimizer",
];

const NODE_POSITIONS = [
  // Top — Observability
  {
    cx: SVG_CENTER_X,
    cy: SVG_CENTER_Y - RING_RADIUS,
    labelX: SVG_CENTER_X,
    labelY: SVG_CENTER_Y - RING_RADIUS - 28,
    anchor: "middle" as const,
  },
  // Right — Agent config
  {
    cx: SVG_CENTER_X + RING_RADIUS,
    cy: SVG_CENTER_Y,
    labelX: SVG_CENTER_X + RING_RADIUS + 28,
    labelY: SVG_CENTER_Y + 5,
    anchor: "start" as const,
  },
  // Bottom — Local runner
  {
    cx: SVG_CENTER_X,
    cy: SVG_CENTER_Y + RING_RADIUS,
    labelX: SVG_CENTER_X,
    labelY: SVG_CENTER_Y + RING_RADIUS + 34,
    anchor: "middle" as const,
  },
  // Left — Optimizer
  {
    cx: SVG_CENTER_X - RING_RADIUS,
    cy: SVG_CENTER_Y,
    labelX: SVG_CENTER_X - RING_RADIUS - 28,
    labelY: SVG_CENTER_Y + 5,
    anchor: "end" as const,
  },
];

const NODE_ANGLES = [-90, 0, 90, 180];

const FlywheelRing: React.FunctionComponent<{
  connectedIndices: number[];
  nextIndex: number;
  onNodeClick: (index: number) => void;
}> = ({ connectedIndices, nextIndex, onNodeClick }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const animRef = useRef<number>(0);
  const n = connectedIndices.length;

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || n === 0) return;
    const particle = svg.querySelector(
      "#flywheel-particle",
    ) as SVGCircleElement | null;
    if (!particle) return;

    const r = RING_RADIUS;
    const cx = SVG_CENTER_X;
    const cy = SVG_CENTER_Y;
    const stopAngle = n >= 4 ? null : NODE_ANGLES[n];
    let angle = -90;
    let pausing = false;
    let pauseStart = 0;

    function tick(ts: number) {
      if (pausing) {
        if (ts - pauseStart > 1000) {
          pausing = false;
          angle = -90;
          particle!.setAttribute("opacity", "1");
        }
        animRef.current = requestAnimationFrame(tick);
        return;
      }
      angle += 1.5;
      const rad = (angle * Math.PI) / 180;
      particle!.setAttribute("cx", String(cx + r * Math.cos(rad)));
      particle!.setAttribute("cy", String(cy + r * Math.sin(rad)));
      particle!.setAttribute("opacity", "1");

      if (n >= 4) {
        if (angle >= 270) angle = -90;
      } else if (stopAngle !== null && angle >= stopAngle) {
        particle!.setAttribute("opacity", "0");
        pausing = true;
        pauseStart = ts;
      }
      animRef.current = requestAnimationFrame(tick);
    }

    animRef.current = requestAnimationFrame(tick);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [n]);

  return (
    <div className="flex flex-col items-center">
      <svg ref={svgRef} viewBox="0 40 440 280" className="w-full">
        {/* Track ring */}
        <circle
          cx={SVG_CENTER_X}
          cy={SVG_CENTER_Y}
          r={RING_RADIUS}
          fill="none"
          className="stroke-border"
          strokeWidth="12"
        />
        {/* Arc segments — circumference ≈ 628, each arc ≈ 140 with 17 gap */}
        {[0, 1, 2, 3].map((i) => (
          <circle
            key={i}
            cx={SVG_CENTER_X}
            cy={SVG_CENTER_Y}
            r={RING_RADIUS}
            fill="none"
            className="stroke-primary"
            strokeWidth="12"
            strokeLinecap="butt"
            strokeDasharray="140 488"
            strokeDashoffset={157 - i * 157}
            opacity={connectedIndices.includes(i) ? 1 : 0.08}
            style={{ transition: "opacity 0.5s" }}
          />
        ))}
        {/* Traveling particle */}
        <circle
          id="flywheel-particle"
          cx={SVG_CENTER_X}
          cy={SVG_CENTER_Y - RING_RADIUS}
          r="6"
          className="fill-background stroke-primary"
          strokeWidth="2"
          opacity="0"
        />

        {/* Nodes */}
        {FLYWHEEL_ITEMS.map((item, i) => {
          const pos = NODE_POSITIONS[i];
          const isConnected = connectedIndices.includes(i);
          const isNext = i === nextIndex;
          const nodeOpacity = isConnected ? 1 : isNext ? 0.5 : 0.2;
          const iconOpacity = isConnected ? 1 : 0.3;
          const labelOpacity = isConnected || isNext ? 1 : 0.3;

          return (
            <g
              key={i}
              className="cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                onNodeClick(i);
              }}
            >
              <circle
                cx={pos.cx}
                cy={pos.cy}
                r="20"
                className="fill-background stroke-primary"
                strokeWidth="1.5"
                opacity={nodeOpacity}
              />
              <foreignObject
                x={pos.cx - 10}
                y={pos.cy - 10}
                width="20"
                height="20"
                opacity={iconOpacity}
              >
                <item.icon className="size-5 text-primary" />
              </foreignObject>
              <text
                x={pos.labelX}
                y={pos.labelY}
                textAnchor={pos.anchor}
                fontSize="12"
                fontWeight="600"
                className="fill-primary"
                opacity={labelOpacity}
              >
                {NODE_LABELS[i]}
              </text>
              {isNext && (
                <circle
                  cx={pos.cx}
                  cy={pos.cy}
                  r="6"
                  className="fill-primary"
                  opacity="0.2"
                >
                  <animate
                    attributeName="r"
                    values="6;14;6"
                    dur="1.5s"
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    values="0.3;0;0.3"
                    dur="1.5s"
                    repeatCount="indefinite"
                  />
                </circle>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};

interface StepCardProps {
  item: FlywheelItem;
  isConnected: boolean;
  isNext: boolean;
  isOpen: boolean;
  onToggle: () => void;
  workspaceName: string;
  projectId: string;
}

const StepCard: React.FunctionComponent<StepCardProps> = ({
  item,
  isConnected,
  isNext,
  isOpen,
  onToggle,
  workspaceName,
  projectId,
}) => {
  const isLocked = !isConnected && !isNext;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-md border",
        isNext && "border-primary bg-primary-100/40",
        isConnected && "border-l-[3px] border-l-[var(--tag-green-text)]",
        !isNext && !isConnected && "border-border",
      )}
    >
      <button
        className="flex w-full items-center gap-2 px-4 py-2.5"
        onClick={onToggle}
      >
        <span
          className={cn(
            "comet-body-accented flex-1 text-left",
            isLocked ? "text-muted-slate" : "text-foreground",
          )}
        >
          {item.title}
        </span>
        {isLocked ? (
          <Lock className="size-3.5 shrink-0 text-muted-slate" />
        ) : (
          <Tag variant={isConnected ? "green" : "primary"} size="default">
            {isConnected ? "Connected" : "Connect next"}
          </Tag>
        )}
        {isOpen ? (
          <ChevronUp className="size-3.5 shrink-0 text-muted-slate" />
        ) : (
          <ChevronDown className="size-3.5 shrink-0 text-muted-slate" />
        )}
      </button>
      {isOpen && (
        <div className="px-4 pb-4">
          <p className="comet-body-s mb-3 leading-relaxed text-muted-slate">
            {item.desc}
          </p>
          <ul className="mb-4 flex flex-col gap-1.5">
            {item.steps.map((step, j) => (
              <li
                key={j}
                className="comet-body-s relative pl-4 leading-relaxed text-muted-slate"
              >
                <span className="absolute left-0 top-[9px] size-1.5 rounded-full bg-primary opacity-40" />
                {step}
              </li>
            ))}
          </ul>
          <Link to={item.route} params={{ workspaceName, projectId }}>
            <Button variant="outline" size="sm">
              {item.cta}
              <ExternalLink className="ml-1.5 size-3.5" />
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
};

interface OpikConnectFlywheelProps {
  connectionState: OnboardingState;
}

const OpikConnectFlywheel: React.FunctionComponent<
  OpikConnectFlywheelProps
> = ({ connectionState }) => {
  const [expanded, setExpanded] = useState<number | null | "none">("none");
  const { workspaceName, projectId } = useParams({ strict: false }) as {
    workspaceName: string;
    projectId: string;
  };

  const connectedIndices = connectionState
    .map((v, i) => (v ? i : -1))
    .filter((v) => v >= 0);
  const nextIndex = connectionState.indexOf(false);

  const toggleCard = useCallback((index: number) => {
    setExpanded((prev) => (prev === index ? "none" : index));
  }, []);

  return (
    <div className="grid grid-cols-[minmax(280px,2fr)_minmax(0,3fr)] gap-6 rounded-lg border bg-background p-6">
      <FlywheelRing
        connectedIndices={connectedIndices}
        nextIndex={nextIndex}
        onNodeClick={toggleCard}
      />

      <div className="flex flex-col gap-1.5">
        {FLYWHEEL_ITEMS.map((item, i) => {
          const isConnected = connectedIndices.includes(i);
          const isNext = i === nextIndex;
          const isOpen = expanded === i;

          return (
            <StepCard
              key={i}
              item={item}
              isConnected={isConnected}
              isNext={isNext}
              isOpen={isOpen}
              onToggle={() => toggleCard(i)}
              workspaceName={workspaceName}
              projectId={projectId}
            />
          );
        })}
      </div>
    </div>
  );
};

export default OpikConnectFlywheel;
