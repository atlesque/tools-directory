import { localParts } from './match.ts';
import { runSync } from './sync.ts';
import type { ApiTool, Env, ToolRow } from './types.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

function authorized(request: Request, env: Env): boolean {
  if (!env.SYNC_TOKEN) return false;
  const given = new TextEncoder().encode(request.headers.get('Authorization') ?? '');
  const expected = new TextEncoder().encode(`Bearer ${env.SYNC_TOKEN}`);
  return given.byteLength === expected.byteLength && crypto.subtle.timingSafeEqual(given, expected);
}

/**
 * Visible tools in insertion order. Tools without a public website stay in the
 * database but are not served. Private repos are served without their GitHub URL.
 */
async function listTools(env: Env): Promise<ApiTool[]> {
  const { results } = await env.DB.prepare("SELECT * FROM tools WHERE hidden = 0 AND coalesce(website_url, '') != '' ORDER BY id").all<ToolRow>();
  return results.map((row) => ({
    name: row.name,
    description: row.description,
    githubUrl: row.repo_private ? '' : row.github_url,
    ...(row.website_url ? { websiteUrl: row.website_url } : {}),
    category: row.category,
    tags: JSON.parse(row.tags) as string[],
    added: row.added,
    repoPrivate: Boolean(row.repo_private),
  }));
}

export default {
  async fetch(request, env) {
    const { pathname, searchParams } = new URL(request.url);

    // Read once per site build, not per visitor: the Pages site is static.
    if (pathname === '/api/tools' && request.method === 'GET') return json(await listTools(env));

    if (pathname === '/api/sync' && request.method === 'POST') {
      if (!authorized(request, env)) return json({ error: 'unauthorized' }, 401);
      return json(await runSync(env, 'manual', searchParams.get('dry') === '1'));
    }

    if (pathname === '/api/runs' && request.method === 'GET') {
      if (!authorized(request, env)) return json({ error: 'unauthorized' }, 401);
      const { results } = await env.DB.prepare('SELECT * FROM sync_runs ORDER BY id DESC LIMIT 10').all<{ report: string | null }>();
      return json(results.map((run) => ({ ...run, report: run.report ? JSON.parse(run.report) : null })));
    }

    return json({ error: 'not found' }, 404);
  },

  async scheduled(controller, env, ctx) {
    // Two UTC crons cover CET and CEST; only the one landing on LOCAL_HOUR runs.
    const { hour } = localParts(new Date(controller.scheduledTime), env.LOCAL_TIMEZONE);
    if (hour !== Number(env.LOCAL_HOUR)) return;
    ctx.waitUntil(runSync(env, 'cron', false));
  },
} satisfies ExportedHandler<Env>;
