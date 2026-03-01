import type { TypedDocumentNode } from "@graphql-typed-document-node/core";
import type { DocumentNode } from "graphql";
import { print } from "graphql";

type GraphQLErrorPayload = {
  message?: string;
  extensions?: {
    code?: string;
  };
};

type GraphQLResponse<TData> = {
  data?: TData;
  errors?: GraphQLErrorPayload[];
};

export class GraphQLRequestError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "GraphQLRequestError";
  }
}

function getOperationText<TResult, TVariables>(
  document: TypedDocumentNode<TResult, TVariables>,
): string {
  return print(document as DocumentNode);
}

export async function executeGraphQL<TResult, TVariables>(
  document: TypedDocumentNode<TResult, TVariables>,
  variables: TVariables,
): Promise<TResult> {
  const response = await fetch("/api/graphql", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    cache: "no-store",
    credentials: "same-origin",
    body: JSON.stringify({
      query: getOperationText(document),
      variables,
    }),
  });

  const body = (await response
    .json()
    .catch(() => null)) as GraphQLResponse<TResult> | null;
  const firstError = body?.errors?.[0];

  if (!response.ok || firstError || !body?.data) {
    throw new GraphQLRequestError(
      firstError?.message ?? `Request failed (${response.status})`,
      firstError?.extensions?.code,
    );
  }

  return body.data;
}
