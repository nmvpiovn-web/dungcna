import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('service worker chỉ cache Quiz Menu public và có background sync', () => {
  const source = fs.readFileSync('static/sw.js', 'utf8');
  assert.match(source, /isPublicQuizRead/);
  assert.match(source, /!url\.searchParams\.has\('include_answers'\)/);
  assert.match(source, /!event\.request\.headers\.has\('Authorization'\)/);
  assert.match(source, /event\.tag === 'quiz-attempt-sync'/);
  assert.match(source, /if \(!item\.attemptToken\) continue/);
});

test('offline queue không lưu auth token và app sync có quiz cursor', () => {
  const queue = fs.readFileSync('src/lib/quizOffline.js', 'utf8');
  assert.doesNotMatch(queue, /authToken[^\n]*storePut/);
  const sync = fs.readFileSync('src/routes/api/app/sync/+server.js', 'utf8');
  assert.match(sync, /changes:\s*\{[\s\S]*quizzes:\s*\[\]/);
  assert.match(sync, /FROM quizzes[\s\S]*datetime\(updated_at\) > datetime\(\?\)/);
});
