import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

export default defineConfig({
  // Every page renders per request, so the sign-in check in src/middleware.ts runs before each screen.
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  // Vite rejects requests for unknown hostnames; these let a shared tunnel link reach the dev or preview server.
  server: { allowedHosts: ['.trycloudflare.com', '.devtunnels.ms'] },
  redirects: { '/designer': '/designer/inquiry' },
});
