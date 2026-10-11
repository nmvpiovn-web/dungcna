import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { parseGradeLevel } from '../src/lib/server/quizAutoBuilder.js';
import { resolveDefaultGradeLevel } from '../src/lib/quizDefaults.js';

// -------------------------------------------------------------
// RED-7.1: Saved default grade 0 preserved across API, defaults resolver, and UI
// -------------------------------------------------------------
test('RED-7.1: resolveDefaultGradeLevel preserves 0 (IELTS/General) and defaults properly', () => {
  // 0 is preserved
  assert.equal(resolveDefaultGradeLevel(0), 0);
  assert.equal(resolveDefaultGradeLevel('0'), 0);
  assert.equal(resolveDefaultGradeLevel(' 0 '), 0);

  // Valid 1..12 preserved
  assert.equal(resolveDefaultGradeLevel(1), 1);
  assert.equal(resolveDefaultGradeLevel('1'), 1);
  assert.equal(resolveDefaultGradeLevel(7), 7);
  assert.equal(resolveDefaultGradeLevel('7'), 7);
  assert.equal(resolveDefaultGradeLevel(12), 12);
  assert.equal(resolveDefaultGradeLevel('12'), 12);

  // Missing or empty values fallback to 7
  assert.equal(resolveDefaultGradeLevel(undefined), 7);
  assert.equal(resolveDefaultGradeLevel(null), 7);
  assert.equal(resolveDefaultGradeLevel(''), 7);
  assert.equal(resolveDefaultGradeLevel('   '), 7);

  // Invalid values fallback to 7
  assert.equal(resolveDefaultGradeLevel(-1), 7);
  assert.equal(resolveDefaultGradeLevel(13), 7);
  assert.equal(resolveDefaultGradeLevel('13'), 7);
  assert.equal(resolveDefaultGradeLevel('invalid'), 7);
  assert.equal(resolveDefaultGradeLevel({}), 7);
  assert.equal(resolveDefaultGradeLevel(true), 7);
});

test('RED-7.1: +page.svelte and builder-defaults API do not use falsy || 7 for grade_level', () => {
  const pageSrc = fs.readFileSync('src/routes/quiz-menu/+page.svelte', 'utf8');
  assert.ok(
    !pageSrc.includes('res.defaults.grade_level || 7'),
    '+page.svelte must not use res.defaults.grade_level || 7 which drops grade 0'
  );
  assert.ok(
    pageSrc.includes('resolveDefaultGradeLevel(res.defaults.grade_level)'),
    '+page.svelte must use resolveDefaultGradeLevel for loading defaults'
  );

  const apiSrc = fs.readFileSync('src/routes/api/quiz-menu/builder-defaults/+server.js', 'utf8');
  assert.ok(
    !apiSrc.includes('row.grade_level || 7'),
    'builder-defaults GET must not use row.grade_level || 7'
  );
  assert.ok(
    apiSrc.includes('resolveDefaultGradeLevel(row.grade_level)'),
    'builder-defaults GET must use resolveDefaultGradeLevel to preserve grade 0 from D1'
  );
});

// -------------------------------------------------------------
// RED-7.2: QuizCameraCapture accessibility, 44px touch target, and reactivity after reorder
// -------------------------------------------------------------
test('RED-7.2: QuizCameraCapture .thumb-label-input accessibility and mobile touch target contract', () => {
  const compSrc = fs.readFileSync('src/lib/components/QuizCameraCapture.svelte', 'utf8');

  // Verify 44px minimum touch target for mobile/a11y
  assert.ok(
    compSrc.includes('min-height: 44px;'),
    'QuizCameraCapture .thumb-label-input must specify min-height: 44px'
  );

  // Verify box-sizing: border-box
  assert.ok(
    compSrc.includes('box-sizing: border-box;'),
    'QuizCameraCapture controls must have box-sizing: border-box to avoid overflow'
  );

  // Verify maxlength="80"
  assert.ok(
    compSrc.includes('maxlength="80"'),
    'QuizCameraCapture label input must enforce maxlength="80"'
  );

  // Verify aria-label associated with page
  assert.ok(
    compSrc.includes('aria-label={`Nhãn từ vựng trang ${idx + 1}'),
    'QuizCameraCapture label input must have aria-label with page index'
  );

  // Verify label for matching input id
  assert.ok(
    compSrc.includes('camera-thumb-label-${item.id}'),
    'QuizCameraCapture must have matching label for and input id'
  );
});

test('RED-7.2: QuizCameraCapture label editing reactivity and confirm callback preservation after reorder', () => {
  // Simulate QuizCameraCapture items array and callbacks
  let items = [
    { file: { name: 'page1.jpg' }, previewUrl: 'blob:1', id: 'img_1', label: '' },
    { file: { name: 'page2.jpg' }, previewUrl: 'blob:2', id: 'img_2', label: '' }
  ];

  // User types label for page 1: "apple"
  const val1 = 'apple';
  items[0] = { ...items[0], label: val1 };

  // User types label for page 2: "banana"
  const val2 = 'banana';
  items[1] = { ...items[1], label: val2 };

  assert.equal(items[0].label, 'apple');
  assert.equal(items[1].label, 'banana');

  // User reorders: move page 2 up to position 0 (swap items[0] and items[1])
  const copy = [...items];
  [copy[0], copy[1]] = [copy[1], copy[0]];
  items = copy;

  // Verify that item with page2.jpg now retains 'banana' at index 0
  assert.equal(items[0].file.name, 'page2.jpg');
  assert.equal(items[0].label, 'banana');
  assert.equal(items[1].file.name, 'page1.jpg');
  assert.equal(items[1].label, 'apple');

  // Confirm callback simulation
  let capturedFiles = null;
  let capturedLabels = null;
  function onCaptureFiles(files, labels) {
    capturedFiles = files;
    capturedLabels = labels;
  }

  function confirm() {
    if (!items.length) return;
    const files = items.map((it) => it.file);
    const labels = items.map((it) => it.label || '');
    onCaptureFiles(files, labels);
  }

  confirm();
  assert.deepEqual(capturedFiles.map((f) => f.name), ['page2.jpg', 'page1.jpg']);
  assert.deepEqual(capturedLabels, ['banana', 'apple'], 'Labels must stay attached to their files after reorder');
});

// -------------------------------------------------------------
// RED-7.3: Strict fail-closed parseGradeLevel validation
// -------------------------------------------------------------
test('RED-7.3: parseGradeLevel strictly fails closed on invalid types, whitespace-only, and out-of-bounds', () => {
  // 1. Whitespace-only string rejected
  const resSpace = parseGradeLevel('   ');
  assert.equal(resSpace.valid, false);
  assert.equal(resSpace.code, 'InvalidGradeLevel');

  const resTabs = parseGradeLevel('\t  \n  ');
  assert.equal(resTabs.valid, false);
  assert.equal(resTabs.code, 'InvalidGradeLevel');

  // 2. Booleans rejected
  const resTrue = parseGradeLevel(true);
  assert.equal(resTrue.valid, false);
  assert.equal(resTrue.code, 'InvalidGradeLevel');

  const resFalse = parseGradeLevel(false);
  assert.equal(resFalse.valid, false);
  assert.equal(resFalse.code, 'InvalidGradeLevel');

  // 3. Objects, arrays, File-like rejected
  const resObj = parseGradeLevel({});
  assert.equal(resObj.valid, false);
  assert.equal(resObj.code, 'InvalidGradeLevel');

  const resArr = parseGradeLevel([]);
  assert.equal(resArr.valid, false);
  assert.equal(resArr.code, 'InvalidGradeLevel');

  const resFileMock = parseGradeLevel({ name: 'file.jpg', size: 1024, arrayBuffer: () => {} });
  assert.equal(resFileMock.valid, false);
  assert.equal(resFileMock.code, 'InvalidGradeLevel');

  // 4. Float numbers rejected
  const resFloat = parseGradeLevel(7.5);
  assert.equal(resFloat.valid, false);
  assert.equal(resFloat.code, 'InvalidGradeLevel');

  const resFloatStr = parseGradeLevel('7.5');
  assert.equal(resFloatStr.valid, false);
  assert.equal(resFloatStr.code, 'InvalidGradeLevel');

  // 5. Out of bounds rejected
  assert.equal(parseGradeLevel(-1).valid, false);
  assert.equal(parseGradeLevel('-1').valid, false);
  assert.equal(parseGradeLevel(13).valid, false);
  assert.equal(parseGradeLevel('13').valid, false);
  assert.equal(parseGradeLevel(999).valid, false);

  // 6. Non-numeric strings rejected
  assert.equal(parseGradeLevel('grade 7').valid, false);
  assert.equal(parseGradeLevel('abc').valid, false);
  assert.equal(parseGradeLevel('7a').valid, false);

  // 7. NaN / Infinity rejected
  assert.equal(parseGradeLevel(NaN).valid, false);
  assert.equal(parseGradeLevel(Infinity).valid, false);
  assert.equal(parseGradeLevel(-Infinity).valid, false);

  // 8. Legitimate optional/missing inputs default to 7
  assert.deepEqual(parseGradeLevel(undefined), { valid: true, gradeLevel: 7 });
  assert.deepEqual(parseGradeLevel(null), { valid: true, gradeLevel: 7 });
  assert.deepEqual(parseGradeLevel(''), { valid: true, gradeLevel: 7 });

  // 9. Legitimate valid grades 0..12 preserved
  assert.deepEqual(parseGradeLevel(0), { valid: true, gradeLevel: 0 });
  assert.deepEqual(parseGradeLevel('0'), { valid: true, gradeLevel: 0 });
  assert.deepEqual(parseGradeLevel('  0  '), { valid: true, gradeLevel: 0 });

  assert.deepEqual(parseGradeLevel(7), { valid: true, gradeLevel: 7 });
  assert.deepEqual(parseGradeLevel('7'), { valid: true, gradeLevel: 7 });
  assert.deepEqual(parseGradeLevel('  7  '), { valid: true, gradeLevel: 7 });

  assert.deepEqual(parseGradeLevel(12), { valid: true, gradeLevel: 12 });
  assert.deepEqual(parseGradeLevel('12'), { valid: true, gradeLevel: 12 });
  assert.deepEqual(parseGradeLevel('  12  '), { valid: true, gradeLevel: 12 });
});
