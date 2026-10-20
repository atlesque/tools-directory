import { defineConfig, envField } from 'astro/config';

export default defineConfig({
  site: 'https://tools.atlesque.dev',
  server: { port: 8425 },
  env: {
    schema: {
      TOOLS_API_URL: envField.string({ context: 'server', access: 'secret', optional: true }),
      // Set by Cloudflare Pages; preview builds may fall back to the fixture.
      CF_PAGES_BRANCH: envField.string({ context: 'server', access: 'public', optional: true }),
    },
  },
});
