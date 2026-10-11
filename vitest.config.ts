import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // 試合を何十本も回すテストがあるので、遅いマシンでも落ちないようにする
    testTimeout: 30000,
  },
});
