import { createGqlkitApis } from "@gqlkit-ts/runtime";
import type { GraphQLContext } from "./context";

export const {
  defineField,
  defineMutation,
  defineQuery,
  defineResolveType,
} =
  createGqlkitApis<GraphQLContext>();
