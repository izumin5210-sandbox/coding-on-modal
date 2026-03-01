import type { CodegenConfig } from "@graphql-codegen/cli";

const config: CodegenConfig = {
  schema: "./graphql/schema.graphql",
  documents: [
    "src/**/*.{ts,tsx}",
    "!src/lib/graphql/__generated__/**/*",
    "!src/server/graphql/**",
  ],
  ignoreNoDocuments: false,
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
