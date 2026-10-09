import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // エンジンは UI から独立した純粋な TypeScript にする（CLAUDE.md）。
  {
    files: ["src/engine/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["react", "react-*", "next", "next/*", "zustand", "zustand/*", "@/app/*", "@/components/*", "@/store/*", "@/lib/*"], message: "src/engine は UI・ブラウザに依存させない" },
          ],
        },
      ],
      "no-restricted-globals": ["error", "window", "document", "localStorage", "sessionStorage", "navigator", "indexedDB"],
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "random", message: "乱数は src/engine/rng を使う" },
      ],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "random", message: "乱数は src/engine/rng を使う" },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default eslintConfig;
