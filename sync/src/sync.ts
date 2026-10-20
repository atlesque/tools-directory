import { describe } from './ai.ts';
import { accountId, loadInventory, probe, type Inventory, type Site } from './cloudflare.ts';
import { BudgetExceeded, createCtx } from './context.ts';
import { listRepos, readme, type Repo } from './github.ts';
import { syncMayWrite } from './edits.ts';
import { csv, hostOf, isCustomHost, localParts, nameKey, onToolDomain, repoKey } from './match.ts';
import type { Env, SyncReport, ToolRow } from './types.ts';

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

export const rotate = <T>(items: T[], by: number): T[] => {
  if (!items.length) return items;
  const start = ((by % items.length) + items.length) % items.length;
  return [...items.slice(start), ...items.slice(0, start)];
};

export type Filter = { domains: string[]; ignoreHosts: string[]; optIn: string; optOut: string };

export const filterFrom = (env: Env): Filter => ({
  domains: csv(env.TOOL_DOMAINS),
  ignoreHosts: csv(env.IGNORE_HOSTS),
  optIn: env.OPT_IN_TOPIC?.trim().toLowerCase() || 'directory',
  optOut: env.OPT_OUT_TOPIC?.trim().toLowerCase() || 'no-directory',
});

/**
 * Which of a repo's sites may be listed. Tools live on subdomains of
 * TOOL_DOMAINS; other domains are usually client or personal websites, so they
 * need the opt-in topic. The opt-out topic removes a repo entirely.
 */
export function eligible(repo: Pick<Repo, 'topics'>, sites: Site[], filter: Filter): { sites: Site[]; reason?: string } {
  const topics = (repo.topics ?? []).map((topic) => topic.toLowerCase());
  if (topics.includes(filter.optOut)) return { sites: [], reason: `has the ${filter.optOut} topic` };
  const usable = sites.filter((site) => !filter.ignoreHosts.includes(site.hostname));
  if (!usable.length) return { sites: [], reason: `${sites.map((site) => site.hostname).join(', ')} is in IGNORE_HOSTS` };
  if (topics.includes(filter.optIn) || !filter.domains.length) return { sites: usable };
  const onDomain = usable.filter((site) => onToolDomain(site.hostname, filter.domains));
  if (onDomain.length) return { sites: onDomain };
  const hosts = usable.map((site) => site.hostname).join(', ');
  return { sites: [], reason: `${hosts} is not on ${filter.domains.join(' or ')} (add the ${filter.optIn} topic to list it)` };
}

/** Candidate hostnames for a repo, most explicit first. */
function sitesFor(repo: Repo, inventory: Inventory): Site[] {
  const sites: Site[] = [];
  const homepage = hostOf(repo.homepage);
  if (homepage && isCustomHost(homepage)) sites.push({ hostname: homepage, via: 'GitHub homepage' });
  sites.push(...(inventory.byRepo.get(repo.full_name.toLowerCase()) ?? []));
  sites.push(...(inventory.byName.get(nameKey(repo.name)) ?? []));
  return sites.filter((site, i) => sites.findIndex((s) => s.hostname === site.hostname) === i);
}

/**
 * Adds every repository that is missing from the directory and has a public
 * site on a custom domain, refreshes repo visibility for existing entries, and
 * rebuilds the static site so the new data goes live.
 */
export async function runSync(env: Env, trigger: 'cron' | 'manual', dryRun: boolean): Promise<SyncReport & { runId: number | null }> {
  const ctx = createCtx(env);
  const startedAt = new Date();
  const report: SyncReport = { added: [], updated: [], skipped: [], errors: [], warnings: [] };

  const run = dryRun
    ? null
    : await env.DB.prepare('INSERT INTO sync_runs (started_at, trigger) VALUES (?, ?) RETURNING id')
        .bind(startedAt.toISOString(), trigger)
        .first<{ id: number }>();

  try {
    const { results: rows } = await env.DB.prepare('SELECT * FROM tools').all<ToolRow>();
    // A repo counts as listed under its current URL and the one it was added with,
    // so pointing a tool at another repo in the admin does not bring the old one back.
    const listedRepos = new Set(
      rows.flatMap((row) => [repoKey(row.github_url), repoKey(row.origin_github_url ?? '')]).filter((key): key is string => key !== null),
    );
    const listedHosts = new Set(rows.map((row) => hostOf(row.website_url)).filter((host): host is string => host !== null));

    const repos = await listRepos(ctx);
    const repoByKey = new Map(repos.map((repo) => [repo.full_name.toLowerCase(), repo]));

    // Keep the private flag current, so a repo made private loses its public GitHub link.
    // This is the only column the sync writes on existing rows, and only while the
    // admin has not set it by hand (manual_fields).
    const updates: D1PreparedStatement[] = [];
    for (const row of rows) {
      const repo = repoByKey.get(repoKey(row.github_url) ?? '');
      if (!repo || Boolean(row.repo_private) === repo.private) continue;
      if (!syncMayWrite(row, 'repo_private')) {
        report.warnings.push(`${row.name}: ${repo.full_name} is now ${repo.private ? 'private' : 'public'} on GitHub; kept the GitHub link setting from the admin`);
        continue;
      }
      updates.push(
        env.DB.prepare("UPDATE tools SET repo_private = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?").bind(
          repo.private ? 1 : 0,
          row.id,
        ),
      );
      report.updated.push({ repo: repo.full_name, change: repo.private ? 'now private' : 'now public' });
    }
    if (updates.length && !dryRun) await env.DB.batch(updates);

    const candidates = repos.filter((repo) => !repo.fork && !repo.archived && !listedRepos.has(repo.full_name.toLowerCase()));
    if (candidates.length) {
      const inventory = await loadInventory(ctx, await accountId(ctx), listedHosts);
      report.warnings.push(...inventory.warnings);
      const today = localParts(startedAt, env.LOCAL_TIMEZONE).date;

      // Repos without a site cost no requests. The rest are checked starting at
      // an offset that moves daily, so a budget-limited run still reaches every
      // repo over a few nights instead of retrying the same ones.
      const filter = filterFrom(env);
      const withSites = candidates.flatMap((repo) => {
        const found = sitesFor(repo, inventory);
        if (!found.length) {
          report.skipped.push({ repo: repo.full_name, reason: 'no deployment on a custom domain' });
          return [];
        }
        const { sites, reason } = eligible(repo, found, filter);
        if (reason) report.skipped.push({ repo: repo.full_name, reason });
        return sites.length ? [{ repo, sites }] : [];
      });
      const queue = rotate(withSites, Math.floor(startedAt.getTime() / 86_400_000));

      for (const [index, { repo, sites }] of queue.entries()) {
        try {
          const already = sites.find((site) => listedHosts.has(site.hostname));
          if (already) {
            report.skipped.push({ repo: repo.full_name, reason: `${already.hostname} is already listed under another repo` });
            continue;
          }

          const reasons: string[] = [];
          let chosen: { site: Site; title: string; description: string; url: string } | null = null;
          for (const site of sites) {
            if (inventory.isProtected(site)) {
              reasons.push(`${site.hostname}: behind Cloudflare Access`);
              continue;
            }
            const result = await probe(ctx, site.hostname);
            if (!result.ok) {
              reasons.push(`${site.hostname}: ${result.reason}`);
              continue;
            }
            chosen = { site, ...result };
            break;
          }
          if (!chosen) {
            report.skipped.push({ repo: repo.full_name, reason: reasons.join('; ') });
            continue;
          }

          const listing = await describe(env, {
            repo: repo.full_name,
            repoDescription: repo.description ?? '',
            topics: repo.topics ?? [],
            url: chosen.url,
            pageTitle: chosen.title,
            pageDescription: chosen.description,
            readme: await readme(ctx, repo.full_name),
          });

          if (!dryRun) {
            await env.DB.prepare(
              `INSERT INTO tools (name, description, github_url, origin_github_url, website_url, category, tags, added, repo_private, source)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'sync')`,
            )
              .bind(listing.name, listing.description, repo.html_url, repo.html_url, chosen.url, listing.category, JSON.stringify(listing.tags), today, repo.private ? 1 : 0)
              .run();
          }
          listedHosts.add(chosen.site.hostname);
          report.added.push({ repo: repo.full_name, name: listing.name, websiteUrl: chosen.url, category: listing.category, via: chosen.site.via });
        } catch (error) {
          if (error instanceof BudgetExceeded) {
            for (const { repo: rest } of queue.slice(index)) report.skipped.push({ repo: rest.full_name, reason: 'deferred to the next run (subrequest budget)' });
            break;
          }
          report.errors.push(`${repo.full_name}: ${message(error)}`);
        }
      }
    }
  } catch (error) {
    report.errors.push(message(error));
  }

  // Rebuild the static site even when nothing was added, so manual edits in D1 also go live nightly.
  if (!dryRun && env.PAGES_DEPLOY_HOOK) {
    try {
      const res = await fetch(env.PAGES_DEPLOY_HOOK, { method: 'POST' });
      if (!res.ok) report.errors.push(`Pages deploy hook returned ${res.status}`);
    } catch (error) {
      report.errors.push(`Pages deploy hook: ${message(error)}`);
    }
  } else if (!dryRun) {
    report.warnings.push('PAGES_DEPLOY_HOOK is not set, so the site was not rebuilt');
  }

  if (run) {
    await env.DB.prepare('UPDATE sync_runs SET finished_at = ?, added = ?, updated = ?, report = ? WHERE id = ?')
      .bind(new Date().toISOString(), report.added.length, report.updated.length, JSON.stringify(report), run.id)
      .run();
  }
  return { ...report, runId: run?.id ?? null };
}
