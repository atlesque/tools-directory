import { defineConfig, envField } from 'astro/config';

export default defineConfig({
  site: 'https://tools.atlesque.dev',
  server: { port: 8425 },
  env: {
    schema: {
      TOOLS_API_URL: envField.string({ context: 'server', access: 'secret', optional: true }),
    },
  },
});
