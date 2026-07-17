import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        // 1. Core configs and engine entry points
        'src/config/**/*',
        'src/index.ts',
        'src/app.ts',

        // 2. Shared infrastructure & custom client extensions (fully mocked)
        'src/lib/**/*',

        // 3. Global HTTP Middlewares (globally mocked out in setup)
        'src/middleware/**/*',

        // 4. Background queue infrastructure & local outbox workers
        'src/queues/**/*',

        // 5. Purely declarative files (Zod configurations & schemas)
        'src/**/*.schema.ts',
        'src/**/*.routes.ts',
        'src/**/*.openapi.ts',

        // 6. Test suites and ambient type declarations
        'src/**/*.test.ts',
        'src/**/*.d.ts',
        'src/types/**/*',
      ],
    },
  },
});
