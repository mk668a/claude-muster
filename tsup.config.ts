import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  target: "node18",
  platform: "node",
  clean: true,
  // Single self-contained CLI: a shebang so `dist/cli.js` runs directly (no npm publish needed).
  banner: { js: "#!/usr/bin/env node" },
  // Bundle deps so `npx claude-muster` works straight from the repo / a release tarball.
  noExternal: [/.*/],
});
