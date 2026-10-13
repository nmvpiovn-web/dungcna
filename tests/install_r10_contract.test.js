import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'child_process';
import path from 'path';

const scriptPath = path.resolve('scripts/install_r10.ps1');

test('R10-01: install_r10 fails closed when APK file does not exist', () => {
  const res = spawnSync('pwsh', ['-File', scriptPath, '-ApkPath', 'static/downloads/non_existent.apk', '-DryRun'], {
    encoding: 'utf-8'
  });
  assert.equal(res.status, 1);
  assert.match(res.stderr + res.stdout, /APK file not found/i);
});

test('R10-02: install_r10 fails closed on SHA-256 hash mismatch', () => {
  const fakeHash = '1111111111111111111111111111111111111111111111111111111111111111';
  const res = spawnSync('pwsh', ['-File', scriptPath, '-ExpectedSha256', fakeHash, '-DryRun'], {
    encoding: 'utf-8'
  });
  assert.equal(res.status, 1);
  assert.match(res.stderr + res.stdout, /SHA-256 hash mismatch/i);
});

test('R10-03: install_r10 fails closed when non-existent device serial is passed', () => {
  const res = spawnSync('pwsh', ['-File', scriptPath, '-Device', 'FAKE_SERIAL_999999', '-DryRun'], {
    encoding: 'utf-8'
  });
  assert.equal(res.status, 1);
  assert.match(res.stderr + res.stdout, /not in the list of authorized devices|No authorized Android device/i);
});

test('R10-04: install_r10 DryRun succeeds and constructs correct adb install -r command', () => {
  const res = spawnSync('pwsh', ['-File', scriptPath, '-DryRun'], {
    encoding: 'utf-8'
  });
  // If a device is attached, it should exit 0 with [DRY-RUN]; if no device is attached (e.g. CI), it outputs actionable guidance
  if (res.status === 0) {
    assert.match(res.stdout, /\[DRY-RUN\] Verification complete/);
    assert.match(res.stdout, /install -r/);
  } else {
    assert.match(res.stderr + res.stdout, /No authorized Android device connected/);
  }
});
