import type { IDString, NoArgs } from "@gqlkit-ts/runtime";
import type { AuthUser as AppAuthUser } from "@/lib/auth-types";
import { hasClaudeCredentialByUserId } from "@/server/users/store";
import { defineQuery } from "../gqlkit";

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
