import React, { useCallback, useMemo, useState } from "react";
import { ChevronRight, FoldVertical, UnfoldVertical } from "lucide-react";

import { BlueprintValue, BlueprintValueType } from "@/types/agent-configs";
import { formatBlueprintValue } from "@/utils/agent-configurations";
import TooltipWrapper from "@/shared/TooltipWrapper/TooltipWrapper";
import BlueprintTypeIcon from "./BlueprintTypeIcon";
import BlueprintValuePrompt from "./BlueprintValuePrompt";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  CustomAccordionTrigger,
} from "@/ui/accordion";
import { Button } from "@/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/tooltip";

const renderValue = (v: BlueprintValue) => {
  if (v.type === BlueprintValueType.PROMPT) {
    return <BlueprintValuePrompt key={v.value} value={v} />;
  }

  return (
    <div className="comet-body-s whitespace-pre-wrap break-words rounded-md border bg-primary-foreground p-3 text-foreground">
      {formatBlueprintValue(v)}
    </div>
  );
};

type BlueprintValuesListProps = {
  values: BlueprintValue[];
};

const BlueprintValuesList: React.FC<BlueprintValuesListProps> = ({
  values,
}) => {
  const allKeys = useMemo(() => values.map((v) => v.key), [values]);
  const [expandedKeys, setExpandedKeys] = useState<string[]>(allKeys);

  const isAllExpanded =
    allKeys.length > 0 && expandedKeys.length === allKeys.length;

  const handleToggleAll = useCallback(() => {
    setExpandedKeys(isAllExpanded ? [] : allKeys);
  }, [isAllExpanded, allKeys]);

  return (
    <div className="flex flex-col">
      {values.length > 1 && (
        <div className="flex justify-end">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={handleToggleAll}
                variant="outline"
                size="icon-2xs"
              >
                {isAllExpanded ? <FoldVertical /> : <UnfoldVertical />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {isAllExpanded ? "Collapse all" : "Expand all"}
            </TooltipContent>
          </Tooltip>
        </div>
      )}
      <Accordion
        type="multiple"
        value={expandedKeys}
        onValueChange={setExpandedKeys}
        className="flex flex-col divide-y"
      >
        {values.map((v) => (
          <AccordionItem key={v.key} value={v.key} className="border-none py-1">
            <CustomAccordionTrigger className="flex select-none items-center justify-between gap-1 rounded-sm p-1 px-0 transition-colors hover:bg-primary-foreground [&[data-state=open]>div>svg:first-child]:rotate-90">
              <div className="flex items-center gap-2">
                <ChevronRight className="size-3.5 shrink-0 text-light-slate transition-transform duration-200" />
                <BlueprintTypeIcon type={v.type} />
                <span className="comet-body-s-accented text-foreground">
                  {v.key}
                </span>
              </div>
              {v.description && (
                <TooltipWrapper content={v.description}>
                  <span className="comet-body-xs max-w-[50%] truncate text-light-slate">
                    {v.description}
                  </span>
                </TooltipWrapper>
              )}
            </CustomAccordionTrigger>
            <AccordionContent className="pb-2">
              {renderValue(v)}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
};

export default BlueprintValuesList;
