import React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

type CollapsibleBlockProps = {
  label?: React.ReactNode;
  collapsible: boolean;
  expanded: boolean;
  onToggle: () => void;
  active?: boolean;
  tone?: "muted" | "white";
  children: React.ReactNode;
  testId?: string;
};

const CollapsibleBlock: React.FC<CollapsibleBlockProps> = ({
  label,
  collapsible,
  expanded,
  onToggle,
  active,
  tone = "muted",
  children,
  testId,
}) => {
  const isOpen = !collapsible || expanded;
  const hasHeader = collapsible || label !== undefined;

  return (
    <div
      className={cn(
        "rounded-md border focus-within:border-primary",
        tone === "white" ? "bg-background" : "bg-primary-foreground",
        active && "border-primary",
      )}
      data-testid={testId}
    >
      {hasHeader && (
        <div
          className={cn(
            "flex items-center gap-1 px-3 py-2",
            collapsible && "cursor-pointer select-none",
          )}
          onClick={collapsible ? onToggle : undefined}
          role={collapsible ? "button" : undefined}
          tabIndex={collapsible ? 0 : undefined}
          onKeyDown={
            collapsible
              ? (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onToggle();
                  }
                }
              : undefined
          }
        >
          {collapsible &&
            (isOpen ? (
              <ChevronDown className="size-3.5 shrink-0 text-light-slate" />
            ) : (
              <ChevronRight className="size-3.5 shrink-0 text-light-slate" />
            ))}
          {label && (
            <span
              className={cn(
                "comet-body-xs-accented truncate",
                isOpen ? "text-foreground" : "text-muted-slate",
              )}
            >
              {label}
            </span>
          )}
        </div>
      )}
      {isOpen && (
        <div
          className={cn(hasHeader ? "border-t px-3 py-2" : "px-3 py-2")}
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      )}
    </div>
  );
};

export default CollapsibleBlock;
