import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/dist/**'],
    coverage: {
      provider: 'v8',
      all: true,
      include: ['src/**/*.ts'],
      exclude: [
        // 1. Core configs and setup files
        'src/config/**/*',
        'src/index.ts',

        // 2. Purely declarative files (Zod schemas & Express routes)
        'src/**/*.schema.ts',
        'src/**/*.routes.ts',

        // 3. Database & external clients (usually mocked anyway)
        'src/lib/*.client.ts',
        'src/lib/prisma.ts',
        'src/lib/stripe.ts',

        // 4. Test files and type definitions
        'src/**/*.test.ts',
        'src/**/*.d.ts',
        'src/types/**/*',
      ],
    },
  },
});
