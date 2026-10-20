import assert from 'node:assert/strict';
import { test } from 'node:test';
import { accessCoversRoot, hostOf, isCustomHost, localParts, nameKey, repoKey, routeHost } from '../src/match.ts';

test('repoKey normalises GitHub URLs', () => {
  assert.equal(repoKey('https://github.com/Atlesque/Text-Differ'), 'atlesque/text-differ');
  assert.equal(repoKey('https://github.com/atlesque/json-editor.git/'), 'atlesque/json-editor');
  assert.equal(repoKey('https://example.com/atlesque/x'), null);
});

test('nameKey ignores case and punctuation', () => {
  assert.equal(nameKey('Text_Differ'), nameKey('text-differ'));
});

test('isCustomHost rejects platform domains', () => {
  assert.equal(isCustomHost('diff.atlesque.dev'), true);
  assert.equal(isCustomHost('semina.be'), true);
  assert.equal(isCustomHost('text-differ.pages.dev'), false);
  assert.equal(isCustomHost('tool.atlesque.workers.dev'), false);
  assert.equal(isCustomHost('atlesque.github.io'), false);
  assert.equal(isCustomHost('github.com'), false);
});

test('hostOf accepts URLs and bare hosts', () => {
  assert.equal(hostOf('https://Diff.atlesque.dev/path'), 'diff.atlesque.dev');
  assert.equal(hostOf('diff.atlesque.dev'), 'diff.atlesque.dev');
  assert.equal(hostOf(''), null);
});

test('accessCoversRoot matches exact, wildcard and root-path apps only', () => {
  assert.equal(accessCoversRoot('deploys.atlesque.dev', 'deploys.atlesque.dev'), true);
  assert.equal(accessCoversRoot('*.atlesque.dev', 'deploys.atlesque.dev'), true);
  assert.equal(accessCoversRoot('deploys.atlesque.dev/*', 'deploys.atlesque.dev'), true);
  assert.equal(accessCoversRoot('deploys.atlesque.dev/admin', 'deploys.atlesque.dev'), false);
  assert.equal(accessCoversRoot('deploys.atlesque.dev', 'diff.atlesque.dev'), false);
  assert.equal(accessCoversRoot('*.atlesque.dev', 'atlesque.dev.evil.com'), false);
});

test('routeHost only accepts whole-site routes', () => {
  assert.equal(routeHost('tool.atlesque.dev/*'), 'tool.atlesque.dev');
  assert.equal(routeHost('tool.atlesque.dev/api/*'), null);
  assert.equal(routeHost('*.atlesque.dev/*'), null);
});

test('localParts gives 03:00 Amsterdam for both cron slots', () => {
  // Summer (CEST, UTC+2): 01:00 UTC is 03:00 local.
  assert.deepEqual(localParts(new Date('2026-07-01T01:00:00Z'), 'Europe/Amsterdam'), { date: '2026-07-01', hour: 3 });
  assert.equal(localParts(new Date('2026-07-01T02:00:00Z'), 'Europe/Amsterdam').hour, 4);
  // Winter (CET, UTC+1): 02:00 UTC is 03:00 local.
  assert.equal(localParts(new Date('2026-12-01T02:00:00Z'), 'Europe/Amsterdam').hour, 3);
  assert.equal(localParts(new Date('2026-12-01T01:00:00Z'), 'Europe/Amsterdam').hour, 2);
});
