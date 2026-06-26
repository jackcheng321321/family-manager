import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: "esm",
  noExternal: ["@caiwu/shared"],
  clean: true,
});
