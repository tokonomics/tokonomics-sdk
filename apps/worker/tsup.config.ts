import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs"],
  external: ["@prisma/client"],
  noExternal: ["@tokonomics/db", "@tokonomics/shared"],
  splitting: false,
  clean: true,
  sourcemap: false,
});
