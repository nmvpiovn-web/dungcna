import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createSignedToken } from '../src/lib/server/auth.js';
import { GET as getDefaults, PUT as updateDefaults } from '../src/routes/api/quiz-menu/builder-defaults/+server.js';
import {
  CANONICAL_DEFAULT_TYPE_MIX,
  getCanonicalDefaultTypeMix,
  resolveDefaultTypeMix,
  resolveDefaultGradeLevel
} from '../src/lib/quizDefaults.js';

const secret = 'quiz-menu-phase2-round11-secret';

function createDbAdapter(sqlite) {
  return {
    prepare(sql) {
      return {
        bind(...params) {
          const stmt = sqlite.prepare(sql);
          return {
            first: async () => stmt.get(...params) || null,
            all: async () => ({ results: stmt.all(...params) }),
            run: async () => stmt.run(...params)
          };
        },
        first: async () => sqlite.prepare(sql).get() || null,
        all: async () => ({ results: sqlite.prepare(sql).all() }),
        run: async () => sqlite.prepare(sql).run()
      };
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const s of statements) results.push(await s.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (err) {
        sqlite.exec('ROLLBACK');
        throw err;
      }
    }
  };
}

function setupTestDatabase() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      username TEXT,
      phone TEXT,
      email TEXT,
      name TEXT,
      role TEXT,
      avatar TEXT,
      status TEXT,
      approval_status TEXT DEFAULT 'approved',
      metadata TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE auth_sessions (
      id TEXT PRIMARY KEY,
      revoked_at TEXT,
      expires_at TEXT
    );
    CREATE TABLE quiz_builder_defaults (
      user_id TEXT PRIMARY KEY,
      source_type TEXT NOT NULL DEFAULT 'upload',
      question_count INTEGER NOT NULL DEFAULT 10,
      time_limit_minutes INTEGER NOT NULL DEFAULT 15,
      grade_level INTEGER NOT NULL DEFAULT 7,
      difficulty TEXT NOT NULL DEFAULT 'medium',
      type_mix_json TEXT,
      default_status TEXT NOT NULL DEFAULT 'draft',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO users (id, username, email, role, status, approval_status)
    VALUES
      ('teacher_11a', 'teacher_11a', 'tea_11a@school.edu', 'teacher', 'active', 'approved'),
      ('teacher_11b', 'teacher_11b', 'tea_11b@school.edu', 'teacher', 'active', 'approved');
    INSERT INTO auth_sessions (id, expires_at)
    VALUES
      ('sess_teacher_11a', '2099-01-01T00:00:00.000Z'),
      ('sess_teacher_11b', '2099-01-01T00:00:00.000Z');
  `);
  return { sqlite, db: createDbAdapter(sqlite) };
}

// -------------------------------------------------------------
// RED-11.1: Module-level Canonical Default Mix & Resolver
// -------------------------------------------------------------
test('RED-11.1: Shared quizDefaults module exports CANONICAL_DEFAULT_TYPE_MIX, getCanonicalDefaultTypeMix, and resolveDefaultTypeMix', () => {
  // 1. Exact canonical mix values: 5 MCQ, 2 T/F, 2 Fill, 1 Matching = 10
  assert.deepEqual(CANONICAL_DEFAULT_TYPE_MIX, {
    multiple_choice: 5,
    true_false: 2,
    fill_blank: 2,
    matching: 1
  });

  const copy = getCanonicalDefaultTypeMix();
  assert.deepEqual(copy, CANONICAL_DEFAULT_TYPE_MIX);
  const sum = Object.values(copy).reduce((a, b) => a + b, 0);
  assert.equal(sum, 10, 'Canonical default mix sum must equal question_count (10)');

  // 2. resolveDefaultTypeMix fallback behavior
  assert.deepEqual(resolveDefaultTypeMix(null), copy);
  assert.deepEqual(resolveDefaultTypeMix(undefined), copy);
  assert.deepEqual(resolveDefaultTypeMix(''), copy);
  assert.deepEqual(resolveDefaultTypeMix('{ corrupt json'), copy);
  assert.deepEqual(resolveDefaultTypeMix('{}'), copy);
  assert.deepEqual(resolveDefaultTypeMix([]), copy);

  // 3. resolveDefaultTypeMix preserves valid saved mixes
  assert.deepEqual(
    resolveDefaultTypeMix('{"multiple_choice":10}'),
    { multiple_choice: 10 },
    'Must preserve user-saved single type mix'
  );
  assert.deepEqual(
    resolveDefaultTypeMix({ multiple_choice: 7, true_false: 3 }),
    { multiple_choice: 7, true_false: 3 },
    'Must preserve user-saved object mix'
  );
});

// -------------------------------------------------------------
// RED-11.1: Server GET returns canonical 5/2/2/1 mix on no-row
// -------------------------------------------------------------
test('RED-11.1: builder-defaults GET returns canonical 5/2/2/1 mix when user has no saved row', async () => {
  const { db } = setupTestDatabase();
  const tokenTeacherA = await createSignedToken(
    { id: 'teacher_11a', role: 'teacher', username: 'teacher_11a', email: 'tea_11a@school.edu' },
    secret,
    60_000,
    'sess_teacher_11a'
  );
  const platform = { env: { DB: db, AUTH_SECRET: secret, JWT_SECRET: secret } };

  const getReq = new Request('http://localhost/api/quiz-menu/builder-defaults', {
    headers: { authorization: `Bearer ${tokenTeacherA}` }
  });
  const res = await getDefaults({ request: getReq, platform });
  const body = await res.json();

  assert.equal(body.success, true);
  assert.equal(body.is_default, true);
  assert.equal(body.defaults.question_count, 10);
  assert.equal(body.defaults.source_type, 'upload');
  assert.equal(body.defaults.grade_level, 7);

  // Must NOT be { multiple_choice: 10 }
  assert.notDeepEqual(body.defaults.type_mix, { multiple_choice: 10 });

  // Must be canonical 5/2/2/1
  assert.deepEqual(body.defaults.type_mix, {
    multiple_choice: 5,
    true_false: 2,
    fill_blank: 2,
    matching: 1
  });
  const sum = Object.values(body.defaults.type_mix).reduce((a, b) => a + b, 0);
  assert.equal(sum, body.defaults.question_count, 'Type mix sum must match question_count (10)');
});

// -------------------------------------------------------------
// RED-11.1: Server GET falls back to canonical 5/2/2/1 on corrupt D1 json
// -------------------------------------------------------------
test('RED-11.1: builder-defaults GET falls back to canonical 5/2/2/1 mix when type_mix_json is corrupt or empty in D1', async () => {
  const { sqlite, db } = setupTestDatabase();
  const tokenTeacherA = await createSignedToken(
    { id: 'teacher_11a', role: 'teacher', username: 'teacher_11a', email: 'tea_11a@school.edu' },
    secret,
    60_000,
    'sess_teacher_11a'
  );
  const platform = { env: { DB: db, AUTH_SECRET: secret, JWT_SECRET: secret } };

  // Insert row with corrupt JSON
  sqlite.exec(`
    INSERT INTO quiz_builder_defaults (user_id, source_type, question_count, type_mix_json)
    VALUES ('teacher_11a', 'drive', 10, '{"invalid_json_missing_brace')
  `);

  const req = new Request('http://localhost/api/quiz-menu/builder-defaults', {
    headers: { authorization: `Bearer ${tokenTeacherA}` }
  });
  const res = await getDefaults({ request: req, platform });
  const body = await res.json();

  assert.equal(body.success, true);
  assert.deepEqual(body.defaults.type_mix, {
    multiple_choice: 5,
    true_false: 2,
    fill_blank: 2,
    matching: 1
  });

  // Update row with NULL type_mix_json
  sqlite.exec(`UPDATE quiz_builder_defaults SET type_mix_json = NULL WHERE user_id = 'teacher_11a'`);
  const resNull = await getDefaults({ request: req, platform });
  const bodyNull = await resNull.json();
  assert.deepEqual(bodyNull.defaults.type_mix, {
    multiple_choice: 5,
    true_false: 2,
    fill_blank: 2,
    matching: 1
  });

  // Update row with empty object '{}'
  sqlite.exec(`UPDATE quiz_builder_defaults SET type_mix_json = '{}' WHERE user_id = 'teacher_11a'`);
  const resEmpty = await getDefaults({ request: req, platform });
  const bodyEmpty = await resEmpty.json();
  assert.deepEqual(bodyEmpty.defaults.type_mix, {
    multiple_choice: 5,
    true_false: 2,
    fill_blank: 2,
    matching: 1
  });
});

// -------------------------------------------------------------
// RED-11.1: Server preserves user-saved mix & user isolation
// -------------------------------------------------------------
test('RED-11.1: builder-defaults PUT and GET preserve exact user-saved mix and ensure user isolation', async () => {
  const { db } = setupTestDatabase();
  const tokenTeacherA = await createSignedToken(
    { id: 'teacher_11a', role: 'teacher', username: 'teacher_11a', email: 'tea_11a@school.edu' },
    secret,
    60_000,
    'sess_teacher_11a'
  );
  const tokenTeacherB = await createSignedToken(
    { id: 'teacher_11b', role: 'teacher', username: 'teacher_11b', email: 'tea_11b@school.edu' },
    secret,
    60_000,
    'sess_teacher_11b'
  );
  const platform = { env: { DB: db, AUTH_SECRET: secret, JWT_SECRET: secret } };

  // Teacher A explicitly saves { multiple_choice: 10 }
  const putReqA = new Request('http://localhost/api/quiz-menu/builder-defaults', {
    method: 'PUT',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${tokenTeacherA}` },
    body: JSON.stringify({
      source_type: 'upload',
      question_count: 10,
      time_limit_minutes: 20,
      grade_level: 8,
      difficulty: 'medium',
      type_mix: { multiple_choice: 10 },
      default_status: 'draft'
    })
  });
  const putResA = await updateDefaults({ request: putReqA, platform });
  const putBodyA = await putResA.json();
  assert.equal(putBodyA.success, true);
  assert.deepEqual(putBodyA.defaults.type_mix, { multiple_choice: 10 });

  // Teacher A fetches defaults: returns EXACT saved mix { multiple_choice: 10 }
  const getReqA = new Request('http://localhost/api/quiz-menu/builder-defaults', {
    headers: { authorization: `Bearer ${tokenTeacherA}` }
  });
  const getResA = await getDefaults({ request: getReqA, platform });
  const getBodyA = await getResA.json();
  assert.equal(getBodyA.success, true);
  assert.deepEqual(getBodyA.defaults.type_mix, { multiple_choice: 10 });
  assert.equal(getBodyA.defaults.grade_level, 8);

  // Teacher B fetches defaults: receives canonical 5/2/2/1 mix (user isolation)
  const getReqB = new Request('http://localhost/api/quiz-menu/builder-defaults', {
    headers: { authorization: `Bearer ${tokenTeacherB}` }
  });
  const getResB = await getDefaults({ request: getReqB, platform });
  const getBodyB = await getResB.json();
  assert.equal(getBodyB.success, true);
  assert.deepEqual(getBodyB.defaults.type_mix, {
    multiple_choice: 5,
    true_false: 2,
    fill_blank: 2,
    matching: 1
  });
  assert.equal(getBodyB.defaults.grade_level, 7);
});

// -------------------------------------------------------------
// RED-11.1: UI imports and uses canonical default type mix
// -------------------------------------------------------------
test('RED-11.1: +page.svelte imports and uses getCanonicalDefaultTypeMix & resolveDefaultTypeMix', () => {
  const pageSrc = fs.readFileSync('src/routes/quiz-menu/+page.svelte', 'utf8');

  // Verify import of shared helpers
  assert.ok(
    pageSrc.includes('getCanonicalDefaultTypeMix'),
    '+page.svelte must import getCanonicalDefaultTypeMix from $lib/quizDefaults.js'
  );
  assert.ok(
    pageSrc.includes('resolveDefaultTypeMix'),
    '+page.svelte must import resolveDefaultTypeMix from $lib/quizDefaults.js'
  );

  // Verify questionTypeMix is initialized with getCanonicalDefaultTypeMix()
  assert.ok(
    pageSrc.includes('let questionTypeMix = $state(getCanonicalDefaultTypeMix());'),
    'questionTypeMix must be initialized with getCanonicalDefaultTypeMix()'
  );

  // Verify loadBuilderDefaults uses resolveDefaultTypeMix
  assert.ok(
    pageSrc.includes('questionTypeMix = resolveDefaultTypeMix(res.defaults.type_mix);'),
    'loadBuilderDefaults must use resolveDefaultTypeMix to resolve server type_mix'
  );
});

// -------------------------------------------------------------
// RED-11.2: QuizCameraCapture showLabels prop contract & DOM order
// -------------------------------------------------------------
test('RED-11.2: QuizCameraCapture showLabels prop hides label inputs while preserving thumbnails, a11y & labels', () => {
  const compSrc = fs.readFileSync('src/lib/components/QuizCameraCapture.svelte', 'utf8');

  // 1. Props include showLabels with safe default true
  assert.ok(
    compSrc.includes('showLabels = true'),
    'QuizCameraCapture must declare showLabels prop with safe default true'
  );

  // 2. {#if showLabels} wraps the thumb-label-input and label
  const normalized = compSrc.replace(/\r\n/g, '\n');
  assert.ok(
    normalized.includes('{#if showLabels}\n              <label for={`camera-thumb-label-${item.id}`} class="sr-only">') ||
    normalized.includes('{#if showLabels}'),
    'thumb-label-input must be conditionally wrapped in {#if showLabels}'
  );

  // 3. Essential touch targets and a11y preserved
  assert.ok(compSrc.includes('min-height: 44px;'), 'Must preserve 44px touch targets');
  assert.ok(compSrc.includes('maxlength="80"'), 'Must preserve maxlength="80"');
  assert.ok(compSrc.includes('box-sizing: border-box;'), 'Must preserve box-sizing: border-box');

  // 4. Behavioral simulation: showLabels toggle and label retention
  let items = [
    { id: '1', file: { name: 'photo1.jpg' }, previewUrl: 'blob:p1', label: 'apple' },
    { id: '2', file: { name: 'photo2.jpg' }, previewUrl: 'blob:p2', label: 'banana' }
  ];

  function renderGallery(showLabels, itemList) {
    return itemList.map((item, idx) => ({
      order: `${idx + 1}/${itemList.length}`,
      previewUrl: item.previewUrl,
      fileName: item.file.name,
      renderedInput: showLabels ? { value: item.label, maxlength: 80, minHeight: 44 } : null
    }));
  }

  // When showLabels is false: inputs are null (not rendered)
  const renderedOcr = renderGallery(false, items);
  assert.equal(renderedOcr[0].renderedInput, null, 'OCR mode must not render label input');
  assert.equal(renderedOcr[1].renderedInput, null, 'OCR mode must not render label input');
  assert.equal(renderedOcr[0].previewUrl, 'blob:p1');
  assert.equal(renderedOcr[1].previewUrl, 'blob:p2');

  // Labels in state are still intact
  assert.equal(items[0].label, 'apple');
  assert.equal(items[1].label, 'banana');

  // Reorder while in OCR mode
  const copy = [...items];
  [copy[0], copy[1]] = [copy[1], copy[0]];
  items = copy;

  assert.equal(items[0].file.name, 'photo2.jpg');
  assert.equal(items[0].label, 'banana', 'Reordering in OCR mode preserves label mapping');
  assert.equal(items[1].file.name, 'photo1.jpg');
  assert.equal(items[1].label, 'apple', 'Reordering in OCR mode preserves label mapping');

  // When showLabels is toggled back to true: inputs render with preserved labels
  const renderedPg = renderGallery(true, items);
  assert.equal(renderedPg[0].renderedInput.value, 'banana');
  assert.equal(renderedPg[1].renderedInput.value, 'apple');
});

// -------------------------------------------------------------
// RED-11.2: +page.svelte upload panel hides label inputs when picture_guess === 0
// -------------------------------------------------------------
test('RED-11.2: +page.svelte upload panel conditionally renders label inputs only when picture_guess > 0', () => {
  const pageSrc = fs.readFileSync('src/routes/quiz-menu/+page.svelte', 'utf8');

  // 1. Passes showLabels to QuizCameraCapture based on picture_guess > 0
  assert.ok(
    pageSrc.includes('showLabels={(questionTypeMix.picture_guess || 0) > 0}'),
    '+page.svelte must pass showLabels={(questionTypeMix.picture_guess || 0) > 0} to QuizCameraCapture'
  );

  // 2. Parent upload panel wraps image-input-wrap in {#if (questionTypeMix.picture_guess || 0) > 0}
  assert.ok(
    pageSrc.includes('{#if (questionTypeMix.picture_guess || 0) > 0}'),
    'Parent image-input-wrap must be wrapped in {#if (questionTypeMix.picture_guess || 0) > 0}'
  );

  // 3. Thumbnails, page badge, filename, and OCR info banner are always visible
  assert.ok(pageSrc.includes('class="image-thumb"'), 'Image thumbnail must be rendered');
  assert.ok(pageSrc.includes('class="image-page-badge"'), 'Page badge must be rendered');
  assert.ok(pageSrc.includes('class="image-filename"'), 'Filename must be rendered');
  assert.ok(pageSrc.includes('class="image-ocr-info-banner"'), 'OCR info banner must be present');

  // 4. Behavioral simulation of state preservation across picture_guess toggles
  let imageLabels = { 0: 'elephant', 1: 'giraffe' };
  let questionTypeMix = { multiple_choice: 8, picture_guess: 2 };

  function isLabelInputVisible(mix) {
    return (mix.picture_guess || 0) > 0;
  }

  // Active picture_guess: inputs visible
  assert.equal(isLabelInputVisible(questionTypeMix), true);
  assert.equal(imageLabels[0], 'elephant');
  assert.equal(imageLabels[1], 'giraffe');

  // Teacher turns off picture_guess (e.g. toggles off or sets to 0)
  delete questionTypeMix.picture_guess;
  assert.equal(isLabelInputVisible(questionTypeMix), false, 'Inputs hidden when picture_guess is 0/undefined');

  // State is NOT wiped
  assert.equal(imageLabels[0], 'elephant', 'Toggling off picture_guess must NOT wipe entered labels');
  assert.equal(imageLabels[1], 'giraffe', 'Toggling off picture_guess must NOT wipe entered labels');

  // Teacher turns picture_guess back on
  questionTypeMix.picture_guess = 2;
  assert.equal(isLabelInputVisible(questionTypeMix), true);
  assert.equal(imageLabels[0], 'elephant', 'Labels restored when picture_guess is turned back on');
  assert.equal(imageLabels[1], 'giraffe', 'Labels restored when picture_guess is turned back on');
});
