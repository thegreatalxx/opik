import React, { type ReactNode } from "react";
import { CircleCheck, CircleX } from "lucide-react";

import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/ui/popover";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/ui/accordion";
import { AssertionResult } from "@/types/datasets";

type AssertionsBreakdownTooltipProps = {
  children: ReactNode;
  assertionsByRun: AssertionResult[][];
};

export const AssertionsBreakdownTooltip: React.FC<
  AssertionsBreakdownTooltipProps
> = ({ children, assertionsByRun }) => {
  if (assertionsByRun.length === 0 || assertionsByRun[0].length === 0) {
    return <>{children}</>;
  }

  const defaultOpenIdx = assertionsByRun.findIndex((run) =>
    run.some((a) => !a.passed),
  );
  const defaultValue = `run-${defaultOpenIdx >= 0 ? defaultOpenIdx : 0}`;

  return (
    <Popover>
      <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
        {children}
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        collisionPadding={16}
        className="w-80 p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="max-h-96 overflow-y-auto">
          <Accordion type="single" defaultValue={defaultValue} collapsible>
            {assertionsByRun.map((run, runIdx) => {
              const passedCount = run.filter((a) => a.passed).length;
              const allPassed = passedCount === run.length;
              return (
                <AccordionItem
                  key={runIdx}
                  value={`run-${runIdx}`}
                  className="last:border-b-0"
                >
                  <AccordionTrigger className="h-auto px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="comet-body-xs-accented text-foreground">
                        Run {runIdx + 1}
                      </span>
                      <div className="flex items-center gap-1">
                        {allPassed ? (
                          <CircleCheck className="size-3.5 shrink-0 text-success" />
                        ) : (
                          <CircleX className="size-3.5 shrink-0 text-destructive" />
                        )}
                        <span
                          className={cn(
                            "comet-body-xs",
                            allPassed ? "text-success" : "text-destructive",
                          )}
                        >
                          {passedCount}/{run.length} assertions passed
                        </span>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="bg-muted/50 p-0">
                    {run.map((assertion, aIdx) => (
                      <div key={aIdx} className="flex gap-2 px-3 py-2">
                        {assertion.passed ? (
                          <CircleCheck className="mt-0.5 size-3.5 shrink-0 text-success" />
                        ) : (
                          <CircleX className="mt-0.5 size-3.5 shrink-0 text-destructive" />
                        )}
                        <div className="flex flex-col gap-0.5">
                          <p className="comet-body-xs text-foreground">
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
          </Accordion>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default AssertionsBreakdownTooltip;
