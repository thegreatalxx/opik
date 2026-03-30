import { FormatDetector } from "../../types";

interface GooglePart {
  text?: string;
  inline_data?: {
    data?: string;
    mime_type?: string;
  };
  function_call?: unknown;
  function_response?: unknown;
}

interface GoogleContent {
  role?: string;
  parts?: GooglePart[];
}

interface GoogleCandidate {
  content?: GoogleContent;
  finish_reason?: string;
}

/**
 * Checks if an object looks like a Google GenAI Content item
 */
const isGoogleContent = (item: unknown): item is GoogleContent => {
  if (!item || typeof item !== "object") return false;
  const c = item as Record<string, unknown>;

  if (!Array.isArray(c.parts)) return false;

  const validRoles = ["user", "model", "function", "system"];
  if (c.role !== undefined && !validRoles.includes(c.role as string))
    return false;

  return true;
};

/**
 * Detects Google GenAI input format:
 * { contents: [{ role: "user", parts: [{ text: "..." } | { inline_data: {...} }] }] }
 */
const hasGoogleInputFormat = (data: unknown): boolean => {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;

  if (!Array.isArray(d.contents)) return false;
  if (d.contents.length === 0) return false;

  return d.contents.every(isGoogleContent);
};

/**
 * Detects Google GenAI output format:
 * { candidates: [{ content: { role: "model", parts: [...] } }] }
 */
const hasGoogleOutputFormat = (data: unknown): boolean => {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;

  if (!Array.isArray(d.candidates)) return false;
  if (d.candidates.length === 0) return false;

  return d.candidates.every((candidate: unknown) => {
    if (!candidate || typeof candidate !== "object") return false;
    const c = candidate as GoogleCandidate;
    return c.content === undefined || isGoogleContent(c.content);
  });
};

/**
 * Detects if the provided data is in Google GenAI (ADK) format.
 */
export const detectGoogleFormat: FormatDetector = (data, prettifyConfig) => {
  if (!data) return false;

  const isInput = prettifyConfig?.fieldType === "input";
  const isOutput = prettifyConfig?.fieldType === "output";

  if (!isInput && !isOutput) return false;

  if (isInput && hasGoogleInputFormat(data)) return true;
  if (isOutput && hasGoogleOutputFormat(data)) return true;

  return false;
};
