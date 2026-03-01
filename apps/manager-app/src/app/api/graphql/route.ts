import { createYoga } from "graphql-yoga";
import { createGraphQLContext } from "@/server/graphql/context";
import { schema } from "@/server/graphql/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const yoga = createYoga({
  schema,
  graphqlEndpoint: "/api/graphql",
  context: async ({ request }) => createGraphQLContext(request),
});

export { yoga as GET, yoga as POST, yoga as OPTIONS };
