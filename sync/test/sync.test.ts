import assert from 'node:assert/strict';
import { test } from 'node:test';
import { latestBuilds } from '../src/cloudflare.ts';
import { rotate } from '../src/sync.ts';

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
