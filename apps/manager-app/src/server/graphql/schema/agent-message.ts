import type { IDString } from "@gqlkit-ts/runtime";
import type {
  AgentMessageEventKind,
  AgentMessage as SharedAgentMessage,
  AgentMessageMetadata as SharedAgentMessageMetadata,
  AgentMessagePart as SharedAgentMessagePart,
  AgentMessageRole as SharedAgentMessageRole,
} from "@/lib/session-chat-types";
import { defineResolveType } from "../gqlkit";
import type { AgentMessageEventData } from "./agent-message-events";
import type { AgentMessagePart } from "./agent-message-parts";
import type {
  AgentMessageDynamicToolPart,
  AgentMessageEventPart,
  AgentMessageResultPart,
} from "@/lib/agent-message-part-graphql-types";
import type { JsonValue } from "./scalars";

export type AgentMessageMetadata = SharedAgentMessageMetadata;

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

type SupportedSharedAgentMessagePartType =
  | "dynamic-tool"
  | "data-event"
  | "reasoning"
  | "data-result"
  | "text";

type AgentMessagePartTypeName =
  | "AgentMessageDynamicToolPart"
  | "AgentMessageEventPart"
  | "AgentMessageReasoningPart"
  | "AgentMessageResultPart"
  | "AgentMessageTextPart";

const AGENT_MESSAGE_PART_TYPENAME_BY_TYPE = {
  "dynamic-tool": "AgentMessageDynamicToolPart",
  "data-event": "AgentMessageEventPart",
  reasoning: "AgentMessageReasoningPart",
  "data-result": "AgentMessageResultPart",
  text: "AgentMessageTextPart",
} as const satisfies Record<
  SupportedSharedAgentMessagePartType,
  AgentMessagePartTypeName
>;

export const agentMessagePartResolveType = defineResolveType<AgentMessagePart>(
  (value) => AGENT_MESSAGE_PART_TYPENAME_BY_TYPE[value.type],
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
      return part;
    case "reasoning":
      return part;
    case "dynamic-tool":
      return {
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
      } satisfies AgentMessageDynamicToolPart;
    case "data-event":
      return {
        type: part.type,
        data: part.data,
      } satisfies AgentMessageEventPart;
    case "data-result":
      return {
        type: part.type,
        data: {
          subtype: part.data.subtype,
          isError: part.data.isError,
          summaryText: part.data.summaryText,
          metrics: part.data.metrics,
        },
      } satisfies AgentMessageResultPart;
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
