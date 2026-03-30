import PrettyLLMMessage from "@/shared/PrettyLLMMessage";
import {
  FormatMapper,
  LLMMessageDescriptor,
  LLMBlockDescriptor,
  LLMMapperResult,
} from "../../types";
import { MessageRole } from "@/shared/PrettyLLMMessage/types";
import { isPlaceholder } from "../../utils";

interface GoogleInlineData {
  data?: string;
  mime_type?: string;
}

interface GooglePart {
  text?: string;
  inline_data?: GoogleInlineData;
  function_call?: {
    name?: string;
    args?: Record<string, unknown>;
  };
  function_response?: {
    name?: string;
    response?: unknown;
  };
}

interface GoogleContent {
  role?: string;
  parts?: GooglePart[];
}

interface GoogleCandidate {
  content?: GoogleContent;
  finish_reason?: string;
}

interface GoogleInputData {
  contents: GoogleContent[];
}

interface GoogleOutputData {
  candidates: GoogleCandidate[];
  usage_metadata?: {
    prompt_token_count?: number;
    candidates_token_count?: number;
    total_token_count?: number;
  };
}

const generateMessageId = (index: number, prefix: string): string =>
  `${prefix}-${index}`;

/**
 * Normalizes Google role names to our internal MessageRole type.
 */
const normalizeRole = (role: string | undefined): MessageRole => {
  if (role === "model") return "assistant";
  if (role === "function") return "tool";
  return (role as MessageRole) || "user";
};

/**
 * Maps an array of Google parts to block descriptors.
 */
const mapParts = (
  parts: GooglePart[],
  role: MessageRole,
): LLMBlockDescriptor[] => {
  const blocks: LLMBlockDescriptor[] = [];
  const images: Array<{ url: string; name: string }> = [];

  parts.forEach((part, index) => {
    if (part.text !== undefined) {
      // Flush pending images before text
      if (images.length > 0) {
        blocks.push({
          blockType: "image",
          component: PrettyLLMMessage.ImageBlock,
          props: { images: [...images] },
        });
        images.length = 0;
      }
      blocks.push({
        blockType: "text",
        component: PrettyLLMMessage.TextBlock,
        props: {
          children: part.text,
          role,
          showMoreButton: true,
        },
      });
    } else if (part.inline_data) {
      const data = part.inline_data.data;
      if (data && data.length > 0) {
        images.push({
          url: data,
          name: isPlaceholder(data) ? data : `Image ${index + 1}`,
        });
      }
    } else if (part.function_call) {
      const name = part.function_call.name || "function_call";
      const args = part.function_call.args
        ? JSON.stringify(part.function_call.args, null, 2)
        : "";
      blocks.push({
        blockType: "code",
        component: PrettyLLMMessage.CodeBlock,
        props: { code: args, label: name },
      });
    } else if (part.function_response) {
      const name = part.function_response.name || "function_response";
      const response = part.function_response.response
        ? JSON.stringify(part.function_response.response, null, 2)
        : "";
      blocks.push({
        blockType: "code",
        component: PrettyLLMMessage.CodeBlock,
        props: { code: response, label: name },
      });
    }
  });

  // Flush any remaining images
  if (images.length > 0) {
    blocks.push({
      blockType: "image",
      component: PrettyLLMMessage.ImageBlock,
      props: { images },
    });
  }

  return blocks;
};

/**
 * Maps a GoogleContent object to an LLMMessageDescriptor.
 */
const mapGoogleContent = (
  content: GoogleContent,
  index: number,
  prefix: string,
): LLMMessageDescriptor => {
  const role = normalizeRole(content.role);
  const blocks = content.parts ? mapParts(content.parts, role) : [];

  return {
    id: generateMessageId(index, prefix),
    role,
    blocks,
  };
};

/**
 * Maps Google GenAI input format to LLMMapperResult.
 */
const mapGoogleInput = (data: GoogleInputData): LLMMapperResult => {
  const messages = data.contents.map((content, index) =>
    mapGoogleContent(content, index, "input"),
  );
  return { messages };
};

/**
 * Maps Google GenAI output format to LLMMapperResult.
 */
const mapGoogleOutput = (data: GoogleOutputData): LLMMapperResult => {
  const messages: LLMMessageDescriptor[] = [];

  data.candidates.forEach((candidate, index) => {
    if (!candidate.content) return;

    const message = mapGoogleContent(candidate.content, index, "output");
    if (candidate.finish_reason) {
      message.finishReason = candidate.finish_reason;
    }
    messages.push(message);
  });

  const usage = data.usage_metadata
    ? {
        prompt_tokens: data.usage_metadata.prompt_token_count,
        completion_tokens: data.usage_metadata.candidates_token_count,
        total_tokens: data.usage_metadata.total_token_count,
      }
    : undefined;

  return { messages, usage };
};

/**
 * Maps Google GenAI format data to normalized LLMMapperResult.
 */
export const mapGoogleMessages: FormatMapper = (data, prettifyConfig) => {
  if (!data) return { messages: [] };

  const isInput = prettifyConfig?.fieldType === "input";
  const isOutput = prettifyConfig?.fieldType === "output";

  if (isInput && typeof data === "object" && "contents" in data) {
    return mapGoogleInput(data as GoogleInputData);
  }

  if (isOutput && typeof data === "object" && "candidates" in data) {
    return mapGoogleOutput(data as GoogleOutputData);
  }

  return { messages: [] };
};
