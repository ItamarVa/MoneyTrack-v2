import path from "node:path";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "apps/web/src"),
    },
  },
  // apps/web tsconfig sets jsx "preserve" for Next; Vite 8's oxc transform
  // honours it and would hand raw JSX to the import parser.
  oxc: {
    jsx: { runtime: "automatic" },
  },
  test: {
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts", "scripts/**/*.test.mjs"],
    // `next build` copies test files into apps/web/.next/standalone.
    exclude: [...configDefaults.exclude, "**/.next/**", "**/node_modules/**"],
    // The database handle is a module-level singleton shared by every worker,
    // so files that open their own test database must not run concurrently.
    fileParallelism: false,
  },
});
