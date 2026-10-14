import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
// vitest/config so the `test` block below is typed
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // A staff phone that scans a QR label gets the service worker too. Without this it would
        // quietly download the whole admin app and the Excel library in the background, on
        // mobile data. They are still fetched (and cached by the browser) the first time the
        // admin opens them; the app needs the network for Supabase anyway.
        globIgnores: ['**/App-*.js', '**/exceljs*.js'],
      },
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Phoenix Inventory',
        short_name: 'Inventory',
        description: 'IT and asset inventory for Phoenix BPO Solutions',
        theme_color: '#0f172a',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // Some tests import modules that create the Supabase client, which refuses to start without
    // these two names. Unit tests never call Supabase, so placeholders are enough; without them
    // `npm test` fails in CI, which has no .env.local.
    env: {
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_unit_tests_only',
    },
    // supabase/tests talks to the real DEV project; it runs only via `npm run test:rls`.
    exclude: [...configDefaults.exclude, 'supabase/**'],
    css: true,
  },
})
