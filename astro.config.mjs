import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

export default defineConfig({
  // Every page renders per request, so the sign-in check in src/middleware.ts runs before each screen.
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  // Vite rejects requests for unknown hostnames; these let a shared tunnel link reach the dev or preview server.
  server: { allowedHosts: ['.trycloudflare.com', '.devtunnels.ms'] },
  // Hosts the built server trusts; any other Host is treated as localhost, which fails the sign-in form's origin check.
  security: { allowedDomains: [{ hostname: '10.0.150.35' }, { hostname: 'dib-uat' }, { hostname: '*.trycloudflare.com' }] },
  redirects: { '/designer': '/designer/inquiry' },
});
