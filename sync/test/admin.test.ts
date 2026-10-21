import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verifyAccess, teamOrigin } from '../src/access.ts';
import { InputError, parseToolInput, planUpdate, syncMayWrite } from '../src/edits.ts';
import type { ToolRow } from '../src/types.ts';

const row: ToolRow = {
  id: 1,
  name: 'Text Differ',
  description: 'Side-by-side text comparison.',
  github_url: 'https://github.com/atlesque/text-differ',
  website_url: 'https://diff.atlesque.dev/',
  category: 'Text',
  tags: '["diff","text"]',
  added: '2026-10-01',
  repo_private: 0,
  hidden: 0,
  source: 'sync',
  manual_fields: '[]',
  origin_github_url: 'https://github.com/atlesque/text-differ',
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
};

test('parseToolInput normalises fields and requires the basics on create', () => {
  const input = parseToolInput(
    { name: '  New  Tool ', description: 'Does things.', category: 'Games', tags: 'A, b ,a', websiteUrl: 'new.atlesque.dev', githubUrl: 'https://github.com/Atlesque/New.git' },
    'create',
  );
  assert.deepEqual(input, {
    name: 'New Tool',
    description: 'Does things.',
    category: 'Games',
    tags: ['a', 'b'],
    websiteUrl: 'https://new.atlesque.dev/',
    githubUrl: 'https://github.com/atlesque/new',
  });
  assert.throws(() => parseToolInput({ name: 'x', description: 'y' }, 'create'), /Category is required/);
  assert.throws(() => parseToolInput({ githubUrl: 'https://gitlab.com/a/b' }, 'update'), InputError);
  assert.throws(() => parseToolInput({ added: '2026-13-45' }, 'update'), InputError);
  assert.throws(() => parseToolInput({ private: 'yes' }, 'update'), InputError);
  assert.throws(() => parseToolInput({}, 'update'), /Nothing to update/);
});

test('planUpdate records only columns whose value changes', () => {
  const plan = planUpdate(row, { name: 'Text Diff', description: row.description, private: true, tags: ['diff', 'text'] });
  assert.deepEqual(plan.set, [
    ['name', 'Text Diff'],
    ['hidden', 1],
  ]);
  assert.deepEqual(plan.manual, ['name', 'hidden']);
  const again = planUpdate({ ...row, manual_fields: '["name"]' }, { websiteUrl: '' });
  assert.deepEqual(again.set, [['website_url', null]]);
  assert.deepEqual(again.manual, ['name', 'website_url']);
});

test('the sync may not write columns the admin edited', () => {
  assert.equal(syncMayWrite(row, 'repo_private'), true);
  assert.equal(syncMayWrite({ manual_fields: '["repo_private"]' }, 'repo_private'), false);
  assert.equal(syncMayWrite({ manual_fields: 'not json' }, 'repo_private'), true);
});

// A throwaway Access team: an RSA key pair and a certs endpoint that serves it.
const keys = (await crypto.subtle.generateKey(
  { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
  true,
  ['sign', 'verify'],
)) as CryptoKeyPair;
const jwk = { ...(await crypto.subtle.exportKey('jwk', keys.publicKey)), kid: 'k1' };
const certs = (async () => new Response(JSON.stringify({ keys: [jwk] }))) as unknown as typeof fetch;
const b64 = (value: string | Uint8Array) => Buffer.from(value).toString('base64url');

async function token(payload: Record<string, unknown>, kid = 'k1') {
  const body = `${b64(JSON.stringify({ alg: 'RS256', kid }))}.${b64(JSON.stringify(payload))}`;
  const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keys.privateKey, new TextEncoder().encode(body)));
  return `${body}.${b64(signature)}`;
}

const config = { teamDomain: 'atlesque', aud: 'aud-1', emails: ['alexander@atlesque.media'] };
const now = Date.UTC(2026, 9, 20, 12);
const good = { aud: ['aud-1'], iss: 'https://atlesque.cloudflareaccess.com', email: 'Alexander@atlesque.media', exp: now / 1000 + 600 };
const request = (jwt?: string, cookie = false) =>
  new Request('https://admin.tools.atlesque.dev/admin', {
    headers: jwt ? (cookie ? { Cookie: `x=1; CF_Authorization=${jwt}` } : { 'Cf-Access-Jwt-Assertion': jwt }) : {},
  });

test('teamOrigin accepts a team name, domain or URL', () => {
  assert.equal(teamOrigin('atlesque'), 'https://atlesque.cloudflareaccess.com');
  assert.equal(teamOrigin('atlesque.cloudflareaccess.com'), 'https://atlesque.cloudflareaccess.com');
  assert.equal(teamOrigin('https://atlesque.cloudflareaccess.com/'), 'https://atlesque.cloudflareaccess.com');
});

test('verifyAccess lets the admin in by header or cookie', async () => {
  assert.deepEqual(await verifyAccess(request(await token(good)), config, certs, now), { ok: true, email: 'alexander@atlesque.media' });
  assert.equal((await verifyAccess(request(await token(good), true), config, certs, now)).ok, true);
});

test('verifyAccess refuses everything else', async () => {
  const status = async (req: Request, cfg = config) => {
    const result = await verifyAccess(req, cfg, certs, now);
    return result.ok ? 200 : result.status;
  };
  assert.equal(await status(request()), 401);
  assert.equal(await status(request(await token(good)), { ...config, aud: '' }), 503);
  assert.equal(await status(request(await token({ ...good, email: 'someone@example.com' }))), 403);
  assert.equal(await status(request(await token({ ...good, aud: 'other-app' }))), 401);
  assert.equal(await status(request(await token({ ...good, iss: 'https://evil.cloudflareaccess.com' }))), 401);
  assert.equal(await status(request(await token({ ...good, exp: now / 1000 - 1 }))), 401);
  assert.equal(await status(request(await token(good, 'unknown'))), 401);
  const [head, , sig] = (await token(good)).split('.');
  const forged = `${head}.${b64(JSON.stringify({ ...good, email: 'alexander@atlesque.media' }))}x.${sig}`;
  assert.equal(await status(request(forged)), 401);
});
