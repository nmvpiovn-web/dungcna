// Builds current source, provisions a fresh LOCAL D1, and runs the six-module gate.
// Never accepts a remote URL or touches the repository's Wrangler account/database.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { hashPassword } from '../src/lib/server/auth.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runId = new Date().toISOString().replaceAll(/[:.]/g, '-');
const output = path.join(root, 'artifacts', 'v5-module-gate', runId);
fs.mkdirSync(output, { recursive: true });
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'tienganh7-v5-gate-'));
const wrangler = path.join(root, 'node_modules/wrangler/bin/wrangler.js');
const password = 'Gate-' + crypto.randomUUID();
const secret = crypto.randomBytes(32).toString('hex');
const manifest = { runId, output, temp, localOnly: true, sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), sourceDiffSha256: crypto.createHash('sha256').update(execFileSync('git', ['diff', '--', 'src', 'migrations'], { cwd: root })).digest('hex'), stages: [] };
manifest.gateSha256 = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'tests/v5/module-gate.mjs'))).digest('hex');
let server, serverLog;
function command(args, cwd, logName, env = process.env) {
  return new Promise((resolve, reject) => {
    const log = fs.createWriteStream(path.join(output, logName));
    const child = spawn(process.execPath, args, { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.pipe(log, { end: false }); child.stderr.pipe(log, { end: false });
    child.on('error', e => { log.end(); reject(e); });
    child.on('close', code => { log.end(); resolve(code ?? 1); });
  });
}
async function required(args, cwd, logName) {
  const code = await command(args, cwd, logName); manifest.stages.push({ logName, code });
  if (code) throw new Error(`${logName} exited ${code}; see ${output}`);
}
function freePort() { return new Promise((resolve, reject) => { const s = net.createServer(); s.on('error', reject); s.listen(0, '127.0.0.1', () => { const port = s.address().port; s.close(() => resolve(port)); }); }); }
try {
  console.log('Building current source. Evidence: ' + output);
  // Vite builds current source directly. Record our own identity, never trust stale build_meta.
  await required([path.join(root, 'node_modules/vite/bin/vite.js'), 'build'], root, 'build.log');
  fs.writeFileSync(path.join(temp, 'wrangler.json'), JSON.stringify({ name: 'tienganh7-v5-module-gate', compatibility_date: '2026-09-23', compatibility_flags: ['nodejs_compat'], pages_build_output_dir: path.join(root, 'build'), vars: { AUTH_SECRET: secret }, d1_databases: [{ binding: 'DB', database_name: 'gate-only', database_id: '00000000-0000-0000-0000-000000000006' }] }));
  const migrations = fs.readdirSync(path.join(root, 'migrations')).filter(f => f.endsWith('.sql')).sort();
  manifest.migrations = migrations;
  for (const file of migrations) await required([wrangler, 'd1', 'execute', 'gate-only', '--local', '--persist-to', './state', '--file', path.join(root, 'migrations', file)], temp, 'migration-' + file + '.log');
  // Only reset passwords for existing seeded users. Do not add missing schema in fixtures.
  const hash = await hashPassword(password);
  fs.writeFileSync(path.join(temp, 'fixture.sql'), `UPDATE users SET password='${hash}' WHERE username IN ('admin','teacher.john','hocsinh','phuhuynh');`);
  await required([wrangler, 'd1', 'execute', 'gate-only', '--local', '--persist-to', './state', '--file', path.join(temp, 'fixture.sql')], temp, 'fixture.log');
  const port = await freePort(), inspector = await freePort();
  const base = `http://127.0.0.1:${port}`; manifest.base = base;
  serverLog = fs.createWriteStream(path.join(output, 'server.log'));
  server = spawn(process.execPath, [wrangler, 'pages', 'dev', '--ip', '127.0.0.1', '--port', String(port), '--inspector-port', String(inspector), '--persist-to', './state'], { cwd: temp, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  // Wrangler logs binding values. Redact the test-only secret even in local artifacts.
  const logChunk = chunk => serverLog.write(chunk.toString().replaceAll(secret, '[audit-secret]').replaceAll(secret.slice(0, 32), '[audit-secret-prefix]'));
  server.stdout.on('data', logChunk); server.stderr.on('data', logChunk);
  let ready = false;
  for (let i = 0; i < 90; i++) {
    if (server.exitCode !== null) throw new Error('Local preview exited; inspect server.log');
    try { const response = await fetch(base, { signal: AbortSignal.timeout(1500) }); if (response.ok) { ready = true; break; } } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  if (!ready) throw new Error('Local preview readiness timeout');
  console.log('Running sequential API/UI assertions against fresh local D1.');
  const code = await command([path.join(root, 'tests/v5/module-gate.mjs')], root, 'gate.log', { ...process.env, V5_GATE_BASE: base, V5_GATE_OUTPUT: output, V5_GATE_PASSWORD: password });
  manifest.stages.push({ logName: 'gate.log', code });
  process.exitCode = code;
  if (fs.existsSync(path.join(output, 'results.json'))) {
    const report = JSON.parse(fs.readFileSync(path.join(output, 'results.json'), 'utf8'));
    console.log(JSON.stringify(report.summary));
    for (const result of report.results) console.log(`${result.status} ${result.id}: ${result.message || result.title}`);
  }
} catch (e) { manifest.error = e.message; console.error(e.message); process.exitCode = 1; }
finally {
  if (server && server.exitCode === null) {
    if (process.platform === 'win32') {
      // Stop only the child process tree created by this runner, no image-name kill.
      try { execFileSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); } catch {}
    } else server.kill('SIGTERM');
  }
  serverLog?.end();
  manifest.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log('Evidence saved to ' + output);
}
