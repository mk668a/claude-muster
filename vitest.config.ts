import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // Tests build real polyrepos under os.tmpdir() — give the watch test room to debounce.
    testTimeout: 15_000,
  },
});
