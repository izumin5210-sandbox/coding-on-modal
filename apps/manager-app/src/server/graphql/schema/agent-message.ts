import type { IDString } from "@gqlkit-ts/runtime";
import type {
  AgentMessage as SharedAgentMessage,
  AgentMessagePart as SharedAgentMessagePart,
} from "@/lib/session-chat-types";
import { defineResolveType } from "../gqlkit";
import type { DateTime, JsonValue } from "./scalars";

export type AgentMessageRole = "user" | "assistant" | "system";

export enum AgentMessageProvider {
  ClaudeAgentSdk = "claude-agent-sdk",
}

export type AgentMessageMetadata = {
  createdAt?: DateTime;
  updatedAt?: DateTime;
  visibility?: "default" | "trace";
  status?: "in-progress" | "done" | "error";
  label?: string;
  isReplay?: boolean;
  isSynthetic?: boolean;
  parentToolUseId?: string | null;
  provider?: AgentMessageProvider;
  providerSessionId?: string;
  providerMessageType?: string;
  providerSubtype?: string;
  providerUuid?: string;
  rawStoredMessageId?: string;
};

export type AgentMessageTextPart = {
  $typeName: "AgentMessageTextPart";
  type: string;
  text: string;
  state?: "streaming" | "done";
};

export type AgentMessageReasoningPart = {
  $typeName: "AgentMessageReasoningPart";
  type: string;
  text: string;
  state?: "streaming" | "done";
};

export type AgentMessageDynamicToolPart = {
  $typeName: "AgentMessageDynamicToolPart";
  type: string;
  toolName: string;
  toolCallId: string;
  title?: string;
  providerExecuted?: boolean;
  state:
    | "input-streaming"
    | "input-available"
    | "approval-requested"
    | "approval-responded"
    | "output-available"
    | "output-error"
    | "output-denied";
  input?: JsonValue;
  output?: JsonValue;
  errorText?: string;
  preliminary?: boolean;
  approval?: {
    id: string;
    approved?: boolean;
    reason?: string;
  };
};

export type AgentMessageToolProgressPart = {
  $typeName: "AgentMessageToolProgressPart";
  type: string;
  data: {
    toolUseId: string;
    toolName: string;
    elapsedSeconds: number;
  };
};

export type AgentMessageToolSummaryPart = {
  $typeName: "AgentMessageToolSummaryPart";
  type: string;
  data: {
    summary: string;
    precedingToolUseIds: string[];
  };
};

export type AgentMessageFileBatchFile = {
  filename: string;
  fileId: string;
};

export type AgentMessageFileBatchFailure = {
  filename: string;
  error: string;
};

export type AgentMessageRunResultPart = {
  $typeName: "AgentMessageRunResultPart";
  type: string;
  data: {
    subtype: string;
    isError: boolean;
    summaryText: string;
    metrics?: {
      durationMs?: number;
      durationApiMs?: number;
      numTurns?: number;
      totalCostUsd?: number;
    };
  };
};

export type AgentMessageStatusEventPart = {
  $typeName: "AgentMessageStatusEventPart";
  type: string;
  data: {
    subtype: string;
    data: JsonValue;
  };
};

export type AgentMessageFileBatchPart = {
  $typeName: "AgentMessageFileBatchPart";
  type: string;
  data: {
    files: AgentMessageFileBatchFile[];
    failed: AgentMessageFileBatchFailure[];
    processedAt?: DateTime;
  };
};

export type AgentMessageStreamEventPart = {
  $typeName: "AgentMessageStreamEventPart";
  type: string;
  data: {
    eventType?: string;
    data: JsonValue;
  };
};

export type AgentMessageErrorEventPart = {
  $typeName: "AgentMessageErrorEventPart";
  type: string;
  data: {
    message: string;
    code?: string;
  };
};

export type AgentMessageUnknownEventPart = {
  $typeName: "AgentMessageUnknownEventPart";
  type: string;
  data: {
    rawType: string;
    rawSubtype?: string;
    data: JsonValue;
  };
};

export type AgentMessagePart =
  | AgentMessageDynamicToolPart
  | AgentMessageErrorEventPart
  | AgentMessageFileBatchPart
  | AgentMessageReasoningPart
  | AgentMessageRunResultPart
  | AgentMessageStatusEventPart
  | AgentMessageStreamEventPart
  | AgentMessageTextPart
  | AgentMessageToolProgressPart
  | AgentMessageToolSummaryPart
  | AgentMessageUnknownEventPart;

export type AgentMessage = {
  id: IDString;
  role: AgentMessageRole;
  metadata?: AgentMessageMetadata;
  parts: AgentMessagePart[];
};

export const agentMessagePartResolveType = defineResolveType<AgentMessagePart>(
  (value) => value.$typeName,
);

function toJsonValue(value: unknown): JsonValue {
  return value as JsonValue;
}

function toMetadata(
  metadata: SharedAgentMessage["metadata"],
): AgentMessageMetadata | undefined {
  if (!metadata) {
    return undefined;
  }

  return {
    createdAt: metadata.createdAt,
    updatedAt: metadata.updatedAt,
    visibility: metadata.visibility,
    status: metadata.status,
    label: metadata.label,
    isReplay: metadata.isReplay,
    isSynthetic: metadata.isSynthetic,
    parentToolUseId: metadata.parentToolUseId,
    provider: metadata.provider
      ? AgentMessageProvider.ClaudeAgentSdk
      : undefined,
    providerSessionId: metadata.providerSessionId,
    providerMessageType: metadata.providerMessageType,
    providerSubtype: metadata.providerSubtype,
    providerUuid: metadata.providerUuid,
    rawStoredMessageId: metadata.rawStoredMessageId,
  };
}

function toPart(part: SharedAgentMessagePart): AgentMessagePart {
  switch (part.type) {
    case "text":
      return {
        $typeName: "AgentMessageTextPart",
        type: part.type,
        text: part.text,
        state: part.state,
      };
    case "reasoning":
      return {
        $typeName: "AgentMessageReasoningPart",
        type: part.type,
        text: part.text,
        state: part.state,
      };
    case "dynamic-tool":
      return {
        $typeName: "AgentMessageDynamicToolPart",
        type: part.type,
        toolName: part.toolName,
        toolCallId: part.toolCallId,
        title: part.title,
        providerExecuted: part.providerExecuted,
        state: part.state,
        input: "input" in part ? toJsonValue(part.input) : undefined,
        output: "output" in part ? toJsonValue(part.output) : undefined,
        errorText: "errorText" in part ? part.errorText : undefined,
        preliminary: "preliminary" in part ? part.preliminary : undefined,
        approval: "approval" in part ? part.approval : undefined,
      };
    case "data-tool_progress":
      return {
        $typeName: "AgentMessageToolProgressPart",
        type: part.type,
        data: {
          toolUseId: part.data.toolUseId,
          toolName: part.data.toolName,
          elapsedSeconds: part.data.elapsedSeconds,
        },
      };
    case "data-tool_summary":
      return {
        $typeName: "AgentMessageToolSummaryPart",
        type: part.type,
        data: {
          summary: part.data.summary,
          precedingToolUseIds: part.data.precedingToolUseIds,
        },
      };
    case "data-run_result":
      return {
        $typeName: "AgentMessageRunResultPart",
        type: part.type,
        data: {
          subtype: part.data.subtype,
          isError: part.data.isError,
          summaryText: part.data.summaryText,
          metrics: part.data.metrics,
        },
      };
    case "data-status_event":
      return {
        $typeName: "AgentMessageStatusEventPart",
        type: part.type,
        data: {
          subtype: part.data.subtype,
          data: toJsonValue(part.data.data),
        },
      };
    case "data-file_batch":
      return {
        $typeName: "AgentMessageFileBatchPart",
        type: part.type,
        data: {
          files: part.data.files,
          failed: part.data.failed,
          processedAt: part.data.processedAt,
        },
      };
    case "data-stream_event":
      return {
        $typeName: "AgentMessageStreamEventPart",
        type: part.type,
        data: {
          eventType: part.data.eventType,
          data: toJsonValue(part.data.data),
        },
      };
    case "data-error_event":
      return {
        $typeName: "AgentMessageErrorEventPart",
        type: part.type,
        data: {
          message: part.data.message,
          code: part.data.code,
        },
      };
    case "data-unknown_event":
      return {
        $typeName: "AgentMessageUnknownEventPart",
        type: part.type,
        data: {
          rawType: part.data.rawType,
          rawSubtype: part.data.rawSubtype,
          data: toJsonValue(part.data.data),
        },
      };
    default:
      throw new Error(`Unsupported agent message part type: ${part.type}`);
  }
}

export function toGraphQLAgentMessage(message: SharedAgentMessage): AgentMessage {
  return {
    id: message.id,
    role: message.role,
    metadata: toMetadata(message.metadata),
    parts: message.parts.map((part) => toPart(part)),
  };
}
