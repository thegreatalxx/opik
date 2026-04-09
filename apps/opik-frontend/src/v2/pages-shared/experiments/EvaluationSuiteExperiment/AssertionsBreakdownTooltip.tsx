import React, { type ReactNode, useCallback, useMemo, useRef } from "react";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { ChevronDown, CircleCheck, CircleX } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/ui/hover-card";
import { Accordion, AccordionContent, AccordionItem } from "@/ui/accordion";
import { AssertionResult } from "@/types/datasets";

type AssertionsBreakdownTooltipProps = {
  children: ReactNode;
  assertionsByRun: AssertionResult[][];
};

export const AssertionsBreakdownTooltip: React.FC<
  AssertionsBreakdownTooltipProps
> = ({ children, assertionsByRun }) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scrollToRun = useCallback((idx: number) => {
    requestAnimationFrame(() => {
      const container = scrollContainerRef.current;
      if (!container) return;
      const item = container.querySelector(
        `[data-run-idx="${idx}"]`,
      ) as HTMLElement | null;
      if (item) {
        const containerTop = container.getBoundingClientRect().top;
        const itemTop = item.getBoundingClientRect().top;
        container.scrollTop += itemTop - containerTop;
      }
    });
  }, []);

  const defaultOpenIdx = useMemo(
    () => assertionsByRun.findIndex((run) => run.some((a) => !a.passed)),
    [assertionsByRun],
  );

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (open) scrollToRun(defaultOpenIdx >= 0 ? defaultOpenIdx : 0);
    },
    [defaultOpenIdx, scrollToRun],
  );

  const handleValueChange = useCallback(
    (value: string) => {
      const idx = parseInt(value.replace("run-", ""), 10);
      if (!isNaN(idx)) scrollToRun(idx);
    },
    [scrollToRun],
  );

  if (assertionsByRun.length === 0 || assertionsByRun[0].length === 0) {
    return <>{children}</>;
  }

  const defaultValue = `run-${defaultOpenIdx >= 0 ? defaultOpenIdx : 0}`;

  return (
    <HoverCard
      openDelay={200}
      closeDelay={500}
      onOpenChange={handleOpenChange}
    >
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent
        side="bottom"
        align="start"
        collisionPadding={16}
        className="w-80 p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <Accordion
          type="single"
          defaultValue={defaultValue}
          collapsible
          onValueChange={handleValueChange}
        >
          <div ref={scrollContainerRef} className="max-h-96 overflow-y-auto">
            {assertionsByRun.map((run, runIdx) => {
              const passedCount = run.filter((a) => a.passed).length;
              const allPassed = passedCount === run.length;
              return (
                <AccordionItem
                  key={runIdx}
                  value={`run-${runIdx}`}
                  className="last:border-b-0"
                  data-run-idx={runIdx}
                >
                  <AccordionPrimitive.Header className="sticky top-0 z-10 flex bg-background">
                    <AccordionPrimitive.Trigger className="flex flex-1 items-center justify-between px-3 py-2 outline-none focus-visible:ring-1 focus-visible:ring-ring [&[data-state=open]>svg:last-child]:rotate-180">
                      <div className="flex items-center gap-2">
                        <span className="comet-body-xs-accented text-foreground">
                          Run {runIdx + 1}
                        </span>
                        <div
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full border border-transparent px-2 py-0.5 font-mono text-xs font-normal",
                            allPassed
                              ? "bg-success/15 text-success"
                              : "bg-destructive/15 text-destructive",
                          )}
                        >
                          {allPassed ? (
                            <CircleCheck className="size-3 shrink-0" />
                          ) : (
                            <CircleX className="size-3 shrink-0" />
                          )}
                          {passedCount}/{run.length} assertions passed
                        </div>
                      </div>
                      <ChevronDown className="size-4 shrink-0 transition-transform duration-200" />
                    </AccordionPrimitive.Trigger>
                  </AccordionPrimitive.Header>
                  <AccordionContent className="p-0">
                    {run.map((assertion, aIdx) => (
                      <div key={aIdx} className="flex gap-2 px-3 py-2">
                        {assertion.passed ? (
                          <CircleCheck className="mt-0.5 size-3.5 shrink-0 text-success" />
                        ) : (
                          <CircleX className="mt-0.5 size-3.5 shrink-0 text-destructive" />
                        )}
                        <div className="flex flex-col gap-0.5">
                          <p className="comet-body-xs-accented text-foreground">
                            {assertion.value}
                          </p>
                          {assertion.reason && (
                            <p className="comet-body-xs text-muted-slate">
                              {assertion.reason}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </div>
        </Accordion>
      </HoverCardContent>
    </HoverCard>
  );
};

export default AssertionsBreakdownTooltip;
