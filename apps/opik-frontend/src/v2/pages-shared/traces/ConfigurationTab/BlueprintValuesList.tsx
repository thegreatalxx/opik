import React, { useMemo } from "react";

import { BlueprintValue, BlueprintValueType } from "@/types/agent-configs";
import { formatBlueprintValue } from "@/utils/agent-configurations";
import BlueprintTypeIcon from "./BlueprintTypeIcon";
import BlueprintValuePrompt from "./BlueprintValuePrompt";
import CollapsibleField from "@/v2/pages-shared/agent-configuration/fields/CollapsibleField";
import {
  collectMultiLineKeys,
  isMultiLineField,
} from "@/v2/pages-shared/agent-configuration/fields/blueprintFieldLayout";
import {
  FieldsCollapseController,
  useFieldsCollapse,
} from "@/v2/pages-shared/agent-configuration/fields/useFieldsCollapse";

const renderValue = (v: BlueprintValue) => {
  if (v.type === BlueprintValueType.PROMPT) {
    return <BlueprintValuePrompt key={v.value} value={v} />;
  }

  return (
    <div className="comet-body-s whitespace-pre-wrap break-words text-foreground">
      {formatBlueprintValue(v)}
    </div>
  );
};

type BlueprintValuesListProps = {
  values: BlueprintValue[];
  controller?: FieldsCollapseController;
};

const BlueprintValuesList: React.FC<BlueprintValuesListProps> = ({
  values,
  controller: externalController,
}) => {
  const collapsibleKeys = useMemo(() => collectMultiLineKeys(values), [values]);
  const internalController = useFieldsCollapse({ collapsibleKeys });
  const controller = externalController ?? internalController;

  return (
    <div className="flex flex-col gap-2">
      {values.map((v) => {
        const collapsible = isMultiLineField(v);
        return (
          <CollapsibleField
            key={v.key}
            fieldKey={v.key}
            label={v.key}
            description={v.description}
            icon={<BlueprintTypeIcon type={v.type} />}
            collapsible={collapsible}
            expanded={controller.isExpanded(v.key)}
            onToggle={() => controller.toggle(v.key)}
          >
            {renderValue(v)}
          </CollapsibleField>
        );
      })}
    </div>
  );
};

export default BlueprintValuesList;
