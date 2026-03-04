import type { GqlObject } from "@gqlkit-ts/runtime";
import type { JsonValue } from "./graphql-scalar-types";
import type {
  AgentDynamicToolPart as SharedAgentDynamicToolPart,
  AgentMessageEventData,
  AgentReasoningPart as SharedAgentReasoningPart,
  AgentRunResultData as SharedAgentRunResultData,
  AgentTextPart as SharedAgentTextPart,
} from "./session-chat-types";

export type AgentMessageTextPart = GqlObject<
  SharedAgentTextPart,
  { ignoreFields: "type" }
>;

export type AgentMessageReasoningPart = GqlObject<
  SharedAgentReasoningPart,
  { ignoreFields: "type" }
>;

export type AgentMessageDynamicToolPartApproval = {
  id: string;
  approved?: boolean;
  reason?: string;
};

export type AgentMessageDynamicToolPart = GqlObject<
  {
    type: "dynamic-tool";
    toolName: SharedAgentDynamicToolPart["toolName"];
    toolCallId: SharedAgentDynamicToolPart["toolCallId"];
    title?: SharedAgentDynamicToolPart["title"];
    providerExecuted?: SharedAgentDynamicToolPart["providerExecuted"];
    state: SharedAgentDynamicToolPart["state"];
    input?: JsonValue;
    output?: JsonValue;
    errorText?: string;
    preliminary?: boolean;
    approval?: AgentMessageDynamicToolPartApproval;
  },
  { ignoreFields: "type" }
>;

export type AgentMessageEventPart = GqlObject<
  {
    type: "data-event";
    data: AgentMessageEventData;
  },
  { ignoreFields: "type" }
>;

export type AgentMessageResultData = SharedAgentRunResultData;

export type AgentMessageResultPart = GqlObject<
  {
    type: "data-result";
    data: AgentMessageResultData;
  },
  { ignoreFields: "type" }
>;

export type AgentMessagePart =
  | AgentMessageDynamicToolPart
  | AgentMessageEventPart
  | AgentMessageReasoningPart
  | AgentMessageResultPart
  | AgentMessageTextPart;
