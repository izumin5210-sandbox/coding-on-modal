import type { CodegenConfig } from "@graphql-codegen/cli";

const config: CodegenConfig = {
  schema: "./graphql/schema.graphql",
  documents: [
    "src/**/*.{ts,tsx}",
    "!src/lib/graphql/__generated__/**/*",
    "!src/server/graphql/**",
  ],
  ignoreNoDocuments: false,
  hooks: {
    afterAllFileWrite: ["pnpm exec biome format --write src/lib/graphql/__generated__"],
  },
  generates: {
    "./src/lib/graphql/__generated__/": {
      preset: "client",
      config: {
        documentMode: "documentNode",
        enumsAsTypes: true,
        useTypeImports: true,
        scalars: {
          DateTime: "string",
          JSON: "unknown",
        },
      },
      presetConfig: {
        fragmentMasking: false,
        gqlTagName: "graphql",
      },
    },
  },
};

export default config;
