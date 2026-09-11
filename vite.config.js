import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
export default defineConfig({
  server: { hmr: false },
  resolve: {
    alias: {
      "@dgreenheck/ez-tree": fileURLToPath(
        new URL(
          "./node_modules/@dgreenheck/ez-tree/src/lib/index.js",
          import.meta.url,
        ),
      ),
    },
  },
});
