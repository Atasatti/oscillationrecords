import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// Minimal harness: node environment (all tested units are pure — no DOM), with
// `@/*` aliases read straight from tsconfig.json via the plugin.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
  },
});
