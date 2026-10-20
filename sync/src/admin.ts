import { verifyAccess } from './access.ts';
import { COLUMNS, InputError, manualFields, parseToolInput, planUpdate, toColumn, type ToolInput } from './edits.ts';
import { csv, localParts } from './match.ts';
import page from './admin.html';
import { CATEGORIES, type Env, type ToolRow } from './types.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

const NOW = "strftime('%Y-%m-%dT%H:%M:%SZ', 'now')";

/** A row as the admin page sees it. `private` tools are hidden from the public site. */
const toAdmin = (row: ToolRow) => ({
  id: row.id,
  name: row.name,
  description: row.description,
  githubUrl: row.github_url,
  websiteUrl: row.website_url ?? '',
  category: row.category,
  tags: JSON.parse(row.tags) as string[],
  added: row.added,
  private: Boolean(row.hidden),
  repoPrivate: Boolean(row.repo_private),
  source: row.source,
  manualFields: manualFields(row)
    .map((column) => Object.entries(COLUMNS).find(([, c]) => c === column)?.[0])
    .filter(Boolean),
  updatedAt: row.updated_at,
});

async function listAll(env: Env) {
  const { results } = await env.DB.prepare('SELECT * FROM tools ORDER BY added DESC, id DESC').all<ToolRow>();
  const categories = [...new Set([...CATEGORIES, ...results.map((row) => row.category)])].sort((a, b) => a.localeCompare(b));
  return { tools: results.map(toAdmin), categories };
}

async function create(env: Env, body: unknown) {
  const input = parseToolInput(body, 'create');
  const full: ToolInput = {
    githubUrl: '',
    websiteUrl: '',
    tags: [],
    added: localParts(new Date(), env.LOCAL_TIMEZONE).date,
    private: false,
    repoPrivate: false,
    ...(input as Pick<ToolInput, 'name' | 'description' | 'category'> & Partial<ToolInput>),
  };
  const fields = Object.keys(COLUMNS) as (keyof ToolInput)[];
  // Everything typed in is manual. Whether the GitHub link shows keeps following
  // the repo's visibility, unless the admin ticked "hide GitHub link" themselves.
  const manual = fields.filter((field) => field !== 'repoPrivate' || full.repoPrivate).map((field) => COLUMNS[field]);
  const row = await env.DB.prepare(
    `INSERT INTO tools (${fields.map((f) => COLUMNS[f]).join(', ')}, source, manual_fields, origin_github_url)
     VALUES (${fields.map(() => '?').join(', ')}, 'manual', ?, ?) RETURNING *`,
  )
    .bind(...fields.map((field) => toColumn(field, full[field] as never)), JSON.stringify(manual), full.githubUrl)
    .first<ToolRow>();
  return toAdmin(row!);
}

async function update(env: Env, id: number, body: unknown) {
  const row = await env.DB.prepare('SELECT * FROM tools WHERE id = ?').bind(id).first<ToolRow>();
  if (!row) return null;
  const { set, manual } = planUpdate(row, parseToolInput(body, 'update'));
  if (!set.length) return toAdmin(row);
  const updated = await env.DB.prepare(
    `UPDATE tools SET ${set.map(([column]) => `${column} = ?`).join(', ')}, manual_fields = ?, updated_at = ${NOW} WHERE id = ? RETURNING *`,
  )
    .bind(...set.map(([, value]) => value), JSON.stringify(manual), id)
    .first<ToolRow>();
  return toAdmin(updated!);
}

async function publish(env: Env) {
  if (!env.PAGES_DEPLOY_HOOK) return json({ error: 'PAGES_DEPLOY_HOOK is not set on the Worker' }, 503);
  const res = await fetch(env.PAGES_DEPLOY_HOOK, { method: 'POST' });
  return res.ok ? json({ ok: true }) : json({ error: `Pages deploy hook returned ${res.status}` }, 502);
}

/**
 * The admin UI and its API under /admin. Every request needs a valid Cloudflare
 * Access token for one of ADMIN_EMAILS, so the page is closed on workers.dev too.
 */
export async function handleAdmin(request: Request, env: Env): Promise<Response> {
  const auth = await verifyAccess(request, {
    teamDomain: env.ACCESS_TEAM_DOMAIN ?? '',
    aud: env.ACCESS_AUD ?? '',
    emails: csv(env.ADMIN_EMAILS),
  });
  if (!auth.ok) return json({ error: auth.reason }, auth.status);

  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');
  const { method } = request;

  if (path === '/admin' && method === 'GET') {
    return new Response(page, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'unsafe-inline'; frame-ancestors 'none'",
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'same-origin',
      },
    });
  }

  // Writes must come from the admin page itself: same origin, JSON body.
  if (method !== 'GET') {
    const origin = request.headers.get('Origin');
    if ((origin && origin !== url.origin) || !request.headers.get('Content-Type')?.includes('application/json')) {
      return json({ error: 'cross-site request refused' }, 403);
    }
  }

  try {
    if (path === '/admin/api/me' && method === 'GET') return json({ email: auth.email, canPublish: Boolean(env.PAGES_DEPLOY_HOOK) });
    if (path === '/admin/api/tools' && method === 'GET') return json(await listAll(env));
    if (path === '/admin/api/tools' && method === 'POST') return json(await create(env, await request.json()), 201);
    const match = /^\/admin\/api\/tools\/(\d+)$/.exec(path);
    if (match && method === 'PATCH') {
      const tool = await update(env, Number(match[1]), await request.json());
      return tool ? json(tool) : json({ error: 'tool not found' }, 404);
    }
    if (path === '/admin/api/publish' && method === 'POST') return publish(env);
  } catch (error) {
    if (error instanceof InputError || error instanceof SyntaxError) return json({ error: error.message }, 400);
    throw error;
  }
  return json({ error: 'not found' }, 404);
}
