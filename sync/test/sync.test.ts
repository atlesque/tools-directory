import assert from 'node:assert/strict';
import { test } from 'node:test';
import { latestBuilds } from '../src/cloudflare.ts';
import { eligible, rotate, type Filter } from '../src/sync.ts';

test('latestBuilds reads keyed and list responses', () => {
  const build = { build_trigger_metadata: { repo_name: 'clair-obscur-expedition-33-guide', provider_account_name: 'atlesque' } };
  const expected = [{ tag: 'abc', owner: 'atlesque', repo: 'clair-obscur-expedition-33-guide' }];
  assert.deepEqual(latestBuilds({ builds: { abc: build } }), expected);
  assert.deepEqual(latestBuilds({ abc: build }), expected);
  assert.deepEqual(latestBuilds([{ ...build, external_script_id: 'abc' }]), expected);
  assert.deepEqual(latestBuilds({ abc: {} }), []);
  assert.deepEqual(latestBuilds(null), []);
});

test('rotate starts at a day-dependent offset and keeps every item', () => {
  assert.deepEqual(rotate([1, 2, 3], 4), [2, 3, 1]);
  assert.deepEqual(rotate([1, 2, 3], 3), [1, 2, 3]);
  assert.deepEqual(rotate([], 5), []);
});

const filter: Filter = { domains: ['atlesque.dev'], ignoreHosts: ['accounts.atlesque.dev'], optIn: 'directory', optOut: 'no-directory' };
const site = (hostname: string) => ({ hostname, via: 'test' });

test('eligible keeps tool subdomains and drops other websites', () => {
  assert.deepEqual(eligible({ topics: [] }, [site('brugsepersbond.be'), site('bps.atlesque.dev')], filter).sites, [site('bps.atlesque.dev')]);
  assert.equal(eligible({ topics: [] }, [site('atlesque.dev')], filter).sites.length, 0);
  assert.match(eligible({ topics: [] }, [site('merlezingt.be')], filter).reason ?? '', /directory topic/);
  assert.equal(eligible({ topics: [] }, [site('accounts.atlesque.dev')], filter).sites.length, 0);
});

test('eligible honours the opt-in and opt-out topics', () => {
  assert.deepEqual(eligible({ topics: ['Directory'] }, [site('semina.be')], filter).sites, [site('semina.be')]);
  assert.equal(eligible({ topics: ['no-directory'] }, [site('x.atlesque.dev')], filter).sites.length, 0);
});
