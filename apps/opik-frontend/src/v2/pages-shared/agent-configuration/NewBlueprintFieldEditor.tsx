import React, { useMemo } from "react";
import { Trash } from "lucide-react";

import { BlueprintValueType } from "@/types/agent-configs";
import BlueprintTypeIcon from "@/v2/pages-shared/traces/ConfigurationTab/BlueprintTypeIcon";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { Switch } from "@/ui/switch";
import { Textarea } from "@/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/ui/select";

const FIELD_NAME_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

const TYPE_OPTIONS: { value: BlueprintValueType; label: string }[] = [
  { value: BlueprintValueType.STRING, label: "String" },
  { value: BlueprintValueType.INT, label: "Integer" },
  { value: BlueprintValueType.FLOAT, label: "Float" },
  { value: BlueprintValueType.BOOLEAN, label: "Boolean" },
  { value: BlueprintValueType.PROMPT, label: "Prompt" },
];

export interface NewFieldDraft {
  id: string;
  key: string;
  type: BlueprintValueType;
  value: string;
}

export const createNewFieldDraft = (id: string): NewFieldDraft => ({
  id,
  key: "",
  type: BlueprintValueType.STRING,
  value: "",
});

export const defaultValueForType = (type: BlueprintValueType): string => {
  switch (type) {
    case BlueprintValueType.BOOLEAN:
      return "false";
    case BlueprintValueType.PROMPT:
      return "";
    default:
      return "";
  }
};

interface NewBlueprintFieldEditorProps {
  field: NewFieldDraft;
  reservedKeys: Set<string>;
  onChange: (next: NewFieldDraft) => void;
  onRemove: () => void;
  error?: string;
}

const NewBlueprintFieldEditor: React.FC<NewBlueprintFieldEditorProps> = ({
  field,
  reservedKeys,
  onChange,
  onRemove,
  error,
}) => {
  const trimmedKey = field.key.trim();
  const keyError = useMemo(() => {
    if (!trimmedKey) return null;
    if (!FIELD_NAME_PATTERN.test(trimmedKey))
      return "Use letters, digits and underscore; start with a letter or underscore";
    if (reservedKeys.has(trimmedKey))
      return "A field with this name already exists";
    return null;
  }, [trimmedKey, reservedKeys]);

  const handleTypeChange = (next: BlueprintValueType) => {
    onChange({ ...field, type: next, value: defaultValueForType(next) });
  };

  return (
    <div className="flex flex-col gap-2 rounded-md border border-dashed border-amber-400/50 bg-primary-foreground p-3">
      <div className="flex items-center gap-2">
        <BlueprintTypeIcon type={field.type} variant="secondary" />
        <Input
          value={field.key}
          onChange={(e) => onChange({ ...field, key: e.target.value })}
          placeholder="field_name"
          className="h-8 flex-1"
        />
        <Select value={field.type} onValueChange={handleTypeChange}>
          <SelectTrigger className="h-8 w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TYPE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="minimal"
          size="icon-sm"
          onClick={onRemove}
          aria-label="Remove field"
        >
          <Trash />
        </Button>
      </div>

      {field.type === BlueprintValueType.BOOLEAN ? (
        <Switch
          checked={field.value === "true"}
          onCheckedChange={(checked) =>
            onChange({ ...field, value: String(checked) })
          }
        />
      ) : field.type === BlueprintValueType.PROMPT ? (
        <Textarea
          value={field.value}
          onChange={(e) => onChange({ ...field, value: e.target.value })}
          placeholder="System message for the new prompt"
          className="min-h-20"
        />
      ) : (
        <Input
          inputMode={
            field.type === BlueprintValueType.INT
              ? "numeric"
              : field.type === BlueprintValueType.FLOAT
                ? "decimal"
                : "text"
          }
          value={field.value}
          onChange={(e) => onChange({ ...field, value: e.target.value })}
          placeholder="Initial value"
        />
      )}

      {(keyError || error) && (
        <span className="comet-body-xs text-destructive">
          {keyError ?? error}
        </span>
      )}
    </div>
  );
};

export default NewBlueprintFieldEditor;
