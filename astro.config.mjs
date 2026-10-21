import { defineConfig } from 'astro/config';

export default defineConfig({
  // Vite rejects requests for unknown hostnames; these let a shared tunnel link reach the dev or preview server.
  server: { allowedHosts: ['.trycloudflare.com', '.devtunnels.ms'] },
  redirects: { '/designer': '/designer/inquiry' },
});
