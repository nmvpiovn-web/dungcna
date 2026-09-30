// Runner for Full End-to-End User Simulation and QA Audit Suite
// Builds fresh source, provisions isolated local D1 with all migrations 0001-0004,
// boots server on a free port, and executes full_user_deep_audit.mjs
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
const output = path.join(root, 'artifacts', 'deep-qa-audit', runId);
fs.mkdirSync(output, { recursive: true });

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'tienganh7-qa-audit-'));
const wrangler = path.join(root, 'node_modules/wrangler/bin/wrangler.js');
const password = 'TestPass123!';
const secret = crypto.randomBytes(32).toString('hex');

const manifest = {
  runId,
  output,
  temp,
  localOnly: true,
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  stages: []
};

let server, serverLog;

function command(args, cwd, logName, env = process.env) {
  return new Promise((resolve, reject) => {
    const log = fs.createWriteStream(path.join(output, logName));
    const child = spawn(process.execPath, args, { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.pipe(log, { end: false });
    child.stderr.pipe(log, { end: false });
    child.on('error', e => { log.end(); reject(e); });
    child.on('close', code => { log.end(); resolve(code ?? 1); });
  });
}

async function required(args, cwd, logName) {
  const code = await command(args, cwd, logName);
  manifest.stages.push({ logName, code });
  if (code) throw new Error(`${logName} exited ${code}; see ${output}`);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const port = s.address().port;
      s.close(() => resolve(port));
    });
  });
}

try {
  console.log('=== TIẾNG ANH CÔ DUNG: DEEP SYSTEM QA & USER SIMULATION RUNNER ===');
  console.log('Evidence output: ' + output);

  // 1. Build current source
  console.log('Building Vite bundle from working tree...');
  await required([path.join(root, 'node_modules/vite/bin/vite.js'), 'build'], root, 'build.log');

  // 2. Wrangler configuration for local isolated test
  fs.writeFileSync(path.join(temp, 'wrangler.json'), JSON.stringify({
    name: 'tienganh7-qa-audit',
    compatibility_date: '2026-09-23',
    compatibility_flags: ['nodejs_compat'],
    pages_build_output_dir: path.join(root, 'build'),
    vars: { AUTH_SECRET: secret },
    d1_databases: [{
      binding: 'DB',
      database_name: 'qa-audit-db',
      database_id: '00000000-0000-0000-0000-000000000007'
    }]
  }));

  // 3. Apply all migrations in order
  const migrations = fs.readdirSync(path.join(root, 'migrations')).filter(f => f.endsWith('.sql')).sort();
  manifest.migrations = migrations;
  console.log(`Applying ${migrations.length} migrations to fresh local D1...`);
  for (const file of migrations) {
    await required([
      wrangler, 'd1', 'execute', 'qa-audit-db', '--local', '--persist-to', './state',
      '--file', path.join(root, 'migrations', file)
    ], temp, 'migration-' + file + '.log');
  }

  // 4. Reset passwords for seeded users
  const hash = await hashPassword(password);
  fs.writeFileSync(path.join(temp, 'fixture.sql'), `
    UPDATE users SET password='${hash}' WHERE username IN ('admin', 'msdung', 'teacher.john', 'hocsinh', 'baokhiem', 'phuhuynh');
    UPDATE parent_student_links SET verification_status='verified' WHERE id='psl_1';
  `);
  await required([
    wrangler, 'd1', 'execute', 'qa-audit-db', '--local', '--persist-to', './state',
    '--file', path.join(temp, 'fixture.sql')
  ], temp, 'fixture.log');

  // 5. Start isolated local dev server
  const port = await freePort(), inspector = await freePort();
  const base = `http://127.0.0.1:${port}`;
  manifest.base = base;
  console.log(`Starting preview server on ${base}...`);

  serverLog = fs.createWriteStream(path.join(output, 'server.log'));
  server = spawn(process.execPath, [
    wrangler, 'pages', 'dev', '--ip', '127.0.0.1', '--port', String(port),
    '--inspector-port', String(inspector), '--persist-to', './state'
  ], { cwd: temp, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });

  const logChunk = chunk => serverLog.write(chunk.toString().replaceAll(secret, '[qa-secret]'));
  server.stdout.on('data', logChunk);
  server.stderr.on('data', logChunk);

  let ready = false;
  for (let i = 0; i < 90; i++) {
    if (server.exitCode !== null) throw new Error('Preview server exited prematurely; see server.log');
    try {
      const response = await fetch(base, { signal: AbortSignal.timeout(1500) });
      if (response.ok) { ready = true; break; }
    } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  if (!ready) throw new Error('Preview server readiness timeout');
  console.log('Preview server ready! Executing comprehensive user simulation & audit suite...');

  // 6. Execute full user deep audit suite
  const code = await command([
    path.join(root, 'tests/qa/full_user_deep_audit.mjs')
  ], root, 'audit_execution.log', {
    ...process.env,
    QA_BASE: base,
    QA_OUTPUT: output,
    QA_PASSWORD: password
  });

  manifest.stages.push({ logName: 'audit_execution.log', code });
  process.exitCode = code;

  // 7. Output results summary
  if (fs.existsSync(path.join(output, 'results.json'))) {
    const report = JSON.parse(fs.readFileSync(path.join(output, 'results.json'), 'utf8'));
    console.log('\n================ AUDIT SUMMARY ================');
    console.log(`TOTAL CASES: ${report.summary.total} | PASSED: ${report.summary.passed} | FAILED: ${report.summary.failed}`);
    for (const r of report.results) {
      const badge = r.status === 'PASS' ? '✅ PASS' : '❌ FAIL';
      console.log(`${badge} [${r.persona || 'GENERAL'}] ${r.id}: ${r.title} (${r.duration}ms)`);
      if (r.error) console.log(`   └─ Error: ${r.error}`);
    }
  }
} catch (e) {
  manifest.error = e.message;
  console.error('\n[FATAL ERROR]', e.message);
  process.exitCode = 1;
} finally {
  if (server && server.exitCode === null) {
    if (process.platform === 'win32') {
      try { execFileSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); } catch {}
    } else server.kill('SIGTERM');
  }
  serverLog?.end();
  manifest.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log('\nAudit complete! Evidence saved to: ' + output);
}
