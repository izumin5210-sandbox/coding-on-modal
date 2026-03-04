import { makeExecutableSchema } from "@graphql-tools/schema";
import { createResolvers } from "./__generated__/resolvers";
import { typeDefs } from "./__generated__/typeDefs";
import { graphqlScalarResolvers } from "./scalars";

export const schema = makeExecutableSchema({
  typeDefs,
  resolvers: [createResolvers({ scalars: graphqlScalarResolvers })],
});
