import React from "react";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/ui/button";
import { ConfigHistoryItem } from "@/types/agent-configs";
import AgentConfigurationEditView from "@/v2/pages-shared/agent-configuration/AgentConfigurationEditView";

type AgentRunnerConfigEditorProps = {
  item: ConfigHistoryItem;
  projectId: string;
  onClose: () => void;
  onMaskSaved: (maskId: string) => void;
};

const AgentRunnerConfigEditor: React.FC<AgentRunnerConfigEditorProps> = ({
  item,
  projectId,
  onClose,
  onMaskSaved,
}) => {
  return (
    <div>
      <Button variant="ghost" size="xs" onClick={onClose} className="mb-2">
        <ArrowLeft className="mr-1 size-3" />
        Back to Agent sandbox
      </Button>

      <AgentConfigurationEditView
        item={item}
        projectId={projectId}
        onCancel={onClose}
        onSaved={(maskId) => {
          onMaskSaved(maskId);
          onClose();
        }}
      />
    </div>
  );
};

export default AgentRunnerConfigEditor;
