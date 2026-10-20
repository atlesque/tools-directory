// Pure helpers, kept free of Workers APIs so they run under `node --test`.

/** Lowercased "owner/repo" for a GitHub URL, or null when it is not one. */
export function repoKey(url: string): string | null {
  const match = /^https?:\/\/(?:www\.)?github\.com\/([^/\s]+)\/([^/\s#?]+)/i.exec(url.trim());
  if (!match) return null;
  return `${match[1]}/${match[2].replace(/\.git$/i, '')}`.toLowerCase();
}

/** Loose key for matching a repo name to a Pages project or Worker name. */
export const nameKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

const PLATFORM_SUFFIXES = ['.pages.dev', '.workers.dev', '.github.io', 'github.com', '.vercel.app', '.netlify.app'];

/** True for a hostname the user owns, as opposed to a platform default domain. */
export function isCustomHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (!host.includes('.') || host === 'localhost') return false;
  return !PLATFORM_SUFFIXES.some((suffix) => host === suffix.replace(/^\./, '') || host.endsWith(suffix));
}

/** Hostname from a URL or bare host string, or null. */
export function hostOf(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Whether an Access application domain such as "tool.example.com",
 * "*.example.com" or "tool.example.com/admin" protects the site root of `hostname`.
 * Apps scoped to a sub-path leave the public front page open, so they do not count.
 */
export function accessCoversRoot(pattern: string, hostname: string): boolean {
  const cleaned = pattern.trim().toLowerCase().replace(/^https?:\/\//, '');
  const slash = cleaned.indexOf('/');
  const hostPattern = slash === -1 ? cleaned : cleaned.slice(0, slash);
  const path = slash === -1 ? '' : cleaned.slice(slash);
  if (path && path !== '/' && path !== '/*') return false;
  const regex = new RegExp(`^${hostPattern.split('*').map(escapeRegex).join('.*')}$`);
  return regex.test(hostname.toLowerCase());
}

const escapeRegex = (value: string) => value.replace(/[.+?^${}()|[\]\\]/g, '\\$&');

/** Host part of a Workers route pattern when it serves the whole site, e.g. "tool.example.com/*". */
export function routeHost(pattern: string): string | null {
  const [host, ...rest] = pattern.toLowerCase().split('/');
  const path = rest.length ? `/${rest.join('/')}` : '';
  if (host.includes('*') || (path && path !== '/*' && path !== '/')) return null;
  return host;
}

/** Calendar date (YYYY-MM-DD) and hour (0-23) of `date` in `timeZone`. */
export function localParts(date: Date, timeZone: string): { date: string; hour: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

/** Comma-separated config value as a lowercased list. */
export const csv = (value: string | undefined) =>
  (value ?? '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

/** True when `hostname` is a subdomain of one of `domains`. The apex itself is usually a personal site, so it does not count. */
export const onToolDomain = (hostname: string, domains: string[]) => domains.some((domain) => hostname.toLowerCase().endsWith(`.${domain}`));
