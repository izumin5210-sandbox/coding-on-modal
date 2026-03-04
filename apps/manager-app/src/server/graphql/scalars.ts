import type { GraphQLScalarType } from "graphql";
import { DateTimeResolver, JSONResolver } from "graphql-scalars";
import type { DateTime, JsonValue } from "./schema/scalars";

export const graphqlScalarResolvers: {
  DateTime: GraphQLScalarType<DateTime, DateTime>;
  JSON: GraphQLScalarType<JsonValue, JsonValue>;
} = {
  DateTime: DateTimeResolver as unknown as GraphQLScalarType<
    DateTime,
    DateTime
  >,
  JSON: JSONResolver as unknown as GraphQLScalarType<JsonValue, JsonValue>,
};
