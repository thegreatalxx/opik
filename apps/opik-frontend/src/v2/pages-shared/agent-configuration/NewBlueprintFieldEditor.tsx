import React, { useCallback, useMemo } from "react";
import { Trash } from "lucide-react";

import { BlueprintValueType } from "@/types/agent-configs";
import { LLM_MESSAGE_ROLE, LLMMessage } from "@/types/llm";
import { generateDefaultLLMPromptMessage } from "@/lib/llm";
import BlueprintTypeIcon from "@/v2/pages-shared/traces/ConfigurationTab/BlueprintTypeIcon";
import LLMPromptMessages from "@/v2/pages-shared/llm/LLMPromptMessages/LLMPromptMessages";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { Switch } from "@/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/ui/select";
import { validateBlueprintFieldValue } from "./blueprintFieldValidation";

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
  // Used for scalar types and as the BOOLEAN's "true"/"false".
  value: string;
  // Used only when type === PROMPT.
  messages: LLMMessage[];
}

const buildDefaultPromptMessages = (): LLMMessage[] => [
  generateDefaultLLMPromptMessage({ role: LLM_MESSAGE_ROLE.system }),
];

export const createNewFieldDraft = (id: string): NewFieldDraft => ({
  id,
  key: "",
  type: BlueprintValueType.STRING,
  value: "",
  messages: [],
});

const initialStateForType = (
  type: BlueprintValueType,
): Pick<NewFieldDraft, "value" | "messages"> => {
  if (type === BlueprintValueType.BOOLEAN) {
    return { value: "false", messages: [] };
  }
  if (type === BlueprintValueType.PROMPT) {
    return { value: "", messages: buildDefaultPromptMessages() };
  }
  return { value: "", messages: [] };
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

  // Inline validation for the value field. We only show it once the user has
  // typed something, to avoid yelling at them about an empty initial value.
  const valueError = useMemo(() => {
    if (
      field.type === BlueprintValueType.PROMPT ||
      field.type === BlueprintValueType.BOOLEAN
    ) {
      return null;
    }
    if (!field.value) return null;
    return validateBlueprintFieldValue(field.type, field.value) || null;
  }, [field.type, field.value]);

  // For PROMPT, surface a hint when there are no messages or every message is
  // empty. We don't gate on it (the user may still be drafting) but we do
  // signal it.
  const promptError = useMemo(() => {
    if (field.type !== BlueprintValueType.PROMPT) return null;
    if (field.messages.length === 0) return "Add at least one message";
    const allEmpty = field.messages.every((m) => {
      if (typeof m.content === "string") return !m.content.trim();
      if (Array.isArray(m.content)) {
        return m.content.every(
          (part) =>
            part.type === "text" && !(part as { text?: string }).text?.trim(),
        );
      }
      return true;
    });
    return allEmpty ? "Messages must not be empty" : null;
  }, [field.type, field.messages]);

  const handleTypeChange = (next: BlueprintValueType) => {
    onChange({ ...field, type: next, ...initialStateForType(next) });
  };

  const handleMessagesChange = useCallback(
    (messages: LLMMessage[]) => onChange({ ...field, messages }),
    [field, onChange],
  );

  const handleAddMessage = useCallback(() => {
    const lastRole = field.messages.at(-1)?.role;
    const nextRole =
      lastRole === LLM_MESSAGE_ROLE.user
        ? LLM_MESSAGE_ROLE.assistant
        : LLM_MESSAGE_ROLE.user;
    onChange({
      ...field,
      messages: [
        ...field.messages,
        generateDefaultLLMPromptMessage({ role: nextRole }),
      ],
    });
  }, [field, onChange]);

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
        <LLMPromptMessages
          messages={field.messages}
          onChange={handleMessagesChange}
          onAddMessage={handleAddMessage}
          hidePromptActions
          disableMedia
          compact
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

      {(keyError || valueError || promptError || error) && (
        <span className="comet-body-xs text-destructive">
          {keyError ?? valueError ?? promptError ?? error}
        </span>
      )}
    </div>
  );
};

export default NewBlueprintFieldEditor;
