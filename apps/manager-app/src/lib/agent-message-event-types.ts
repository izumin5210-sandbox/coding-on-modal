import type { GqlObject } from "@gqlkit-ts/runtime";
import type { DateTime, JsonValue } from "./graphql-scalar-types";

export type AgentMessageEventKind =
  | "tool-progress"
  | "tool-summary"
  | "status"
  | "file-batch"
  | "stream"
  | "error"
  | "unknown";

export type AgentMessageToolProgressEvent = GqlObject<
  {
    kind: "tool-progress";
    toolUseId: string;
    toolName: string;
    elapsedSeconds: number;
  },
  { ignoreFields: "kind" }
>;

export type AgentMessageToolSummaryEvent = GqlObject<
  {
    kind: "tool-summary";
    summary: string;
    precedingToolUseIds: string[];
  },
  { ignoreFields: "kind" }
>;

export type AgentMessageStatusEvent = GqlObject<
  {
    kind: "status";
    subtype: string;
    data: JsonValue;
  },
  { ignoreFields: "kind" }
>;

export type AgentMessageFileBatchFile = {
  filename: string;
  fileId: string;
};

export type AgentMessageFileBatchFailure = {
  filename: string;
  error: string;
};

export type AgentMessageFileBatchEvent = GqlObject<
  {
    kind: "file-batch";
    files: AgentMessageFileBatchFile[];
    failed: AgentMessageFileBatchFailure[];
    processedAt?: DateTime;
  },
  { ignoreFields: "kind" }
>;

export type AgentMessageStreamEvent = GqlObject<
  {
    kind: "stream";
    eventType?: string;
    data: JsonValue;
  },
  { ignoreFields: "kind" }
>;

export type AgentMessageErrorEvent = GqlObject<
  {
    kind: "error";
    message: string;
    code?: string;
  },
  { ignoreFields: "kind" }
>;

export type AgentMessageUnknownEvent = GqlObject<
  {
    kind: "unknown";
    rawType: string;
    rawSubtype?: string;
    data: JsonValue;
  },
  { ignoreFields: "kind" }
>;

export type AgentMessageEventData =
  | AgentMessageToolProgressEvent
  | AgentMessageToolSummaryEvent
  | AgentMessageStatusEvent
  | AgentMessageFileBatchEvent
  | AgentMessageStreamEvent
  | AgentMessageErrorEvent
  | AgentMessageUnknownEvent;
