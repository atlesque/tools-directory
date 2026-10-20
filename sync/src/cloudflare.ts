import { BudgetExceeded, type Ctx } from './context.ts';
import { accessCoversRoot, hostOf, isCustomHost, nameKey, routeHost } from './match.ts';

type CfResponse<T> = {
  success: boolean;
  result: T;
  errors?: { message: string }[];
  result_info?: { page?: number; total_pages?: number };
};

async function cf<T>({ env, fetch }: Ctx, path: string): Promise<CfResponse<T>> {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` },
  });
  const body = (await res.json().catch(() => ({ success: false, result: null }))) as CfResponse<T>;
  if (!res.ok || !body.success) {
    const detail = body.errors?.map((e) => e.message).join('; ') || res.statusText;
    throw new Error(`Cloudflare ${path.split('?')[0]} ${res.status}: ${detail}`);
  }
  return body;
}

async function cfAll<T>(ctx: Ctx, path: string, perPage: number): Promise<T[]> {
  const items: T[] = [];
  const sep = path.includes('?') ? '&' : '?';
  for (let page = 1; ; page++) {
    const body = await cf<T[]>(ctx, `${path}${sep}page=${page}&per_page=${perPage}`);
    items.push(...(body.result ?? []));
    const total = body.result_info?.total_pages ?? 1;
    if (page >= total || !body.result?.length) return items;
  }
}

export async function accountId(ctx: Ctx): Promise<string> {
  if (ctx.env.CLOUDFLARE_ACCOUNT_ID) return ctx.env.CLOUDFLARE_ACCOUNT_ID;
  const { result } = await cf<{ id: string }[]>(ctx, '/accounts?per_page=5');
  if (!result.length) throw new Error('CLOUDFLARE_API_TOKEN has no account access');
  return result[0].id;
}

/** Where a custom hostname came from, for the run report. */
export type Site = { hostname: string; via: string; worker?: string };

/**
 * Everything the sync needs to know about deployments in the account:
 * custom hostnames per linked repo and per project/Worker name, and which
 * hostnames sit behind Cloudflare Access.
 */
export type Inventory = {
  byRepo: Map<string, Site[]>;
  byName: Map<string, Site[]>;
  isProtected: (site: Site) => boolean;
  warnings: string[];
};

type PagesProject = {
  name: string;
  domains?: string[];
  source?: { type?: string; config?: { owner?: string; repo_name?: string } };
};
type WorkerDomain = { hostname: string; service: string };
type WorkerScript = { id: string; tag: string };
type Zone = { id: string; name: string };
type Route = { pattern: string; script?: string };
type AccessApp = {
  type?: string;
  domain?: string;
  self_hosted_domains?: string[];
  destinations?: { type?: string; uri?: string; worker_id?: string }[];
};
type Build = {
  external_script_id?: string;
  build_trigger_metadata?: { repo_name?: string; provider_account_name?: string };
  trigger?: { external_script_id?: string; repo_connection?: { repo_name?: string; provider_account_name?: string } };
};

/**
 * Normalises the latest-builds response, which is keyed by script tag
 * (optionally under `builds`) or returned as a list, into tag → repo.
 */
export function latestBuilds(result: unknown): { tag: string; owner: string; repo: string }[] {
  const container = (result as { builds?: unknown } | null)?.builds ?? result;
  const entries: [string | undefined, Build][] = Array.isArray(container)
    ? (container as Build[]).map((build) => [undefined, build])
    : Object.entries((container ?? {}) as Record<string, Build>);
  return entries.flatMap(([key, build]) => {
    const tag = build?.external_script_id ?? build?.trigger?.external_script_id ?? key;
    const meta = build?.build_trigger_metadata;
    const owner = meta?.provider_account_name ?? build?.trigger?.repo_connection?.provider_account_name;
    const repo = meta?.repo_name ?? build?.trigger?.repo_connection?.repo_name;
    return tag && owner && repo ? [{ tag, owner, repo }] : [];
  });
}

const PROTECTING_APP_TYPES = new Set(['self_hosted', 'ssh', 'vnc', 'rdp']);

/** `knownHosts` are hostnames already in the directory; their Workers need no repo lookup. */
export async function loadInventory(ctx: Ctx, account: string, knownHosts: Set<string>): Promise<Inventory> {
  const byRepo = new Map<string, Site[]>();
  const byName = new Map<string, Site[]>();
  const warnings: string[] = [];
  const add = (map: Map<string, Site[]>, key: string, site: Site) => {
    if (!isCustomHost(site.hostname)) return;
    const list = map.get(key) ?? [];
    if (!list.some((s) => s.hostname === site.hostname)) list.push(site);
    map.set(key, list);
  };
  // A failing source only narrows what the run can find, so log it and carry on.
  const attempt = async <T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn();
    } catch (error) {
      warnings.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
      return fallback;
    }
  };

  const projects = await attempt('Pages projects', () => cfAll<PagesProject>(ctx, `/accounts/${account}/pages/projects`, 10), []);
  for (const project of projects) {
    const repo = project.source?.config;
    for (const domain of project.domains ?? []) {
      const site = { hostname: domain.toLowerCase(), via: `pages:${project.name}` };
      if (repo?.owner && repo.repo_name) add(byRepo, `${repo.owner}/${repo.repo_name}`.toLowerCase(), site);
      add(byName, nameKey(project.name), site);
    }
  }

  // Hostnames each Worker serves, from Custom Domains and from zone routes.
  const workerHosts = new Map<string, Set<string>>();
  const addWorkerHost = (script: string, host: string) => {
    if (!workerHosts.has(script)) workerHosts.set(script, new Set());
    workerHosts.get(script)!.add(host.toLowerCase());
  };
  const domains = await attempt('Worker custom domains', () => cfAll<WorkerDomain>(ctx, `/accounts/${account}/workers/domains`, 100), []);
  for (const domain of domains) addWorkerHost(domain.service, domain.hostname);

  const zones = await attempt('zones', () => cfAll<Zone>(ctx, `/zones?account.id=${account}`, 50), []);
  for (const zone of zones) {
    const routes = await attempt(`routes for ${zone.name}`, () => cf<Route[]>(ctx, `/zones/${zone.id}/workers/routes`).then((r) => r.result), []);
    for (const route of routes) {
      const host = route.script && routeHost(route.pattern);
      if (host) addWorkerHost(route.script!, host);
    }
  }

  const scripts = await attempt('Worker scripts', () => cf<WorkerScript[]>(ctx, `/accounts/${account}/workers/scripts`).then((r) => r.result), []);
  const tagToScript = new Map(scripts.map((s) => [s.tag, s.id]));

  for (const [script, hosts] of workerHosts) {
    for (const hostname of hosts) add(byName, nameKey(script), { hostname, via: `worker:${script}`, worker: script });
  }

  const apps = await attempt('Access applications', () => cfAll<AccessApp>(ctx, `/accounts/${account}/access/apps`, 100), null);
  if (apps === null) warnings.push('Access apps unavailable: relying on the live HTTP check only');
  const patterns: string[] = [];
  const protectedWorkers = new Set<string>();
  for (const app of apps ?? []) {
    if (app.type && !PROTECTING_APP_TYPES.has(app.type)) continue;
    if (app.domain) patterns.push(app.domain);
    patterns.push(...(app.self_hosted_domains ?? []));
    for (const destination of app.destinations ?? []) {
      if (destination.type === 'public' && destination.uri) patterns.push(destination.uri);
      if (destination.type === 'worker' && destination.worker_id) {
        protectedWorkers.add(tagToScript.get(destination.worker_id) ?? destination.worker_id);
      }
    }
  }

  // Workers Builds knows which repo deploys each Worker, which catches Workers
  // whose name differs from their repo (e.g. "expedition33"). The latest-builds
  // endpoint covers every Worker in one request.
  const pending = scripts.filter((script) => {
    const hosts = workerHosts.get(script.id);
    return hosts?.size && ![...hosts].every((host) => knownHosts.has(host));
  });
  if (pending.length) {
    const builds = await attempt(
      'latest Workers Builds',
      () =>
        cf<unknown>(ctx, `/accounts/${account}/builds/builds/latest?external_script_ids=${pending.map((s) => s.tag).join(',')}`).then((r) =>
          latestBuilds(r.result),
        ),
      [],
    );
    const byTag = new Map(pending.map((s) => [s.tag, s.id]));
    for (const build of builds) {
      const script = byTag.get(build.tag);
      const hosts = script && workerHosts.get(script);
      if (!script || !hosts) continue;
      for (const hostname of hosts) add(byRepo, `${build.owner}/${build.repo}`.toLowerCase(), { hostname, via: `worker:${script}`, worker: script });
    }
  }

  return {
    byRepo,
    byName,
    isProtected: (site) =>
      (site.worker !== undefined && protectedWorkers.has(site.worker)) ||
      patterns.some((pattern) => accessCoversRoot(pattern, site.hostname)),
    warnings,
  };
}

export type Probe =
  | { ok: true; url: string; title: string; description: string }
  | { ok: false; reason: string };

/**
 * Loads the site's front page the way an anonymous visitor would. A redirect
 * to cloudflareaccess.com or a 401/403 means it is not open to the public.
 */
export async function probe(ctx: Ctx, hostname: string): Promise<Probe> {
  const url = `https://${hostname}/`;
  let res: Response;
  try {
    res = await ctx.fetch(url, { redirect: 'manual', headers: { 'User-Agent': 'tools-directory-sync (+https://tools.atlesque.dev)' } });
  } catch (error) {
    if (error instanceof BudgetExceeded) throw error;
    return { ok: false, reason: `unreachable: ${error instanceof Error ? error.message : String(error)}` };
  }
  if (res.status >= 300 && res.status < 400) {
    const location = res.headers.get('location') ?? '';
    if (/cloudflareaccess\.com/i.test(hostOf(location) ?? location)) return { ok: false, reason: 'behind Cloudflare Access' };
    return { ok: true, url, title: '', description: '' };
  }
  if (res.status === 401 || res.status === 403) return { ok: false, reason: `requires sign-in (${res.status})` };
  if (!res.ok) return { ok: false, reason: `front page returned ${res.status}` };

  let title = '';
  let description = '';
  const page = new HTMLRewriter()
    .on('title', { text: (chunk) => void (title += chunk.text) })
    .on('meta[name="description"], meta[property="og:description"]', {
      element: (el) => void (description ||= el.getAttribute('content') ?? ''),
    })
    .transform(res);
  await page.text();
  return { ok: true, url, title: title.trim().slice(0, 200), description: description.trim().slice(0, 400) };
}
