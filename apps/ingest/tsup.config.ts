import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs"],
  // Keep Prisma external — it needs its native query engine binary at runtime
  external: ["@prisma/client"],
  // Inline workspace packages into the bundle (they're TS source, not published npm packages)
  noExternal: ["@tokonomics/db", "@tokonomics/shared"],
  splitting: false,
  clean: true,
  sourcemap: false,
});
