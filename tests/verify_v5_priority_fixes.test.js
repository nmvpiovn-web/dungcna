import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, next) {
  if (specifier.startsWith('$lib/')) {
    const path = specifier.slice(5);
    return next(new URL('../src/lib/' + path + (path.endsWith('.js') ? '' : '.js'), import.meta.url).href, context);
  }
  return next(specifier, context);
}});
const { createSignedToken } = await import('../src/lib/server/auth.js');
const campuses = await import('../src/routes/api/campuses/+server.js');
const discussions = await import('../src/routes/api/discussions/+server.js');
const evaluations = await import('../src/routes/api/evaluations/+server.js');
const secret = 'isolated-regression-secret-32-characters';
const teacher = { id: 'verified-teacher', username: 'verified_teacher', name: 'Verified Teacher', role: 'teacher', status: 'active', metadata: '{}' };
function database(user, fault) {
  return { async batch() { if (fault === 'batch') throw new Error('injected batch failure'); }, prepare(sql) { return {
    bind() { return this; }, async first() { return user; },
    async all() { if (fault === 'read') throw new Error('injected read failure'); return { results: [] }; },
    async run() { if (fault === 'write') throw new Error('injected write failure'); return { meta: { changes: 1 } }; }
  }; } };
}
async function event(body, user = teacher, fault, anonymous = false) {
  const token = await createSignedToken(user, secret);
  const url = new URL('https://test.invalid/api/test');
  return { url, platform: { env: { AUTH_SECRET: secret, DB: database(user, fault) } }, request: new Request(url, {
    method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(anonymous ? {} : { authorization: `Bearer ${token}` }) }, ...(body ? { body: JSON.stringify(body) } : {})
  }) };
}
test('campuses rejects anonymous GET and POST before D1 operations', async () => {
  for (const method of ['GET', 'POST']) {
    const e = await event(method === 'POST' ? { action: 'log_stream' } : null, teacher, null, true);
    e.platform.env.DB = { prepare() { throw new Error('must not access DB'); } };
    assert.equal((await campuses[method](e)).status, 401);
  }
});
test('campuses rejects student access', async () => {
  for (const method of ['GET', 'POST']) assert.equal((await campuses[method](await event(method === 'POST' ? {} : null, { ...teacher, role: 'student' }))).status, 403);
});
test('campuses read and schema faults return 503 without fallback data', async () => {
  for (const fault of ['read', 'batch']) {
    const response = await campuses.GET(await event(null, teacher, fault));
    assert.equal(response.status, 503);
    assert.equal((await response.json()).campuses, undefined);
  }
});
test('campuses write and batch faults never report success', async () => {
  for (const fault of ['write', 'batch']) {
    const response = await campuses.POST(await event({ action: 'log_stream', campus_id: 'test', title: 'Test' }, teacher, fault));
    assert.equal(response.status, 503);
    assert.equal((await response.json()).success, false);
  }
});
test('empty campuses D1 result stays empty; successful write reports verified actor', async () => {
  const response = await campuses.GET(await event(null));
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).campuses, []);
  const post = await campuses.POST(await event({ action: 'log_stream', campus_id: 'test', title: 'Test', actor_id: 'forged' }));
  assert.equal(post.status, 200);
  assert.equal((await post.json()).stream.actor_id, teacher.id);
});
test('discussion author is verified actor, including when payload claims admin', async () => {
  const response = await discussions.POST(await event({ evaluation_id: 'test', content: 'Test', author_id: 'forged', author_role: 'admin' }));
  assert.equal(response.status, 200);
  const { comment } = await response.json();
  assert.equal(comment.author_id, teacher.id);
  assert.equal(comment.author_role, 'teacher');
});
test('evaluation response and report use verified teacher', async () => {
  const response = await evaluations.POST(await event({ student_id: 'test', student_name: 'Test', grade_level: 'Lớp 7', teacher_id: 'forged' }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.evaluation.teacher_id, teacher.id);
  assert.equal(body.evaluation.teacher_name, teacher.name);
  assert.ok(body.report_card.includes(teacher.name));
});
