import React from "react";
import { ChevronDown, ChevronRight, Info } from "lucide-react";

import { cn } from "@/lib/utils";
import TooltipWrapper from "@/shared/TooltipWrapper/TooltipWrapper";

type CollapsibleFieldProps = {
  fieldKey: string;
  label: React.ReactNode;
  description?: string;
  icon?: React.ReactNode;
  trailing?: React.ReactNode;
  collapsible: boolean;
  expanded: boolean;
  onToggle: () => void;
  active?: boolean;
  children: React.ReactNode;
};

const CollapsibleField: React.FC<CollapsibleFieldProps> = ({
  fieldKey,
  label,
  description,
  icon,
  trailing,
  collapsible,
  expanded,
  onToggle,
  active,
  children,
}) => {
  const isOpen = !collapsible || expanded;

  const header = (
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
      data-testid={`collapsible-field-header-${fieldKey}`}
    >
      {collapsible &&
        (isOpen ? (
          <ChevronDown className="size-3.5 shrink-0 text-light-slate" />
        ) : (
          <ChevronRight className="size-3.5 shrink-0 text-light-slate" />
        ))}
      {icon}
      <span
        className={cn(
          "comet-body-xs-accented truncate",
          isOpen || active ? "text-foreground" : "text-muted-slate",
        )}
      >
        {label}
      </span>
      {description && (
        <TooltipWrapper content={description}>
          <Info className="size-3 shrink-0 cursor-help text-light-slate" />
        </TooltipWrapper>
      )}
      {trailing && (
        <div
          className="ml-auto flex items-center gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          {trailing}
        </div>
      )}
    </div>
  );

  return (
    <div
      className={cn(
        "rounded-md border bg-primary-foreground",
        active && "border-primary",
      )}
      data-testid={`collapsible-field-${fieldKey}`}
    >
      {header}
      {isOpen && (
        <div
          className="border-t px-3 py-2"
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      )}
    </div>
  );
};

export default CollapsibleField;
