import { defineConfig } from "@gqlkit-ts/cli";

export default defineConfig({
  sourceDir: "src/server/graphql/schema",
  hooks: {
    afterAllFileWrite: "pnpm exec biome format --write",
  },
  output: {
    resolversPath: "src/server/graphql/__generated__/resolvers.ts",
    typeDefsPath: "src/server/graphql/__generated__/typeDefs.ts",
    schemaPath: "graphql/schema.graphql",
    importExtension: "none",
  },
  tsconfigPath: "./tsconfig.json",
});
