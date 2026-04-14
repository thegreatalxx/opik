import React, { useCallback, useEffect, useState } from "react";
import { ChevronRight, ExternalLink } from "lucide-react";

import { Button } from "@/ui/button";
import { Description } from "@/ui/description";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";
import { Separator } from "@/ui/separator";
import { Textarea } from "@/ui/textarea";
import { cn, buildDocsUrl } from "@/lib/utils";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  CustomAccordionTrigger,
} from "@/ui/accordion";
import ResizableSidePanel from "@/shared/ResizableSidePanel/ResizableSidePanel";
import AssertionsField from "@/shared/AssertionField/AssertionsField";
import ConfirmDialog from "@/shared/ConfirmDialog/ConfirmDialog";
import UploadField from "@/shared/UploadField/UploadField";
import CsvUploadDialog from "@/v2/pages-shared/datasets/CsvUploadDialog/CsvUploadDialog";
import useDatasetForm from "@/v2/pages-shared/datasets/AddEditDatasetDialog/useDatasetForm";
import CreatedSuccess from "./CreatedSuccess";
import { Dataset, DATASET_TYPE, DatasetListType } from "@/types/datasets";
import { MAX_RUNS_PER_ITEM } from "@/types/test-suites";

const ACCEPTED_TYPE = ".csv";

enum Step {
  NAME_DESCRIPTION,
  UPLOAD_AND_CONFIG,
  SUCCESS,
}

const TYPE_CONFIG = {
  dataset: {
    panelTitle: "Create dataset",
    entityName: "Dataset",
    datasetType: DATASET_TYPE.DATASET,
    skipEvaluationCriteria: true,
  },
  test_suite: {
    panelTitle: "Create test suite",
    entityName: "Test suite",
    datasetType: DATASET_TYPE.TEST_SUITE,
    skipEvaluationCriteria: false,
  },
} as const;

type CreateDatasetSidebarProps = {
  type: DatasetListType;
  open: boolean;
  setOpen: (open: boolean) => void;
  onDatasetCreated?: (dataset: Dataset) => void;
};

const CreateDatasetSidebar: React.FunctionComponent<
  CreateDatasetSidebarProps
> = ({ type, open, setOpen, onDatasetCreated }) => {
  const config = TYPE_CONFIG[type];

  const [step, setStep] = useState<Step>(Step.NAME_DESCRIPTION);
  const [createdName, setCreatedName] = useState("");
  const [navigateToEntity, setNavigateToEntity] = useState<(() => void) | null>(
    null,
  );

  const handleNameConflict = useCallback(() => {
    setStep(Step.NAME_DESCRIPTION);
  }, []);

  const handleCreateSuccess = useCallback(
    (dataset: Dataset, navigate: () => void) => {
      setCreatedName(dataset.name);
      setNavigateToEntity(() => navigate);
      setStep(Step.SUCCESS);
    },
    [],
  );

  const {
    name,
    setName,
    nameError,
    setNameError,
    description,
    setDescription,
    assertions,
    setAssertions,
    runsPerItem,
    runsInput,
    thresholdInput,
    csvFile,
    csvError,
    isOverlayShown,
    setIsOverlayShown,
    confirmOpen,
    setConfirmOpen,
    isCsvUploadEnabled,
    fileSizeLimit,
    typeLabel,
    submitHandler,
    handleFileSelect,
  } = useDatasetForm({
    open,
    setOpen,
    onDatasetCreated,
    skipEvaluationCriteria: config.skipEvaluationCriteria,
    datasetType: config.datasetType,
    onNameConflict: handleNameConflict,
    onCreateSuccess: handleCreateSuccess,
  });

  useEffect(() => {
    if (!open) {
      const timeout = setTimeout(() => {
        setStep(Step.NAME_DESCRIPTION);
        setCreatedName("");
        setNavigateToEntity(null);
      }, 200);
      return () => clearTimeout(timeout);
    }
  }, [open]);

  const handleClose = useCallback(() => setOpen(false), [setOpen]);

  const handleGoToEntity = useCallback(() => {
    navigateToEntity?.();
  }, [navigateToEntity]);

  const handleOverlayClose = useCallback(() => {
    setIsOverlayShown(false);
  }, [setIsOverlayShown]);

  const handleCreateAnother = useCallback(() => {
    setStep(Step.NAME_DESCRIPTION);
    setCreatedName("");
    setNavigateToEntity(null);
    setName("");
    setDescription("");
    setAssertions([]);
  }, [setName, setDescription, setAssertions]);

  const renderStepNameDescription = () => (
    <>
      <div className="flex flex-col gap-2 pb-4">
        <Label htmlFor={`${type}Name`}>Name</Label>
        <Input
          id={`${type}Name`}
          placeholder="Name"
          value={name}
          className={
            nameError && "!border-destructive focus-visible:!border-destructive"
          }
          onChange={(event) => {
            setName(event.target.value);
            setNameError(undefined);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && name.length > 0) {
              event.preventDefault();
              setStep(Step.UPLOAD_AND_CONFIG);
            }
          }}
        />
        <span
          className={`comet-body-xs min-h-4 ${
            nameError ? "text-destructive" : "invisible"
          }`}
        >
          {nameError || " "}
        </span>
      </div>
      <div className="flex flex-col gap-2 pb-4">
        <Label htmlFor={`${type}Description`}>Description</Label>
        <Textarea
          id={`${type}Description`}
          placeholder="Description"
          className="min-h-28"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={255}
        />
      </div>
    </>
  );

  const renderStepUploadAndConfig = () => (
    <>
      <div className="flex flex-col gap-2 pb-4">
        <Label>Upload a CSV</Label>
        <Description className="tracking-normal">
          {isCsvUploadEnabled ? (
            <>
              Your CSV file can be up to {fileSizeLimit}MB in size. The file
              will be processed in the background.
            </>
          ) : (
            <>
              Your CSV file can contain up to 1,000 rows, for larger {typeLabel}
              s use the SDK instead.
            </>
          )}
          <Button variant="link" size="sm" className="h-5 px-1" asChild>
            <a
              href={buildDocsUrl("/evaluation/manage_datasets")}
              target="_blank"
              rel="noopener noreferrer"
            >
              Learn more
              <ExternalLink className="ml-0.5 size-3 shrink-0" />
            </a>
          </Button>
        </Description>
        <UploadField
          description="Drop a CSV file to upload or"
          accept={ACCEPTED_TYPE}
          onFileSelect={handleFileSelect}
          errorText={csvError}
          successText={
            csvFile && !csvError ? "CSV file ready to upload" : undefined
          }
        />
      </div>
      {type === "test_suite" && (
        <Accordion type="single" collapsible>
          <AccordionItem value="advanced" className="border-b-0">
            <CustomAccordionTrigger className="flex items-center gap-1.5 py-4 transition-all [&[data-state=open]>svg]:rotate-90">
              <ChevronRight className="size-4 shrink-0 transition-transform duration-200" />
              <span className="comet-body-s">Advanced settings</span>
            </CustomAccordionTrigger>
            <AccordionContent className="pl-6">
              <Separator className="mb-4" />
              <div className="mb-4">
                <h3 className="comet-body-s-accented">Evaluation criteria</h3>
                <p className="comet-body-xs text-light-slate">
                  Define the conditions required for the evaluation to pass
                </p>
              </div>
              <div className="mb-4 flex gap-4">
                <div className="flex flex-1 flex-col gap-1">
                  <Label
                    htmlFor="runsPerItem"
                    className="comet-body-xs-accented"
                  >
                    Default runs per item
                  </Label>
                  <Input
                    id="runsPerItem"
                    dimension="sm"
                    className={cn({
                      "border-destructive": runsInput.isInvalid,
                    })}
                    type="number"
                    min={1}
                    max={MAX_RUNS_PER_ITEM}
                    value={runsInput.displayValue}
                    onChange={runsInput.onChange}
                    onFocus={runsInput.onFocus}
                    onBlur={runsInput.onBlur}
                    onKeyDown={runsInput.onKeyDown}
                  />
                </div>
                <div className="flex flex-1 flex-col gap-1">
                  <Label
                    htmlFor="passThreshold"
                    className="comet-body-xs-accented"
                  >
                    Default pass threshold
                  </Label>
                  <Input
                    id="passThreshold"
                    dimension="sm"
                    className={cn({
                      "border-destructive": thresholdInput.isInvalid,
                    })}
                    type="number"
                    min={1}
                    max={runsPerItem}
                    value={thresholdInput.displayValue}
                    onChange={thresholdInput.onChange}
                    onFocus={thresholdInput.onFocus}
                    onBlur={thresholdInput.onBlur}
                    onKeyDown={thresholdInput.onKeyDown}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1 pb-4">
                <div className="mb-1">
                  <Label className="comet-body-s-accented">
                    Global assertions
                  </Label>
                  <p className="comet-body-xs text-light-slate">
                    Define the global conditions all items in this test suite
                    must pass.
                  </p>
                </div>
                <div className="pt-1.5">
                  <AssertionsField
                    editableAssertions={assertions}
                    onChangeEditable={(index, value) => {
                      setAssertions((prev) => {
                        const next = [...prev];
                        next[index] = value;
                        return next;
                      });
                    }}
                    onRemoveEditable={(index) => {
                      setAssertions((prev) =>
                        prev.filter((_, i) => i !== index),
                      );
                    }}
                    onAdd={() => setAssertions((prev) => [...prev, ""])}
                    placeholder="e.g. Response should be factually accurate and cite sources"
                  />
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}
    </>
  );

  const renderFooter = () => {
    if (step === Step.NAME_DESCRIPTION) {
      return (
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            disabled={name.length === 0}
            onClick={() => setStep(Step.UPLOAD_AND_CONFIG)}
          >
            Next
          </Button>
        </div>
      );
    }

    if (step === Step.UPLOAD_AND_CONFIG) {
      return (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            onClick={() => setStep(Step.NAME_DESCRIPTION)}
          >
            Back
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              onClick={csvError ? () => setConfirmOpen(true) : submitHandler}
            >
              Create
            </Button>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <>
      <ResizableSidePanel
        panelId={`create-${type}-sidebar`}
        entity={typeLabel}
        open={open}
        onClose={handleClose}
        initialWidth={0.35}
        minWidth={450}
        closeButtonPosition="right"
        headerContent={
          <span className="comet-title-xs">{config.panelTitle}</span>
        }
      >
        <div className="flex size-full flex-col">
          <div className="flex-1 overflow-y-auto p-6 pt-4">
            {step === Step.NAME_DESCRIPTION && renderStepNameDescription()}
            {step === Step.UPLOAD_AND_CONFIG && renderStepUploadAndConfig()}
            {step === Step.SUCCESS && (
              <CreatedSuccess
                entityName={config.entityName}
                name={createdName}
                onGoToEntity={handleGoToEntity}
                onCreateAnother={handleCreateAnother}
              />
            )}
          </div>
          {step !== Step.SUCCESS && (
            <div className="border-t px-6 py-4">{renderFooter()}</div>
          )}
        </div>
      </ResizableSidePanel>
      <ConfirmDialog
        open={confirmOpen}
        setOpen={setConfirmOpen}
        onCancel={submitHandler}
        title="File can't be uploaded"
        description={`This file cannot be uploaded because it does not pass validation. If you continue, the ${typeLabel} will be created without any items. You can add items manually later, or go back and upload a valid file.`}
        cancelText={`Create empty ${typeLabel}`}
        confirmText="Go back"
      />
      <CsvUploadDialog
        open={isOverlayShown}
        isCsvMode={isCsvUploadEnabled}
        onClose={handleOverlayClose}
      />
    </>
  );
};

export default CreateDatasetSidebar;
