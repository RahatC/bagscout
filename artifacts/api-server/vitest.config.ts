import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // Tests share a single Postgres dev DB and clean up by user-id prefix /
    // test source slug. Running test files in parallel would race those
    // mutations, so we serialize file execution.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 20000,
  },
  forks: {
    singleFork: true,
  },
});
