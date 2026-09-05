import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // React Compiler advisory: a synchronous setState inside an effect costs an
      // extra render, it is not a correctness bug. 47 legacy sites (loading flags
      // before a fetch) are being converted incrementally; keep them visible as
      // warnings without blocking the lint gate on them.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Design-handoff prototype (React sketches, not app code).
    "redesign/**",
  ]),
]);

export default eslintConfig;
