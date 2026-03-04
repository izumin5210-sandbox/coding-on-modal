import type { IDString } from "@gqlkit-ts/runtime";
import type {
  AgentMessageEventKind,
  AgentDynamicToolPart as SharedAgentDynamicToolPart,
  AgentMessage as SharedAgentMessage,
  AgentMessageMetadata as SharedAgentMessageMetadata,
  AgentMessagePart as SharedAgentMessagePart,
  AgentMessageRole as SharedAgentMessageRole,
  AgentReasoningPart as SharedAgentReasoningPart,
  AgentRunMetrics as SharedAgentRunMetrics,
  AgentRunResultData as SharedAgentRunResultData,
  AgentTextPart as SharedAgentTextPart,
} from "@/lib/session-chat-types";
import { defineResolveType } from "../gqlkit";
import type { AgentMessageEventData } from "./agent-message-events";
import type { JsonValue } from "./scalars";

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

type AgentMessageEventTypeName =
  | "AgentMessageToolProgressEvent"
  | "AgentMessageToolSummaryEvent"
  | "AgentMessageStatusEvent"
  | "AgentMessageFileBatchEvent"
  | "AgentMessageStreamEvent"
  | "AgentMessageErrorEvent"
  | "AgentMessageUnknownEvent";

const AGENT_MESSAGE_EVENT_TYPENAME_BY_KIND = {
  "tool-progress": "AgentMessageToolProgressEvent",
  "tool-summary": "AgentMessageToolSummaryEvent",
  status: "AgentMessageStatusEvent",
  "file-batch": "AgentMessageFileBatchEvent",
  stream: "AgentMessageStreamEvent",
  error: "AgentMessageErrorEvent",
  unknown: "AgentMessageUnknownEvent",
} as const satisfies Record<AgentMessageEventKind, AgentMessageEventTypeName>;

export const agentMessageEventDataResolveType =
  defineResolveType<AgentMessageEventData>(
    (value) => AGENT_MESSAGE_EVENT_TYPENAME_BY_KIND[value.kind],
  );

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
        data: part.data,
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
