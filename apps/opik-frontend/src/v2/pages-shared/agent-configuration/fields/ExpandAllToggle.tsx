import React from "react";
import { ChevronsDownUp, ChevronsUpDown } from "lucide-react";

import { Button } from "@/ui/button";
import { FieldsCollapseController } from "./useFieldsCollapse";

type ExpandAllToggleProps = {
  controller: FieldsCollapseController;
  size?: "xs" | "2xs";
};

const ExpandAllToggle: React.FC<ExpandAllToggleProps> = ({
  controller,
  size = "2xs",
}) => {
  const label = controller.allExpanded ? "Collapse all" : "Expand all";
  const onClick = () =>
    controller.allExpanded ? controller.collapseAll() : controller.expandAll();

  return (
    <Button variant="ghost" size={size} onClick={onClick}>
      {controller.allExpanded ? (
        <ChevronsDownUp className="mr-1 size-3.5" />
      ) : (
        <ChevronsUpDown className="mr-1 size-3.5" />
      )}
      {label}
    </Button>
  );
};

export default ExpandAllToggle;
