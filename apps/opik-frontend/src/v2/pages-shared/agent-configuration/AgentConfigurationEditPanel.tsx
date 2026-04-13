import React, { useMemo, useRef, useState } from "react";
import { Pencil, X } from "lucide-react";

import { ConfigHistoryItem } from "@/types/agent-configs";
import { Button } from "@/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/ui/sheet";
import { Tag } from "@/ui/tag";
import AgentConfigurationEditView, {
  AgentConfigurationEditViewHandle,
  AgentConfigurationEditViewState,
} from "./AgentConfigurationEditView";
import ExpandAllToggle from "./fields/ExpandAllToggle";
import { useFieldsCollapse } from "./fields/useFieldsCollapse";

type AgentConfigurationEditPanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: ConfigHistoryItem;
  projectId: string;
  onSaved: (savedVersionName?: string) => void;
};

const AgentConfigurationEditPanel: React.FC<
  AgentConfigurationEditPanelProps
> = ({ open, onOpenChange, item, projectId, onSaved }) => {
  const viewRef = useRef<AgentConfigurationEditViewHandle>(null);
  const [view, setView] = useState<"edit" | "diff">("edit");
  const [state, setState] = useState<AgentConfigurationEditViewState>({
    isDirty: false,
    isSaving: false,
    hasErrors: false,
    collapsibleKeys: [],
  });

  const controller = useFieldsCollapse({
    collapsibleKeys: state.collapsibleKeys,
  });

  const handleSavedInternal = (savedName?: string) => {
    onSaved(savedName);
    onOpenChange(false);
  };

  const handleSave = async () => {
    await viewRef.current?.save();
  };

  const handleClose = () => {
    if (state.isSaving) return;
    onOpenChange(false);
    setView("edit");
  };

  const title = useMemo(() => `New agent configuration`, []);

  return (
    <Sheet open={open} onOpenChange={(o) => !o && handleClose()}>
      <SheetContent
        side="right"
        className="flex w-full max-w-none flex-col p-0 sm:max-w-[872px]"
        header={
          <div className="flex items-center justify-between border-b px-6 py-3">
            <div className="flex items-center gap-2">
              <SheetTitle className="comet-title-xs text-left">
                {title}
              </SheetTitle>
              <Tag variant="gray" size="sm">
                <Pencil className="mr-1 inline size-3" />
                From {item.name}
              </Tag>
            </div>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={handleClose}
              aria-label="Close"
            >
              <X className="size-3.5" />
            </Button>
          </div>
        }
      >
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="comet-body-s-accented">
              {view === "diff" ? "Diff" : "Edit fields"}
            </h3>
            <div className="flex items-center gap-1">
              {view === "edit" && state.collapsibleKeys.length > 0 && (
                <ExpandAllToggle controller={controller} size="2xs" />
              )}
              <Button
                variant="outline"
                size="2xs"
                onClick={() => setView((v) => (v === "edit" ? "diff" : "edit"))}
                disabled={!state.isDirty && view === "edit"}
              >
                {view === "edit" ? "Show diff" : "Back to edit"}
              </Button>
            </div>
          </div>

          <AgentConfigurationEditView
            ref={viewRef}
            item={item}
            projectId={projectId}
            onSaved={handleSavedInternal}
            view={view}
            showNotes={view === "edit"}
            controller={controller}
            onStateChange={setState}
            blockNavigation
          />
        </div>

        <div className="flex items-center justify-end gap-2 border-t px-6 py-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleClose}
            disabled={state.isSaving}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={state.isSaving || state.hasErrors || !state.isDirty}
          >
            {state.isSaving ? "Saving…" : "Save as new version"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default AgentConfigurationEditPanel;
