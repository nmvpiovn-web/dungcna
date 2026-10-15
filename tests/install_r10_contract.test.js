import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import apkManifest from '../src/lib/apkIntegrityManifest.json' with { type: 'json' };

const scriptPath = path.resolve('scripts/install_r10.ps1');
const psBin = spawnSync('pwsh', ['-Version']).status === 0 ? 'pwsh' : 'powershell';

function runInstaller(args, envOverrides = {}) {
  return spawnSync(psBin, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, ...args], {
    encoding: 'utf-8',
    env: {
      ...process.env,
      ...envOverrides
    }
  });
}

function createFakeToolsSandbox({
  packageId = apkManifest.package_id,
  versionCode = String(apkManifest.version_code),
  versionName = apkManifest.version_name,
  certSha256 = apkManifest.signing_cert_sha256,
  manufacturer = 'DOOGEE',
  model = 'R10',
  deviceSerial = 'D2304029AZ00036#M101TBR200-TC67D',
  installResult = 'Success',
  postflightPmPath = 'package:/data/app/vn.edu.tienganhcodung.app-1/base.apk'
} = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r10-test-'));
  const adbLog = path.join(dir, 'adb_calls.log');
  fs.writeFileSync(adbLog, '', 'utf-8');

  const aaptCmd = path.join(dir, 'fake_aapt2.cmd');
  fs.writeFileSync(
    aaptCmd,
    `@echo off\r\necho package: name='${packageId}' versionCode='${versionCode}' versionName='${versionName}' platformBuildVersionName='14'\r\nexit /b 0\r\n`,
    'utf-8'
  );

  const apksignerCmd = path.join(dir, 'fake_apksigner.cmd');
  fs.writeFileSync(
    apksignerCmd,
    `@echo off\r\necho Signer #1 certificate DN: C=US, O=Android, CN=Android Debug\r\necho Signer #1 certificate SHA-256 digest: ${certSha256}\r\nexit /b 0\r\n`,
    'utf-8'
  );

  const adbScript = path.join(dir, 'fake_adb.cjs');
  fs.writeFileSync(
    adbScript,
    `
const fs = require('fs');
const args = process.argv.slice(2);
const logFile = ${JSON.stringify(adbLog)};
fs.appendFileSync(logFile, JSON.stringify(args) + '\\n', 'utf-8');

if (args[0] === 'devices') {
  console.log('List of devices attached');
  console.log('${deviceSerial}\\tdevice');
  process.exit(0);
}
const cmdIdx = args.indexOf('shell');
if (cmdIdx !== -1) {
  const shellCmd = args.slice(cmdIdx + 1).join(' ');
  if (shellCmd.includes('ro.product.manufacturer')) {
    console.log('${manufacturer}');
    process.exit(0);
  }
  if (shellCmd.includes('ro.product.model')) {
    console.log('${model}');
    process.exit(0);
  }
  if (shellCmd.includes('ro.build.version.release')) {
    console.log('13');
    process.exit(0);
  }
  if (shellCmd.includes('pm list packages')) {
    console.log('package:${packageId}');
    process.exit(0);
  }
  if (shellCmd.includes('pm path')) {
    console.log('${postflightPmPath}');
    process.exit(0);
  }
  if (shellCmd.includes('dumpsys package')) {
    console.log('    versionCode=${versionCode} minSdk=24 targetSdk=34');
    console.log('    versionName=${versionName}');
    process.exit(0);
  }
}
if (args.includes('install')) {
  console.log('${installResult}');
  process.exit('${installResult}' === 'Success' ? 0 : 1);
}
process.exit(0);
`,
    'utf-8'
  );

  const adbCmd = path.join(dir, 'fake_adb.cmd');
  fs.writeFileSync(adbCmd, `@echo off\r\n"${process.execPath}" "${adbScript}" %*\r\n`, 'utf-8');

  const getAdbCalls = () =>
    fs
      .readFileSync(adbLog, 'utf-8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));

  const getInstallCalls = () => getAdbCalls().filter((callArgs) => callArgs.includes('install'));

  const cleanup = () => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {}
  };

  return { dir, aaptCmd, apksignerCmd, adbCmd, getAdbCalls, getInstallCalls, cleanup };
}

test('R10-01: install_r10 fails closed when APK file does not exist and never calls adb install', () => {
  const sb = createFakeToolsSandbox();
  try {
    const res = runInstaller(['-ApkPath', 'static/downloads/non_existent.apk'], {
      R10_AAPT_BIN: sb.aaptCmd,
      R10_APKSIGNER_BIN: sb.apksignerCmd,
      R10_ADB_BIN: sb.adbCmd
    });
    assert.equal(res.status, 1);
    assert.match(res.stderr + res.stdout, /APK file not found/i);
    assert.equal(sb.getInstallCalls().length, 0, 'Must never call adb install');
  } finally {
    sb.cleanup();
  }
});

test('R10-02: install_r10 rejects ExpectedSha256 caller override that does not match trusted manifest anchor', () => {
  const sb = createFakeToolsSandbox();
  try {
    const fakeHash = '1111111111111111111111111111111111111111111111111111111111111111';
    const res = runInstaller(['-ExpectedSha256', fakeHash], {
      R10_AAPT_BIN: sb.aaptCmd,
      R10_APKSIGNER_BIN: sb.apksignerCmd,
      R10_ADB_BIN: sb.adbCmd
    });
    assert.equal(res.status, 1);
    assert.match((res.stderr + res.stdout).replace(/\s+/g, ' '), /SHA-256 hash mismatch against trusted security anchor/i);
    assert.equal(sb.getInstallCalls().length, 0, 'Must never call adb install');
  } finally {
    sb.cleanup();
  }
});

test('R10-03: install_r10 fails closed when Android SDK preflight tools (aapt2/apksigner) are missing', () => {
  const sb = createFakeToolsSandbox();
  try {
    const res = runInstaller([], {
      R10_DISABLE_SDK_FALLBACK: '1',
      R10_AAPT_BIN: path.join(sb.dir, 'missing_aapt2.cmd'),
      R10_APKSIGNER_BIN: sb.apksignerCmd,
      R10_ADB_BIN: sb.adbCmd
    });
    assert.equal(res.status, 1);
    assert.match(res.stderr + res.stdout, /package inspection tool.*not found/i);
    assert.equal(sb.getInstallCalls().length, 0, 'Must never call adb install when aapt2 is missing');
  } finally {
    sb.cleanup();
  }
});

test('R10-04: install_r10 fails closed BEFORE adb install when APK package or version mismatches manifest', () => {
  const sbWrongPkg = createFakeToolsSandbox({ packageId: 'com.evil.trojan.app' });
  try {
    const res = runInstaller([], {
      R10_AAPT_BIN: sbWrongPkg.aaptCmd,
      R10_APKSIGNER_BIN: sbWrongPkg.apksignerCmd,
      R10_ADB_BIN: sbWrongPkg.adbCmd
    });
    assert.equal(res.status, 1);
    assert.match(res.stderr + res.stdout, /package\/version preflight mismatch/i);
    assert.equal(sbWrongPkg.getInstallCalls().length, 0, 'Must NEVER call adb install on wrong package');
  } finally {
    sbWrongPkg.cleanup();
  }

  const sbWrongVer = createFakeToolsSandbox({ versionName: '9.9.9', versionCode: '999' });
  try {
    const res = runInstaller([], {
      R10_AAPT_BIN: sbWrongVer.aaptCmd,
      R10_APKSIGNER_BIN: sbWrongVer.apksignerCmd,
      R10_ADB_BIN: sbWrongVer.adbCmd
    });
    assert.equal(res.status, 1);
    assert.match(res.stderr + res.stdout, /package\/version preflight mismatch/i);
    assert.equal(sbWrongVer.getInstallCalls().length, 0, 'Must NEVER call adb install on wrong version');
  } finally {
    sbWrongVer.cleanup();
  }
});

test('R10-05: install_r10 fails closed BEFORE adb install when APK signing certificate SHA-256 mismatches manifest', () => {
  const sbWrongSigner = createFakeToolsSandbox({
    certSha256: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef'
  });
  try {
    const res = runInstaller([], {
      R10_AAPT_BIN: sbWrongSigner.aaptCmd,
      R10_APKSIGNER_BIN: sbWrongSigner.apksignerCmd,
      R10_ADB_BIN: sbWrongSigner.adbCmd
    });
    assert.equal(res.status, 1);
    assert.match(res.stderr + res.stdout, /signing certificate SHA-256 mismatch/i);
    assert.equal(sbWrongSigner.getInstallCalls().length, 0, 'Must NEVER call adb install on wrong signer');
  } finally {
    sbWrongSigner.cleanup();
  }
});

test('R10-06: install_r10 executes exactly one adb install -r and postflight checks when all preflight gates pass', () => {
  const sbValid = createFakeToolsSandbox();
  try {
    const res = runInstaller([], {
      R10_AAPT_BIN: sbValid.aaptCmd,
      R10_APKSIGNER_BIN: sbValid.apksignerCmd,
      R10_ADB_BIN: sbValid.adbCmd
    });
    assert.equal(res.status, 0, `Expected exit 0, got: ${res.stderr}\n${res.stdout}`);
    assert.match(res.stdout, /\[SUCCESS\] Application installed and postflight verified/);

    const installCalls = sbValid.getInstallCalls();
    assert.equal(installCalls.length, 1, 'Must call adb install exactly once');
    assert.equal(installCalls[0].includes('-r'), true, 'Must include -r flag to preserve user data');

    // Verify postflight pm path and dumpsys package were executed after install
    const allCalls = sbValid.getAdbCalls().map((c) => c.join(' '));
    assert.equal(allCalls.some((c) => c.includes('pm path vn.edu.tienganhcodung.app')), true);
    assert.equal(allCalls.some((c) => c.includes('dumpsys package vn.edu.tienganhcodung.app')), true);
  } finally {
    sbValid.cleanup();
  }
});
