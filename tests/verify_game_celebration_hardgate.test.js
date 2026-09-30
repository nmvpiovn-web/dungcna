import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildCelebrationResult } from '../src/lib/gameCelebration.js';

const componentUrl = new URL('../src/lib/components/GameCelebration.svelte', import.meta.url);
const pageUrl = new URL('../src/routes/games/+page.svelte', import.meta.url);
const negativeFixtureUrl = new URL('./fixtures/game-celebration-negative.svelte', import.meta.url);

function auditCelebrationSource(source) {
  const failures = [];
  if (!source.includes('data-testid="game-celebration"')) failures.push('stable celebration landmark');
  if (!source.includes('aria-live="polite"')) failures.push('screen-reader announcement');
  if (!source.includes('prefers-reduced-motion: reduce')) failures.push('reduced-motion fallback');
  if (!source.includes('min-h-11')) failures.push('44px touch targets');
  if (!source.includes('sm:flex-row')) failures.push('responsive mobile actions');
  if (!source.includes('Chơi lại thử thách')) failures.push('replay action');
  if (!source.includes('Chuỗi hoàn thành')) failures.push('completion streak');
  if (/dark:|bg-slate-9\d\d/.test(source)) failures.push('dark UI leakage');
  return failures;
}

test('RED fixture proves the hard-gate rejects the previous weak/dark result card', async () => {
  const fixture = await readFile(negativeFixtureUrl, 'utf8');
  const failures = auditCelebrationSource(fixture);
  assert.ok(failures.length >= 7, `negative fixture unexpectedly passed: ${failures.join(', ')}`);
  assert.ok(failures.includes('dark UI leakage'));
});

test('GREEN celebration component satisfies accessibility, light theme and mobile gates', async () => {
  const component = await readFile(componentUrl, 'utf8');
  assert.deepEqual(auditCelebrationSource(component), []);
});

test('all six game completion branches use the shared celebration contract', async () => {
  const page = await readFile(pageUrl, 'utf8');
  assert.equal((page.match(/<GameCelebration/g) || []).length, 6);
  assert.equal((page.match(/onReplay=\{/g) || []).length, 6);
  assert.match(page, /function recordGameCompletion/);
  assert.equal((page.match(/recordGameCompletion\('/g) || []).length, 6);
});

test('achievement tiers produce deterministic 1/2/3-star feedback', () => {
  assert.deepEqual(
    [buildCelebrationResult(20, 100).stars, buildCelebrationResult(70, 100).stars, buildCelebrationResult(95, 100).stars],
    [1, 2, 3]
  );
  assert.equal(buildCelebrationResult(-50, 0).percent, 100);
  assert.equal(buildCelebrationResult(999, 100).percent, 100);
});
