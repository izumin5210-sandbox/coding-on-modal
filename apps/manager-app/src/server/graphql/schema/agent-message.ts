import type { IDString } from "@gqlkit-ts/runtime";
import type {
  AgentDynamicToolPart as SharedAgentDynamicToolPart,
  AgentErrorEvent as SharedAgentErrorEvent,
  AgentFileBatchFailure as SharedAgentFileBatchFailure,
  AgentFileBatchFile as SharedAgentFileBatchFile,
  AgentMessage as SharedAgentMessage,
  AgentMessageEventData as SharedAgentMessageEventData,
  AgentMessageMetadata as SharedAgentMessageMetadata,
  AgentMessagePart as SharedAgentMessagePart,
  AgentMessageRole as SharedAgentMessageRole,
  AgentReasoningPart as SharedAgentReasoningPart,
  AgentRunMetrics as SharedAgentRunMetrics,
  AgentRunResultData as SharedAgentRunResultData,
  AgentStatusEvent as SharedAgentStatusEvent,
  AgentStreamEvent as SharedAgentStreamEvent,
  AgentTextPart as SharedAgentTextPart,
  AgentToolProgressEvent as SharedAgentToolProgressEvent,
  AgentToolSummaryEvent as SharedAgentToolSummaryEvent,
  AgentUnknownEvent as SharedAgentUnknownEvent,
} from "@/lib/session-chat-types";
import { defineResolveType } from "../gqlkit";
import type { DateTime, JsonValue } from "./scalars";

export type AgentMessageMetadata = SharedAgentMessageMetadata;

export type AgentMessageTextPart = {
  $typeName: "AgentMessageTextPart";
  type: string;
  text: SharedAgentTextPart["text"];
  state?: string;
};

export type AgentMessageReasoningPart = {
  $typeName: "AgentMessageReasoningPart";
  type: string;
  text: SharedAgentReasoningPart["text"];
  state?: string;
};

export type AgentMessageDynamicToolPart = {
  $typeName: "AgentMessageDynamicToolPart";
  type: string;
  toolName: SharedAgentDynamicToolPart["toolName"];
  toolCallId: SharedAgentDynamicToolPart["toolCallId"];
  title?: SharedAgentDynamicToolPart["title"];
  providerExecuted?: SharedAgentDynamicToolPart["providerExecuted"];
  state: string;
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

export type AgentMessageToolProgressEvent = {
  $typeName: "AgentMessageToolProgressEvent";
  kind: string;
  toolUseId: SharedAgentToolProgressEvent["toolUseId"];
  toolName: SharedAgentToolProgressEvent["toolName"];
  elapsedSeconds: SharedAgentToolProgressEvent["elapsedSeconds"];
};

export type AgentMessageToolSummaryEvent = {
  $typeName: "AgentMessageToolSummaryEvent";
  kind: string;
  summary: SharedAgentToolSummaryEvent["summary"];
  precedingToolUseIds: SharedAgentToolSummaryEvent["precedingToolUseIds"];
};

export type AgentMessageStatusEvent = {
  $typeName: "AgentMessageStatusEvent";
  kind: string;
  subtype: SharedAgentStatusEvent["subtype"];
  data: JsonValue;
};

export type AgentMessageFileBatchFile = {
  filename: SharedAgentFileBatchFile["filename"];
  fileId: SharedAgentFileBatchFile["fileId"];
};

export type AgentMessageFileBatchFailure = {
  filename: SharedAgentFileBatchFailure["filename"];
  error: SharedAgentFileBatchFailure["error"];
};

export type AgentMessageFileBatchEvent = {
  $typeName: "AgentMessageFileBatchEvent";
  kind: string;
  files: AgentMessageFileBatchFile[];
  failed: AgentMessageFileBatchFailure[];
  processedAt?: DateTime;
};

export type AgentMessageStreamEvent = {
  $typeName: "AgentMessageStreamEvent";
  kind: string;
  eventType?: SharedAgentStreamEvent["eventType"];
  data: JsonValue;
};

export type AgentMessageErrorEvent = {
  $typeName: "AgentMessageErrorEvent";
  kind: string;
  message: SharedAgentErrorEvent["message"];
  code?: SharedAgentErrorEvent["code"];
};

export type AgentMessageUnknownEvent = {
  $typeName: "AgentMessageUnknownEvent";
  kind: string;
  rawType: SharedAgentUnknownEvent["rawType"];
  rawSubtype?: SharedAgentUnknownEvent["rawSubtype"];
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

export type AgentMessageResultData = SharedAgentRunResultData;

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

export type AgentMessage = Omit<
  SharedAgentMessage,
  "id" | "metadata" | "parts"
> & {
  id: IDString;
  role: SharedAgentMessageRole;
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
    provider: metadata.provider,
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
