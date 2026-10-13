import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

// `npm run test:rls`: the RLS checklist against the DEV project, through the real API, as the
// real test accounts. Reads VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY from .env.local
// and TEST_* from .env.test.local. Kept out of `npm test` so ordinary test runs and builds
// never touch the network. Never point it at PROD.
export default defineConfig(({ mode }) => ({
  test: {
    include: ['supabase/tests/**/*.test.ts'],
    environment: 'node',
    env: loadEnv(mode, process.cwd(), ''),
    testTimeout: 20_000,
  },
}))
