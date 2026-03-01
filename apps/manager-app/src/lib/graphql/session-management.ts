import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AuthUser } from "@/lib/auth-types";
import type {
  SessionExecResult,
  SessionRecord,
  SessionStatus,
} from "@/lib/session-types";
import type {
  CreateSessionMutationMutation,
  CreateSessionMutationMutationVariables,
  ExecuteSessionMutationMutation,
  ExecuteSessionMutationMutationVariables,
  SaveClaudeApiKeyMutationMutation,
  SaveClaudeApiKeyMutationMutationVariables,
  SessionDetailQueryQuery,
  SessionDetailQueryQueryVariables,
  SessionsQueryQuery,
  TerminateSessionMutationMutation,
  TerminateSessionMutationMutationVariables,
  ViewerQueryQuery,
} from "@/lib/graphql/__generated__/graphql";
import { executeGraphQL } from "./client";
import {
  createSessionDocument,
  executeSessionDocument,
  saveClaudeApiKeyDocument,
  sessionDetailDocument,
  sessionsDocument,
  terminateSessionDocument,
  viewerDocument,
} from "./operations";

type Viewer = NonNullable<ViewerQueryQuery["viewer"]>;
type GraphQLSession = NonNullable<
  SessionsQueryQuery["sessions"][number] | SessionDetailQueryQuery["session"]
>;

function toSessionStatus(status: GraphQLSession["status"]): SessionStatus {
  switch (status) {
    case "CREATING":
      return "creating";
    case "RUNNING":
      return "running";
    case "TERMINATED":
      return "terminated";
    case "ERROR":
      return "error";
  }
}

function toAuthUser(user: Viewer["user"]): AuthUser {
  return {
    id: user.id,
    github: {
      id: user.github.id,
      login: user.github.login,
      name: user.github.name ?? undefined,
      email: user.github.email ?? undefined,
      avatarUrl: user.github.avatarUrl ?? undefined,
    },
  };
}

function toSessionRecord(session: GraphQLSession): SessionRecord {
  return {
    id: session.id,
    name: session.name,
    repoUrl: session.repoUrl,
    repoRef: session.repoRef,
    status: toSessionStatus(session.status),
    workspacePath: session.workspacePath,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    lastError: session.lastError ?? undefined,
    ssh:
      "ssh" in session && session.ssh
        ? {
            user: session.ssh.user,
            host: session.ssh.host,
            port: session.ssh.port,
            hostKeyFingerprint: session.ssh.hostKeyFingerprint,
            knownHostsEntry: session.ssh.knownHostsEntry,
            command: session.ssh.command,
          }
        : undefined,
  };
}

function toSessionExecResult(
  result: ExecuteSessionMutationMutation["executeSession"],
): SessionExecResult {
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
  };
}

export function getViewerQueryKey() {
  return ["graphql", "viewer"] as const;
}

export function getSessionsQueryKey() {
  return ["graphql", "sessions"] as const;
}

export function getSessionDetailQueryKey(sessionId: string) {
  return ["graphql", "session", sessionId] as const;
}

export function useViewerQuery() {
  return useQuery({
    queryKey: getViewerQueryKey(),
    queryFn: async () => {
      const result = await executeGraphQL<
        ViewerQueryQuery,
        Record<string, never>
      >(viewerDocument, {});

      if (!result.viewer) {
        return null;
      }

      return {
        user: toAuthUser(result.viewer.user),
        claudeApiKeyConfigured: result.viewer.claudeApiKeyConfigured,
      };
    },
  });
}

export function useSessionsQuery(enabled: boolean) {
  return useQuery({
    queryKey: getSessionsQueryKey(),
    enabled,
    queryFn: async () => {
      const result = await executeGraphQL<
        SessionsQueryQuery,
        Record<string, never>
      >(sessionsDocument, {});

      return result.sessions.map((session) => toSessionRecord(session));
    },
  });
}

export function useSessionDetailQuery(
  sessionId: string | null,
  enabled: boolean,
) {
  return useQuery({
    queryKey: sessionId
      ? getSessionDetailQueryKey(sessionId)
      : ["graphql", "session", "none"],
    enabled: enabled && sessionId !== null,
    queryFn: async () => {
      const result = await executeGraphQL<
        SessionDetailQueryQuery,
        SessionDetailQueryQueryVariables
      >(sessionDetailDocument, {
        id: sessionId ?? "",
      });

      return result.session ? toSessionRecord(result.session) : null;
    },
  });
}

export function useCreateSessionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (variables: CreateSessionMutationMutationVariables) => {
      const result = await executeGraphQL<
        CreateSessionMutationMutation,
        CreateSessionMutationMutationVariables
      >(createSessionDocument, variables);

      return toSessionRecord(result.createSession);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: getSessionsQueryKey() });
    },
  });
}

export function useSaveClaudeApiKeyMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (variables: SaveClaudeApiKeyMutationMutationVariables) =>
      executeGraphQL<
        SaveClaudeApiKeyMutationMutation,
        SaveClaudeApiKeyMutationMutationVariables
      >(saveClaudeApiKeyDocument, variables),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: getViewerQueryKey() });
    },
  });
}

export function useTerminateSessionMutation(sessionId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      variables: TerminateSessionMutationMutationVariables,
    ) => {
      const result = await executeGraphQL<
        TerminateSessionMutationMutation,
        TerminateSessionMutationMutationVariables
      >(terminateSessionDocument, variables);

      return toSessionRecord(result.terminateSession);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: getSessionsQueryKey() });

      if (sessionId) {
        await queryClient.invalidateQueries({
          queryKey: getSessionDetailQueryKey(sessionId),
        });
      }
    },
  });
}

export function useExecuteSessionMutation(sessionId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (variables: ExecuteSessionMutationMutationVariables) => {
      const result = await executeGraphQL<
        ExecuteSessionMutationMutation,
        ExecuteSessionMutationMutationVariables
      >(executeSessionDocument, variables);

      return toSessionExecResult(result.executeSession);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: getSessionsQueryKey() });

      if (sessionId) {
        await queryClient.invalidateQueries({
          queryKey: getSessionDetailQueryKey(sessionId),
        });
      }
    },
  });
}
