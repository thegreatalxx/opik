import React, { useEffect, useRef } from "react";
import embed, { type Result } from "vega-embed";
import type { Config as VlConfig } from "vega-lite";

const OPIK_CHART_PALETTE = [
  "#6366f1", // primary (indigo)
  "#3b82f6", // blue
  "#8b5cf6", // purple
  "#06b6d4", // turquoise
  "#10b981", // green
  "#f97316", // orange
  "#eab308", // yellow
  "#f43f5e", // pink
  "#ef4444", // red
  "#bf399e", // burgundy
  "#64748b", // gray
];

const OPIK_VEGA_CONFIG: VlConfig = {
  background: "transparent",
  font: "Inter, sans-serif",
  padding: { top: 10, right: 10, bottom: 10, left: 10 },
  title: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: 400,
    anchor: "start",
    offset: 12,
  },
  axis: {
    domain: false,
    ticks: false,
    grid: false,
    labelColor: "#94a3b8",
    labelFontSize: 10,
    labelFontWeight: 300,
    labelPadding: 8,
    titleColor: "#94a3b8",
    titleFontSize: 10,
    titleFontWeight: 400,
    titlePadding: 12,
  },
  axisY: {
    grid: true,
    gridColor: "#f1f5f9",
    gridDash: [2, 4],
  },
  range: {
    category: OPIK_CHART_PALETTE,
  },
  mark: {
    color: "#6366f1",
  },
  bar: {
    color: "#6366f1",
    cornerRadiusEnd: 2,
    opacity: 0.85,
  },
  line: {
    color: "#6366f1",
    strokeWidth: 1.5,
    strokeCap: "round",
  },
  point: {
    color: "#6366f1",
    size: 30,
    filled: true,
    opacity: 0.8,
  },
  area: {
    color: "#6366f1",
    opacity: 0.15,
    line: { strokeWidth: 1.5 },
  },
  legend: {
    disable: false,
    labelColor: "#94a3b8",
    titleColor: "#94a3b8",
    labelFontSize: 10,
    labelFontWeight: 300,
    symbolSize: 60,
    orient: "bottom",
    direction: "horizontal",
  },
  view: {
    stroke: "transparent",
  },
};

type Props = {
  spec: Record<string, unknown>;
};

const OllieAssistChartResult: React.FC<Props> = ({ spec }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<Result | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    let cancelled = false;

    const landscapeSpec = {
      ...spec,
      width: "container",
      height: 200,
      autosize: { type: "fit", contains: "padding" },
    };

    embed(containerRef.current, landscapeSpec as Parameters<typeof embed>[1], {
      actions: false,
      renderer: "svg",
      config: OPIK_VEGA_CONFIG as Record<string, unknown>,
    }).then((result) => {
      if (cancelled) {
        result.finalize();
      } else {
        resultRef.current = result;
      }
    });

    return () => {
      cancelled = true;
      resultRef.current?.finalize();
      resultRef.current = null;
    };
  }, [spec]);

  return (
    <div
      ref={containerRef}
      className="w-full overflow-hidden rounded p-2"
    />
  );
};

export default OllieAssistChartResult;
