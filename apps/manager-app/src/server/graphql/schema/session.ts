import type { GqlObject, IDString, Int, NoArgs } from "@gqlkit-ts/runtime";
import {
  getSessionRecord,
  listSessionRecords,
  SessionError,
} from "@/server/sessions/service";
import { requireViewerId, toGraphQLError } from "../errors";
import { defineField, defineQuery } from "../gqlkit";
import type { DateTime } from "./scalars";

export type SessionStatus = "creating" | "running" | "terminated" | "error";

export type SessionSshInfo = {
  user: string;
  host: string;
  port: Int;
  hostKeyFingerprint: string;
  knownHostsEntry: string;
  command: string;
};

export type Session = GqlObject<
  {
    id: IDString;
    name: string;
    repoUrl: string;
    repoRef: string;
    status: SessionStatus;
    workspacePath: string;
    createdAt: DateTime;
    updatedAt: DateTime;
    lastError?: string;
    ssh?: SessionSshInfo | null;
  },
  { ignoreFields: "ssh" }
>;

function toGraphQLSessionSshInfo(
  ssh: NonNullable<Session["ssh"]>,
): SessionSshInfo {
  return {
    user: ssh.user,
    host: ssh.host,
    port: ssh.port as Int,
    hostKeyFingerprint: ssh.hostKeyFingerprint,
    knownHostsEntry: ssh.knownHostsEntry,
    command: ssh.command,
  };
}

function toGraphQLSession(record: {
  id: string;
  name: string;
  repoUrl: string;
  repoRef: string;
  status: SessionStatus;
  workspacePath: string;
  createdAt: string;
  updatedAt: string;
  lastError?: string;
  ssh?: {
    user: string;
    host: string;
    port: number;
    hostKeyFingerprint: string;
    knownHostsEntry: string;
    command: string;
  } | null;
}): Session {
  return {
    id: record.id,
    name: record.name,
    repoUrl: record.repoUrl,
    repoRef: record.repoRef,
    status: record.status,
    workspacePath: record.workspacePath,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    lastError: record.lastError,
    ssh: record.ssh ? toGraphQLSessionSshInfo(record.ssh) : record.ssh,
  };
}

export const sessions = defineQuery<NoArgs, Session[]>(
  async (_root, _args, context) => {
    try {
      const viewerId = requireViewerId(context);
      const records = await listSessionRecords(context.db, viewerId);
      return records.map((record) => toGraphQLSession(record));
    } catch (error) {
      throw toGraphQLError(error);
    }
  },
);

export const session = defineQuery<{ id: IDString }, Session | null>(
  async (_root, args, context) => {
    try {
      const viewerId = requireViewerId(context);
      const record = await getSessionRecord(context.db, viewerId, args.id);
      return toGraphQLSession(record);
    } catch (error) {
      if (error instanceof SessionError && error.statusCode === 404) {
        return null;
      }

      throw toGraphQLError(error);
    }
  },
);

export const ssh = defineField<Session, NoArgs, SessionSshInfo | null>(
  async (parent, _args, context) => {
    try {
      if (parent.ssh !== undefined) {
        return parent.ssh;
      }

      const viewerId = requireViewerId(context);
      const record = await getSessionRecord(context.db, viewerId, parent.id);
      return record.ssh ? toGraphQLSessionSshInfo(record.ssh) : null;
    } catch (error) {
      throw toGraphQLError(error);
    }
  },
);
