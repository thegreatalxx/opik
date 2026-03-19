import React from "react";
import { GitCommitVertical, Layers } from "lucide-react";
import { Tag } from "@/components/ui/tag";
import TooltipWrapper from "@/components/shared/TooltipWrapper/TooltipWrapper";

type ConfigurationVersionTagProps = {
  version: number | string;
  maskId?: string;
};

const ConfigurationVersionTag: React.FC<ConfigurationVersionTagProps> = ({
  version,
  maskId,
}) => {
  const hasMask = Boolean(maskId);

  const tag = (
    <Tag
      className="inline-flex items-center gap-1"
      variant={hasMask ? "purple" : "gray"}
      size="md"
    >
      {hasMask ? (
        <Layers className="size-3.5 shrink-0" />
      ) : (
        <GitCommitVertical className="size-3.5 shrink-0" />
      )}
      {version}
    </Tag>
  );

  if (hasMask) {
    return (
      <TooltipWrapper
        content={`Used with mask_id ${maskId} on top ${version}`}
      >
        {tag}
      </TooltipWrapper>
    );
  }

  return tag;
};

export default ConfigurationVersionTag;
