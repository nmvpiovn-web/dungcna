// Diagnostic reproductions: observed vulnerabilities are findings, never acceptance passes.
import { registerHooks } from 'node:module';
import { writeFileSync } from 'node:fs';
registerHooks({ resolve(specifier, context, next) {
  if (specifier.startsWith('$lib/')) {
    const path = specifier.slice(5);
    return next(new URL('../src/lib/' + path + (path.endsWith('.js') ? '' : '.js'), import.meta.url).href, context);
  }
  return next(specifier, context);
}});
globalThis.fetch = async () => { throw new Error('Audit blocks all network calls'); };
const { createSignedToken } = await import('../src/lib/server/auth.js');
const store = await import('../src/lib/unifiedStore.js');
const schedule = await import('../src/routes/api/schedule/+server.js');
const notify = await import('../src/routes/api/schedule/notify/+server.js');
const campuses = await import('../src/routes/api/campuses/+server.js');
const discussions = await import('../src/routes/api/discussions/+server.js');
const evaluations = await import('../src/routes/api/evaluations/+server.js');
const sepay = await import('../src/routes/api/webhook/sepay/+server.js');
const secret = 'isolated-audit-secret-32-characters-minimum';
const user = { id: 'audit_teacher', username: 'audit_teacher', name: 'Audit Teacher', role: 'teacher', status: 'active', metadata: '{}' };
const token = await createSignedToken(user, secret);
const writes = [];
const db = { prepare(sql) { return { bind(...args) { this.args = args; return this; }, async first() { return user; }, async all() { throw new Error('Injected D1 read failure'); }, async run() { writes.push({ sql, args: this.args }); throw new Error('Injected D1 write failure'); } }; }, async batch() { throw new Error('Injected D1 batch failure'); } };
const platform = { env: { AUTH_SECRET: secret, DB: db } };
function event(path, body, authenticated = true) { const url = new URL('https://audit.invalid' + path); return { url, platform, request: new Request(url, { method: body ? 'POST' : 'GET', headers: { ...(authenticated ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }) }; }
const findings = [];
async function record(id, operation, details) {
  try { const response = await operation(); const body = await response.json(); findings.push({ id, status: response.status, ...details(body) }); }
  catch (e) { findings.push({ id, threw: e.message }); }
}
await record('schedule-anonymous-read', () => schedule.GET(event('/api/schedule', null, false)), b => ({ exposed: b.success, count: b.sessions?.length }));
const session = store.getAllClassSessions()[0];
await record('notify-anonymous', () => notify.POST(event('/api/schedule/notify', { session_id: session?.id || 'absent' }, false)), b => ({ success: b.success, containsSession: !!b.session }));
await record('campuses-anonymous-read', () => campuses.GET(event('/api/campuses', null, false)), b => ({ success: b.success, count: b.campuses?.length }));
await record('campuses-write-failure', () => campuses.POST(event('/api/campuses', { action: 'log_stream', campus_id: 'audit', title: 'Isolated audit' })), b => ({ falseSuccess: b.success }));
await record('schedule-write-no-persistence', () => schedule.POST(event('/api/schedule', { id: 'audit_session', class_name: 'Isolated audit', start_time: '10:00' })), b => ({ success: b.success, persistedInStore: store.getAllClassSessions().some(s => s.id === 'audit_session') }));
await record('discussion-actor-and-persistence', () => discussions.POST(event('/api/discussions', { id: 'audit_comment', evaluation_id: 'audit_eval', content: 'Isolated audit' })), b => ({ success: b.success, expectedActor: user.id, actualActor: b.comment?.author_id, persistedInStore: store.getDiscussionsForEvaluation('audit_eval').some(c => c.id === 'audit_comment') }));
await record('evaluation-failed-write', () => evaluations.POST(event('/api/evaluations', { id: 'audit_eval', student_id: 'audit_student', student_name: 'Audit Student', grade_level: 'Lớp 7' })), b => ({ success: b.success, persistedInStore: store.getAllEvaluations().some(e => e.id === 'audit_eval') }));
await record('evaluation-response-actor', () => evaluations.POST({ ...event('/api/evaluations', { id: 'audit_eval2', student_id: 'audit_student', student_name: 'Audit Student', grade_level: 'Lớp 7' }), platform: { env: { AUTH_SECRET: secret, DB: { prepare(sql) { return { bind() { return this; }, async first() { return user; }, async run() { return { meta: { changes: 1 } }; } }; } } } } }), b => ({ success: b.success, expectedActor: user.id, actualActor: b.evaluation?.teacher_id }));
await record('sepay-replay-changed-payload', () => sepay.POST({ request: new Request('https://audit.invalid/api/webhook/sepay', { method: 'POST', headers: { 'content-type': 'application/json', 'x-sepay-api-key': 'audit-only' }, body: JSON.stringify({ id: 'existing', transferType: 'in', transferAmount: 999999, content: 'HP_999' }) }), platform: { env: { SEPAY_WEBHOOK_SECRET: 'audit-only', DB: { batch() {}, prepare() { return { bind() { return this; }, async first() { return { id: 'original', amount: 100, bill_id: 'HP_001', status: 'confirmed' }; } }; } } } } }), b => ({ success: b.success, replayStatus: b.status }));
writeFileSync(new URL('../tests/v5_priority_audit_current.json', import.meta.url), JSON.stringify({ kind: 'diagnostic_observations_not_acceptance_tests', generatedAt: new Date().toISOString(), findings }, null, 2));
console.log(JSON.stringify(findings, null, 2));
