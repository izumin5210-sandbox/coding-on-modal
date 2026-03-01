import { GraphQLError } from "graphql";
import { ZodError } from "zod";
import { AuthError } from "@/server/auth/session";
import { SessionError } from "@/server/sessions/service";

function errorExtensions(
  code: string,
  httpStatus: number,
  extra?: Record<string, unknown>,
) {
  return {
    code,
    httpStatus,
    ...extra,
  };
}

export function toGraphQLError(error: unknown): GraphQLError {
  if (error instanceof GraphQLError) {
    return error;
  }

  if (error instanceof AuthError) {
    return new GraphQLError(error.message, {
      extensions: errorExtensions("UNAUTHENTICATED", error.statusCode),
    });
  }

  if (error instanceof ZodError) {
    return new GraphQLError("Invalid input", {
      extensions: errorExtensions("BAD_USER_INPUT", 400, {
        validationIssues: error.issues.map((issue) => ({
          path: issue.path,
          message: issue.message,
          code: issue.code,
        })),
      }),
    });
  }

  if (error instanceof SessionError) {
    const code =
      error.statusCode === 404
        ? "NOT_FOUND"
        : error.statusCode === 409
          ? "CONFLICT"
          : error.statusCode === 400
            ? "BAD_USER_INPUT"
            : "INTERNAL_SERVER_ERROR";
    return new GraphQLError(error.message, {
      extensions: errorExtensions(code, error.statusCode),
    });
  }

  return new GraphQLError(
    error instanceof Error ? error.message : "Internal server error",
    {
      extensions: errorExtensions("INTERNAL_SERVER_ERROR", 500),
    },
  );
}

export function requireViewerId(context: {
  viewer: { id: string } | null;
}): string {
  if (!context.viewer) {
    throw new GraphQLError("Authentication required", {
      extensions: errorExtensions("UNAUTHENTICATED", 401),
    });
  }

  return context.viewer.id;
}
