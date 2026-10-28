import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // The audit and registry tests make real outbound requests; keep them serial
    // and give them room so a slow network does not look like a failure.
    testTimeout: 45_000,
    pool: 'forks',
  },
});
