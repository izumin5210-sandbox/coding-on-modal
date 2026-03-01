import type { IDString, NoArgs } from "@gqlkit-ts/runtime";
import { z } from "zod";
import type { AuthUser as AppAuthUser } from "@/lib/auth-types";
import { encryptToken } from "@/server/crypto/token";
import { hasClaudeCredentialByUserId } from "@/server/users/store";
import { upsertClaudeCredentialByUserId } from "@/server/users/store";
import { requireViewerId, toGraphQLError } from "../errors";
import { defineMutation, defineQuery } from "../gqlkit";

export type GithubAccount = {
  id: IDString;
  login: string;
  name?: string;
  email?: string;
  avatarUrl?: string;
};

export type AuthUser = {
  id: IDString;
  github: GithubAccount;
};

export type Viewer = {
  user: AuthUser;
  claudeApiKeyConfigured: boolean;
};

export type SaveClaudeApiKeyInput = {
  apiKey: string;
};

export type SaveClaudeApiKeyPayload = {
  claudeApiKeyConfigured: boolean;
};

const saveClaudeApiKeyInputSchema = z.object({
  apiKey: z.string().trim().min(1, "apiKey is required"),
});

function toGraphQLAuthUser(user: AppAuthUser): AuthUser {
  return {
    id: user.id,
    github: {
      id: user.github.id,
      login: user.github.login,
      name: user.github.name,
      email: user.github.email,
      avatarUrl: user.github.avatarUrl,
    },
  };
}

export const viewer = defineQuery<NoArgs, Viewer | null>(
  async (_root, _args, context) => {
    if (!context.viewer) {
      return null;
    }

    return {
      user: toGraphQLAuthUser(context.viewer),
      claudeApiKeyConfigured: hasClaudeCredentialByUserId(
        context.db,
        context.viewer.id,
      ),
    };
  },
);

export const saveClaudeApiKey = defineMutation<
  { input: SaveClaudeApiKeyInput },
  SaveClaudeApiKeyPayload
>(async (_root, args, context) => {
  try {
    const viewerId = requireViewerId(context);
    const input = saveClaudeApiKeyInputSchema.parse(args.input);

    upsertClaudeCredentialByUserId(
      context.db,
      viewerId,
      encryptToken(input.apiKey),
    );

    return {
      claudeApiKeyConfigured: true,
    };
  } catch (error) {
    throw toGraphQLError(error);
  }
});
