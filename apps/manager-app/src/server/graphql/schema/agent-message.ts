import type { IDString } from "@gqlkit-ts/runtime";
import type {
  AgentMessage as SharedAgentMessage,
  AgentMessageEventData as SharedAgentMessageEventData,
  AgentMessagePart as SharedAgentMessagePart,
  AgentRunMetrics as SharedAgentRunMetrics,
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

export type AgentMessageEventKind =
  | "tool-progress"
  | "tool-summary"
  | "status"
  | "file-batch"
  | "stream"
  | "error"
  | "unknown";

export type AgentMessageToolProgressEvent = {
  $typeName: "AgentMessageToolProgressEvent";
  kind: AgentMessageEventKind;
  toolUseId: string;
  toolName: string;
  elapsedSeconds: number;
};

export type AgentMessageToolSummaryEvent = {
  $typeName: "AgentMessageToolSummaryEvent";
  kind: AgentMessageEventKind;
  summary: string;
  precedingToolUseIds: string[];
};

export type AgentMessageStatusEvent = {
  $typeName: "AgentMessageStatusEvent";
  kind: AgentMessageEventKind;
  subtype: string;
  data: JsonValue;
};

export type AgentMessageFileBatchFile = {
  filename: string;
  fileId: string;
};

export type AgentMessageFileBatchFailure = {
  filename: string;
  error: string;
};

export type AgentMessageFileBatchEvent = {
  $typeName: "AgentMessageFileBatchEvent";
  kind: AgentMessageEventKind;
  files: AgentMessageFileBatchFile[];
  failed: AgentMessageFileBatchFailure[];
  processedAt?: DateTime;
};

export type AgentMessageStreamEvent = {
  $typeName: "AgentMessageStreamEvent";
  kind: AgentMessageEventKind;
  eventType?: string;
  data: JsonValue;
};

export type AgentMessageErrorEvent = {
  $typeName: "AgentMessageErrorEvent";
  kind: AgentMessageEventKind;
  message: string;
  code?: string;
};

export type AgentMessageUnknownEvent = {
  $typeName: "AgentMessageUnknownEvent";
  kind: AgentMessageEventKind;
  rawType: string;
  rawSubtype?: string;
  data: JsonValue;
};

export type AgentMessageEventData =
  | AgentMessageToolProgressEvent
  | AgentMessageToolSummaryEvent
  | AgentMessageStatusEvent
  | AgentMessageFileBatchEvent
  | AgentMessageStreamEvent
  | AgentMessageErrorEvent
  | AgentMessageUnknownEvent;

export type AgentMessageEventPart = {
  $typeName: "AgentMessageEventPart";
  type: string;
  data: AgentMessageEventData;
};

export type AgentMessageResultMetrics = SharedAgentRunMetrics;

export type AgentMessageResultData = {
  subtype: string;
  isError: boolean;
  summaryText: string;
  metrics?: AgentMessageResultMetrics;
};

export type AgentMessageResultPart = {
  $typeName: "AgentMessageResultPart";
  type: string;
  data: AgentMessageResultData;
};

export type AgentMessagePart =
  | AgentMessageDynamicToolPart
  | AgentMessageEventPart
  | AgentMessageReasoningPart
  | AgentMessageResultPart
  | AgentMessageTextPart;

export type AgentMessage = {
  id: IDString;
  role: AgentMessageRole;
  metadata?: AgentMessageMetadata;
  parts: AgentMessagePart[];
};

export const agentMessageEventDataResolveType =
  defineResolveType<AgentMessageEventData>((value) => value.$typeName);

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

function toEventData(data: SharedAgentMessageEventData): AgentMessageEventData {
  switch (data.kind) {
    case "tool-progress":
      return {
        $typeName: "AgentMessageToolProgressEvent",
        kind: data.kind,
        toolUseId: data.toolUseId,
        toolName: data.toolName,
        elapsedSeconds: data.elapsedSeconds,
      };
    case "tool-summary":
      return {
        $typeName: "AgentMessageToolSummaryEvent",
        kind: data.kind,
        summary: data.summary,
        precedingToolUseIds: data.precedingToolUseIds,
      };
    case "status":
      return {
        $typeName: "AgentMessageStatusEvent",
        kind: data.kind,
        subtype: data.subtype,
        data: toJsonValue(data.data),
      };
    case "file-batch":
      return {
        $typeName: "AgentMessageFileBatchEvent",
        kind: data.kind,
        files: data.files,
        failed: data.failed,
        processedAt: data.processedAt,
      };
    case "stream":
      return {
        $typeName: "AgentMessageStreamEvent",
        kind: data.kind,
        eventType: data.eventType,
        data: toJsonValue(data.data),
      };
    case "error":
      return {
        $typeName: "AgentMessageErrorEvent",
        kind: data.kind,
        message: data.message,
        code: data.code,
      };
    case "unknown":
      return {
        $typeName: "AgentMessageUnknownEvent",
        kind: data.kind,
        rawType: data.rawType,
        rawSubtype: data.rawSubtype,
        data: toJsonValue(data.data),
      };
  }

  throw new Error(`Unsupported agent message event kind: ${String(data)}`);
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
    case "data-event":
      return {
        $typeName: "AgentMessageEventPart",
        type: part.type,
        data: toEventData(part.data),
      };
    case "data-result":
      return {
        $typeName: "AgentMessageResultPart",
        type: part.type,
        data: {
          subtype: part.data.subtype,
          isError: part.data.isError,
          summaryText: part.data.summaryText,
          metrics: part.data.metrics,
        },
      };
  }

  throw new Error(`Unsupported agent message part type: ${String(part)}`);
}

export function toGraphQLAgentMessage(
  message: SharedAgentMessage,
): AgentMessage {
  return {
    id: message.id,
    role: message.role,
    metadata: toMetadata(message.metadata),
    parts: message.parts.map((part) => toPart(part)),
  };
}
