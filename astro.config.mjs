import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

export default defineConfig({
  // Pages stay static except the Designer, which asks RSOP's flow API on every request.
  adapter: node({ mode: 'standalone' }),
  // Vite rejects requests for unknown hostnames; these let a shared tunnel link reach the dev or preview server.
  server: { allowedHosts: ['.trycloudflare.com', '.devtunnels.ms'] },
  redirects: { '/designer': '/designer/inquiry' },
});
