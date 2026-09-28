import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const PROJECT_ROOT = path.resolve('.');

// Files and directories designated as UI / user-facing templates and manifests
const UI_SCAN_TARGETS = [
  'src/routes',
  'src/lib/components',
  'src/lib/unifiedStore.js',
  'src/app.html',
  'static/manifest.webmanifest'
];

/**
 * Recursively collect all relevant UI files
 */
function getUIFiles(targetPath) {
  const fullPath = path.resolve(PROJECT_ROOT, targetPath);
  if (!fs.existsSync(fullPath)) return [];

  const stat = fs.statSync(fullPath);
  if (stat.isFile()) {
    return [fullPath];
  }

  const files = [];
  const entries = fs.readdirSync(fullPath, { withFileTypes: true });
  for (const entry of entries) {
    const entryFullPath = path.join(fullPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...getUIFiles(entryFullPath));
    } else if (
      entry.name.endsWith('.svelte') ||
      entry.name.endsWith('.html') ||
      entry.name.endsWith('.webmanifest') ||
      entry.name.endsWith('.js')
    ) {
      files.push(entryFullPath);
    }
  }
  return files;
}

/**
 * Scan content for archaic phrase "khảo thí"
 * Returns list of violations with line numbers
 */
function scanForArchaicTerminology(content, filePath = 'memory') {
  const violations = [];
  const lines = content.split('\n');
  const termRegex = /khảo thí/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (termRegex.test(line)) {
      violations.push({
        file: path.relative(PROJECT_ROOT, filePath),
        line: i + 1,
        content: line.trim()
      });
    }
  }
  return violations;
}

test('Terminology Audit: Scan all UI templates, DOM titles, manifest, and stores for "khảo thí"', () => {
  const allViolations = [];
  let scannedFileCount = 0;

  for (const target of UI_SCAN_TARGETS) {
    const files = getUIFiles(target);
    for (const file of files) {
      scannedFileCount++;
      const content = fs.readFileSync(file, 'utf8');
      const violations = scanForArchaicTerminology(content, file);
      if (violations.length > 0) {
        allViolations.push(...violations);
      }
    }
  }

  assert.ok(scannedFileCount >= 10, `Expected at least 10 UI files scanned, found ${scannedFileCount}`);
  
  if (allViolations.length > 0) {
    console.error('\n❌ Found archaic "khảo thí" terminology in UI files:');
    for (const v of allViolations) {
      console.error(`  - ${v.file}:${v.line} -> "${v.content}"`);
    }
  }

  assert.equal(
    allViolations.length,
    0,
    `Found ${allViolations.length} occurrences of archaic "khảo thí" in user-facing UI templates/manifests!`
  );
});

test('Terminology Audit: Manifest specific check (short_name, name, description, shortcuts)', () => {
  const manifestPath = path.resolve(PROJECT_ROOT, 'static/manifest.webmanifest');
  assert.ok(fs.existsSync(manifestPath), 'manifest.webmanifest must exist');
  
  const manifestRaw = fs.readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(manifestRaw);

  assert.ok(!/khảo thí/i.test(manifest.name), 'manifest.name contains "khảo thí"');
  assert.ok(!/khảo thí/i.test(manifest.short_name), 'manifest.short_name contains "khảo thí"');
  assert.ok(!/khảo thí/i.test(manifest.description), 'manifest.description contains "khảo thí"');

  for (const shortcut of manifest.shortcuts || []) {
    assert.ok(!/khảo thí/i.test(shortcut.name), `shortcut.name "${shortcut.name}" contains "khảo thí"`);
    assert.ok(!/khảo thí/i.test(shortcut.short_name), `shortcut.short_name "${shortcut.short_name}" contains "khảo thí"`);
    assert.ok(!/khảo thí/i.test(shortcut.description), `shortcut.description "${shortcut.description}" contains "khảo thí"`);
  }
});

test('Terminology Audit: Negative Control Verification (Injected phrase MUST fail scanner)', () => {
  const badTemplateSample = `
    <div class="header">
      <h1>Phòng Khảo Thí Tự Động</h1>
      <p>Học sinh tham gia khảo thí định kỳ để nhận chứng chỉ.</p>
    </div>
  `;

  const violations = scanForArchaicTerminology(badTemplateSample, 'mock/BadComponent.svelte');
  
  // The scanner MUST catch both occurrences in the bad template
  assert.equal(violations.length, 2, 'Negative control: Scanner must detect exactly 2 violations in bad template');
  assert.equal(violations[0].line, 3);
  assert.ok(violations[0].content.includes('Phòng Khảo Thí'));
  assert.equal(violations[1].line, 4);
  assert.ok(violations[1].content.includes('khảo thí'));

  // Prove that asserting violations.length === 0 throws an AssertionError
  assert.throws(
    () => {
      assert.equal(violations.length, 0, 'Injected terminology should cause test failure');
    },
    /AssertionError/,
    'Negative control must throw AssertionError when "khảo thí" is injected'
  );
});
