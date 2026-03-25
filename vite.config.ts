import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fcmServiceWorkerPlugin } from './vite-plugin-fcm-sw';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const crmBase = (env.VITE_CRM_URL || 'http://localhost:3000').replace(/\/$/, '');

  return {
    plugins: [
      fcmServiceWorkerPlugin(),
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        devOptions: { enabled: false },
        includeAssets: ['favicon.svg', 'apple-icon-180.png'],
        manifest: {
          name: 'Hearing Hope Staff Telecalling',
          short_name: 'HH Telecalling',
          description: 'Enquiries, telecalling log, and appointments for Hearing Hope staff',
          theme_color: '#0D9488',
          background_color: '#F8FAFC',
          display: 'standalone',
          orientation: 'portrait',
          scope: '/',
          start_url: '/',
          icons: [
            {
              src: '/manifest-icon-192.maskable.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/manifest-icon-192.maskable.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'maskable',
            },
            {
              src: '/manifest-icon-512.maskable.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/manifest-icon-512.maskable.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          navigateFallbackDenylist: [/^\/api\//, /^\/firebase-messaging-sw\.js$/],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              },
            },
          ],
        },
      }),
    ],
    server: {
      proxy: {
        // Dev only: browser calls same-origin /api/mobile-login → Vite forwards to CRM (no CORS).
        '/api/mobile-login': {
          target: crmBase,
          changeOrigin: true,
          secure: crmBase.startsWith('https:'),
        },
        '/api/send-appointment-notification': {
          target: crmBase,
          changeOrigin: true,
          secure: crmBase.startsWith('https:'),
        },
      },
    },
  };
});
