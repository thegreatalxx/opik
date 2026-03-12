import React, { useCallback, useState, useRef } from "react";
import { Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  ButtonWithDropdown,
  ButtonWithDropdownTrigger,
  ButtonWithDropdownContent,
  ButtonWithDropdownItem,
} from "@/components/ui/button-with-dropdown";
import { Separator } from "@/components/ui/separator";
import ConfirmDialog from "@/components/shared/ConfirmDialog/ConfirmDialog";
import { useToast } from "@/components/ui/use-toast";
import useNavigationBlocker from "@/hooks/useNavigationBlocker";
import AddEditCloneDashboardDialog from "@/components/pages-shared/dashboards/AddEditCloneDashboardDialog/AddEditCloneDashboardDialog";
import {
  useDashboardStore,
  selectHasUnsavedChanges,
} from "@/store/DashboardStore";
import { Dashboard } from "@/types/dashboard";

interface DashboardSaveActionsProps {
  onSave: () => Promise<void>;
  onDiscard: () => void;
  dashboard: Dashboard;
  navigateOnCreate?: boolean;
  onDashboardCreated?: (dashboardId: string) => void;
}

const DashboardSaveActions: React.FunctionComponent<
  DashboardSaveActionsProps
> = ({
  onSave,
  onDiscard,
  dashboard,
  navigateOnCreate = true,
  onDashboardCreated,
}) => {
  const { toast } = useToast();
  const hasUnsavedChanges = useDashboardStore(selectHasUnsavedChanges);
  const getDashboard = useDashboardStore((state) => state.getDashboard);

  const [isSaving, setIsSaving] = useState(false);
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);
  const [saveAsDialogOpen, setSaveAsDialogOpen] = useState(false);

  const saveAsDialogKey = useRef(0);
  const saveAsDialogDashboard = useRef(dashboard);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      await onSave();
      toast({
        title: "Dashboard saved",
        description: "Your changes have been saved successfully.",
      });
    } catch {
      toast({
        title: "Failed to save dashboard",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  }, [onSave, toast]);

  const handleDiscard = useCallback(() => {
    onDiscard();
    setDiscardDialogOpen(false);
    toast({
      title: "Changes discarded",
      description: "Your changes have been discarded.",
    });
  }, [onDiscard, toast]);

  const openSaveAsDialog = useCallback(() => {
    saveAsDialogDashboard.current = { ...dashboard, config: getDashboard() };
    saveAsDialogKey.current += 1;
    setSaveAsDialogOpen(true);
  }, [dashboard, getDashboard]);

  const handleSaveAsDialogClose = useCallback((open: boolean) => {
    setSaveAsDialogOpen(open);
  }, []);

  const handleSaveAsSuccess = useCallback(
    (dashboardId: string) => {
      setSaveAsDialogOpen(false);
      onDiscard();
      onDashboardCreated?.(dashboardId);
    },
    [onDiscard, onDashboardCreated],
  );

  const handleSaveAndLeave = useCallback(
    (proceed: () => void, cancel: () => void) => {
      onSave().then(proceed).catch(cancel);
    },
    [onSave],
  );

  const { DialogComponent: NavigationBlockerDialog } = useNavigationBlocker({
    condition: hasUnsavedChanges,
    description:
      "You have unsaved changes in this dashboard. Save them before leaving?",
    confirmText: "Discard changes",
    cancelText: "Cancel",
    onSaveAndLeave: handleSaveAndLeave,
    saveAndLeaveText: "Save and leave",
  });

  if (!hasUnsavedChanges) {
    return null;
  }

  return (
    <>
      <Button
        variant="destructive"
        size="sm"
        onClick={() => setDiscardDialogOpen(true)}
        disabled={isSaving}
      >
        Discard changes
      </Button>

      <ButtonWithDropdown>
        <ButtonWithDropdownTrigger
          variant="default"
          size="sm"
          onPrimaryClick={handleSave}
          disabled={isSaving}
        >
          Save changes
        </ButtonWithDropdownTrigger>
        <ButtonWithDropdownContent align="end">
          <ButtonWithDropdownItem onClick={openSaveAsDialog}>
            <Copy className="mr-2 size-4" />
            Save as new
          </ButtonWithDropdownItem>
        </ButtonWithDropdownContent>
      </ButtonWithDropdown>

      <Separator orientation="vertical" className="mx-2 h-4" />

      <ConfirmDialog
        open={discardDialogOpen}
        setOpen={setDiscardDialogOpen}
        onConfirm={handleDiscard}
        title="Discard changes?"
        description="All unsaved changes will be removed. This will return the dashboard to its last saved version."
        confirmText="Discard changes"
        cancelText="Cancel"
        confirmButtonVariant="destructive"
      />

      <AddEditCloneDashboardDialog
        key={`save-as-${saveAsDialogKey.current}`}
        mode="save_as"
        open={saveAsDialogOpen}
        setOpen={handleSaveAsDialogClose}
        dashboard={saveAsDialogDashboard.current}
        onCreateSuccess={handleSaveAsSuccess}
        navigateOnCreate={navigateOnCreate}
      />

      {NavigationBlockerDialog}
    </>
  );
};

export default DashboardSaveActions;
