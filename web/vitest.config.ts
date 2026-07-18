import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Mirror the tsconfig path alias (@/* -> ./*) so tests can import route handlers
// that reference `@/lib/...`. Without this, vitest treats `@/lib/deals` as a
// bare package and fails to resolve it.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
})
