import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Next.js má v tsconfigu `jsx: "preserve"` (prekladá si ho sám), takže
  // transformácia by JSX nechala tak a testy PDF reportu spadnú na syntax.
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
      'server-only': new URL('./src/test/server-only-stub.ts', import.meta.url).pathname,
    },
  },
});
