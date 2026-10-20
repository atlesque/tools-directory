// Verifies the Cloudflare Access JWT in front of the admin. Access already blocks
// everyone else at the edge; this check keeps the admin closed when a request
// reaches the Worker another way (the workers.dev URL) or Access is misconfigured.
// Uses only WebCrypto, so it also runs under `node --test`.

export type AccessConfig = { teamDomain: string; aud: string; emails: string[] };

export type AccessResult = { ok: true; email: string } | { ok: false; status: 401 | 403 | 503; reason: string };

type Jwk = JsonWebKey & { kid?: string };
type Header = { alg?: string; kid?: string };
type Payload = { aud?: string | string[]; iss?: string; email?: string; exp?: number; nbf?: number };

/** "atlesque", "atlesque.cloudflareaccess.com" or a full URL, as the issuer origin Access puts in `iss`. */
export function teamOrigin(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (/^https?:\/\//i.test(trimmed)) return trimmed.toLowerCase();
  return `https://${trimmed.includes('.') ? trimmed : `${trimmed}.cloudflareaccess.com`}`.toLowerCase();
}

const decoder = new TextDecoder();

function base64url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

const segment = <T>(value: string): T => JSON.parse(decoder.decode(base64url(value))) as T;

let cachedKeys: { origin: string; keys: Jwk[]; expires: number } | null = null;

async function signingKeys(origin: string, fetcher: typeof fetch, refresh: boolean): Promise<Jwk[]> {
  if (!refresh && cachedKeys?.origin === origin && cachedKeys.expires > Date.now()) return cachedKeys.keys;
  const res = await fetcher(`${origin}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`Access certs returned ${res.status}`);
  const { keys } = (await res.json()) as { keys?: Jwk[] };
  cachedKeys = { origin, keys: keys ?? [], expires: Date.now() + 60 * 60 * 1000 };
  return cachedKeys.keys;
}

/** Access sends the token as a header to the origin, and as the CF_Authorization cookie to the browser. */
export function tokenFrom(request: Request): string | null {
  const header = request.headers.get('Cf-Access-Jwt-Assertion');
  if (header) return header;
  const cookie = request.headers.get('Cookie') ?? '';
  return /(?:^|;\s*)CF_Authorization=([^;]+)/.exec(cookie)?.[1] ?? null;
}

export async function verifyAccess(
  request: Request,
  config: AccessConfig,
  fetcher: typeof fetch = fetch,
  now = Date.now(),
): Promise<AccessResult> {
  if (!config.teamDomain || !config.aud || !config.emails.length) {
    return { ok: false, status: 503, reason: 'Admin is not configured: set ACCESS_TEAM_DOMAIN, ACCESS_AUD and ADMIN_EMAILS' };
  }
  const token = tokenFrom(request);
  if (!token) return { ok: false, status: 401, reason: 'Sign in through Cloudflare Access' };

  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, status: 401, reason: 'Malformed Access token' };
  let header: Header;
  let payload: Payload;
  try {
    header = segment<Header>(parts[0]);
    payload = segment<Payload>(parts[1]);
  } catch {
    return { ok: false, status: 401, reason: 'Malformed Access token' };
  }
  if (header.alg !== 'RS256') return { ok: false, status: 401, reason: 'Unexpected token algorithm' };

  const origin = teamOrigin(config.teamDomain);
  let keys = await signingKeys(origin, fetcher, false);
  // Access rotates its keys; fetch again once when the token names a key we do not have.
  if (!keys.some((key) => key.kid === header.kid)) keys = await signingKeys(origin, fetcher, true);
  const jwk = keys.find((key) => key.kid === header.kid);
  if (!jwk) return { ok: false, status: 401, reason: 'Unknown signing key' };

  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, base64url(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  if (!valid) return { ok: false, status: 401, reason: 'Invalid token signature' };

  const seconds = now / 1000;
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audiences.includes(config.aud)) return { ok: false, status: 401, reason: 'Token is for another Access application' };
  if ((payload.iss ?? '').toLowerCase() !== origin) return { ok: false, status: 401, reason: 'Token is from another Access team' };
  if (!payload.exp || payload.exp < seconds) return { ok: false, status: 401, reason: 'Access session expired, reload the page' };
  if (payload.nbf && payload.nbf > seconds + 60) return { ok: false, status: 401, reason: 'Token is not valid yet' };

  const email = (payload.email ?? '').toLowerCase();
  if (!config.emails.includes(email)) return { ok: false, status: 403, reason: `${email || 'This identity'} is not an admin` };
  return { ok: true, email };
}
