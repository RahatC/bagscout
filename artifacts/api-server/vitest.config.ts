import { defineConfig } from "vitest/config";

const hasDatabaseUrl = Boolean(
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL,
);

const databaseBackedTests = [
  "src/lib/digest.test.ts",
  "src/lib/ingest.test.ts",
  "src/routes/**/*.test.ts",
];

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: hasDatabaseUrl ? [] : databaseBackedTests,
    environment: "node",
    setupFiles: hasDatabaseUrl
      ? ["./src/test-utils/setup.ts"]
      : ["./src/test-utils/setup-no-db.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
