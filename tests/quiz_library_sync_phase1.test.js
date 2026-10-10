import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import {
  normalizeBankOptions,
  determineCorrectAnswer,
  formatQuestionPrompt,
  mapBankQuestionToQuizQuestion,
  safePublicBankQuestion
} from '../src/lib/server/quizBankBridge.js';
import { publicQuestion, gradeAnswers } from '../src/lib/server/quizMenu.js';

describe('PHASE 1: QUIZ LIBRARY SYNC & MIGRATION TEST SUITE', () => {
  let db;

  before(() => {
    db = new DatabaseSync(':memory:');
  });

  describe('Part A: FTS5 Migration 0018 Repair & Idempotency', () => {
    test('FTS-01: Baseline fixture: 5670 vault rows, 102 indexed FTS rows, 0 triggers', () => {
      // 1. Create knowledge_vault base table
      db.exec(`
        CREATE TABLE IF NOT EXISTS knowledge_vault (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          folder TEXT NOT NULL,
          category TEXT NOT NULL,
          tags TEXT,
          content_markdown TEXT,
          source_path TEXT,
          source_hash TEXT,
          status TEXT DEFAULT 'active',
          updated_at TEXT
        );
      `);

      // 2. Create knowledge_fts virtual table
      db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(
          id UNINDEXED,
          title,
          content_markdown,
          tags,
          folder,
          tokenize = 'unicode61'
        );
      `);

      // 3. Insert 5,670 mock notes into knowledge_vault
      const insertVault = db.prepare(`
        INSERT INTO knowledge_vault (id, title, folder, category, tags, content_markdown, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?);
      `);

      db.exec('BEGIN TRANSACTION;');
      for (let i = 1; i <= 5670; i++) {
        insertVault.run(
          `note_${i}`,
          `Lesson Note ${i}`,
          `Unit ${(i % 10) + 1}`,
          'Grammar',
          '["english","k12"]',
          `Detailed explanation of lesson ${i} with vocabulary and examples.`,
          '2026-10-10'
        );
      }
      db.exec('COMMIT;');

      // 4. Pre-index only 102 rows into knowledge_fts (matching production state)
      const insertFts = db.prepare(`
        INSERT INTO knowledge_fts (id, title, content_markdown, tags, folder)
        VALUES (?, ?, ?, ?, ?);
      `);

      db.exec('BEGIN TRANSACTION;');
      for (let i = 1; i <= 102; i++) {
        insertFts.run(
          `note_${i}`,
          `Lesson Note ${i}`,
          `Detailed explanation of lesson ${i} with vocabulary and examples.`,
          '["english","k12"]',
          `Unit ${(i % 10) + 1}`
        );
      }
      db.exec('COMMIT;');

      // Verify baseline counts
      const vaultCount = db.prepare('SELECT COUNT(*) AS count FROM knowledge_vault;').get().count;
      const ftsCount = db.prepare('SELECT COUNT(*) AS count FROM knowledge_fts;').get().count;
      const triggerCount = db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='trigger' AND tbl_name='knowledge_vault';").get().count;

      assert.strictEqual(vaultCount, 5670, 'Expected 5,670 vault rows');
      assert.strictEqual(ftsCount, 102, 'Expected 102 indexed rows initially');
      assert.strictEqual(triggerCount, 0, 'Expected 0 triggers on knowledge_vault initially');
    });

    test('FTS-02: Migration 0018 backfills all 5,568 missing rows and creates 3 triggers', () => {
      const migrationSql = fs.readFileSync('migrations/0018_knowledge_fts_triggers_backfill.sql', 'utf8');
      db.exec(migrationSql);

      const ftsCount = db.prepare('SELECT COUNT(*) AS count FROM knowledge_fts;').get().count;
      assert.strictEqual(ftsCount, 5670, 'Expected knowledge_fts to have all 5,670 rows backfilled');

      const triggers = db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name='knowledge_vault' ORDER BY name;").all();
      assert.strictEqual(triggers.length, 3, 'Expected 3 triggers created on knowledge_vault');
      const triggerNames = triggers.map((t) => t.name);
      assert.deepStrictEqual(triggerNames, ['trg_knowledge_vault_ad', 'trg_knowledge_vault_ai', 'trg_knowledge_vault_au']);
    });

    test('FTS-03: Triggers automatically synchronize INSERT, UPDATE, and DELETE', () => {
      // 1. Insert canary
      db.exec(`
        INSERT INTO knowledge_vault (id, title, folder, category, tags, content_markdown)
        VALUES ('canary_sync_1', 'Canary Present Perfect', 'Unit 5', 'Grammar', '["present_perfect"]', 'Have/Has + V3');
      `);
      const searchInsert = db.prepare("SELECT * FROM knowledge_fts WHERE knowledge_fts MATCH 'Canary';").all();
      assert.strictEqual(searchInsert.length, 1, 'Newly inserted row must be immediately searchable');
      assert.strictEqual(searchInsert[0].id, 'canary_sync_1');

      // 2. Update canary
      db.exec(`
        UPDATE knowledge_vault SET title = 'Updated Present Perfect Canary', content_markdown = 'Have/Has + Past Participle'
        WHERE id = 'canary_sync_1';
      `);
      const searchUpdate = db.prepare("SELECT * FROM knowledge_fts WHERE knowledge_fts MATCH 'Updated';").all();
      assert.strictEqual(searchUpdate.length, 1, 'Updated row must be immediately searchable');
      assert.strictEqual(searchUpdate[0].id, 'canary_sync_1');

      // 3. Delete canary
      db.exec("DELETE FROM knowledge_vault WHERE id = 'canary_sync_1';");
      const searchDelete = db.prepare("SELECT * FROM knowledge_fts WHERE id = 'canary_sync_1';").all();
      assert.strictEqual(searchDelete.length, 0, 'Deleted row must be removed from FTS');
    });

    test('FTS-04: Migration 0018 is strictly idempotent (safe to re-run)', () => {
      const migrationSql = fs.readFileSync('migrations/0018_knowledge_fts_triggers_backfill.sql', 'utf8');
      // Re-run migration
      db.exec(migrationSql);

      const ftsCount = db.prepare('SELECT COUNT(*) AS count FROM knowledge_fts;').get().count;
      assert.strictEqual(ftsCount, 5670, 'Re-running migration 0018 must not produce duplicate rows');

      const triggerCount = db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='trigger' AND tbl_name='knowledge_vault';").get().count;
      assert.strictEqual(triggerCount, 3, 'Re-running migration must maintain exactly 3 triggers');
    });

    test('FTS-05: NULL-id in knowledge_fts does NOT break backfill due to NOT EXISTS semantics', () => {
      const nullTestDb = new DatabaseSync(':memory:');
      nullTestDb.exec(`
        CREATE TABLE knowledge_vault (id TEXT PRIMARY KEY, title TEXT, folder TEXT, tags TEXT, content_markdown TEXT);
        CREATE VIRTUAL TABLE knowledge_fts USING fts5(id UNINDEXED, title, content_markdown, tags, folder);
      `);
      nullTestDb.exec(`
        INSERT INTO knowledge_vault VALUES ('v1', 'V1', 'f1', 't1', 'c1'), ('v2', 'V2', 'f2', 't2', 'c2');
        INSERT INTO knowledge_fts VALUES (NULL, 'Orphan Note', 'content with null id', 'tag', 'f');
      `);
      const migrationSql = fs.readFileSync('migrations/0018_knowledge_fts_triggers_backfill.sql', 'utf8');
      nullTestDb.exec(migrationSql);
      const count = nullTestDb.prepare("SELECT COUNT(*) count FROM knowledge_fts WHERE id IN ('v1', 'v2')").get().count;
      assert.strictEqual(count, 2, 'Both v1 and v2 must be backfilled even if an existing row has NULL id');
    });
  });

  describe('Part B: Question Bank Bridge Logic & Security', () => {
    test('BRIDGE-01: normalizeBankOptions handles array of strings, object array, and JSON strings', () => {
      // 1. Array of strings
      const arr = ['A. red', 'B. blue', 'C. green'];
      assert.deepStrictEqual(normalizeBankOptions(arr), arr);

      // 2. Array of objects {id, text}
      const objs = [
        { id: 'A', text: 'apple' },
        { id: 'B', text: 'banana' },
        { id: 'C', text: 'cherry' }
      ];
      assert.deepStrictEqual(normalizeBankOptions(objs), ['A. apple', 'B. banana', 'C. cherry']);

      // 3. JSON serialized string
      const jsonStr = JSON.stringify(objs);
      assert.deepStrictEqual(normalizeBankOptions(jsonStr), ['A. apple', 'B. banana', 'C. cherry']);
    });

    test('BRIDGE-02: determineCorrectAnswer correctly matches letter to option text', () => {
      const options = ['A. coach', 'B. care', 'C. decide', 'D. scared'];
      assert.strictEqual(determineCorrectAnswer(options, 'C'), 'C. decide');
      assert.strictEqual(determineCorrectAnswer(options, 'A'), 'A. coach');
      assert.strictEqual(determineCorrectAnswer(options, 'D'), 'D. scared');

      // Matching raw option text
      assert.strictEqual(determineCorrectAnswer(['apple', 'banana', 'orange'], 'banana'), 'banana');
    });

    test('BRIDGE-03: mapBankQuestionToQuizQuestion produces deterministic ID, format, and source provenance', () => {
      const bankRow = {
        id: 'qb_test_42',
        grade_level: 'lop_7',
        question_text: 'Choose the correct word: She _____ to school every day.',
        options_json: JSON.stringify([
          { id: 'A', text: 'goes' },
          { id: 'B', text: 'go' },
          { id: 'C', text: 'going' },
          { id: 'D', text: 'went' }
        ]),
        correct_option_id: 'A',
        explanation: 'Subject "She" is third-person singular -> goes.',
        reading_passage: 'Every morning, students wake up early...'
      };

      const quizId = 'quiz_mock_123';
      const mapped = mapBankQuestionToQuizQuestion(bankRow, quizId, 0);

      assert.strictEqual(mapped.id, 'qq_quiz_mock_123_qb_test_42');
      assert.strictEqual(mapped.quiz_id, quizId);
      assert.strictEqual(mapped.type, 'multiple_choice');
      assert.strictEqual(mapped.correct_answer, 'A. goes');
      assert.strictEqual(mapped.points, 1.0);
      assert.strictEqual(mapped.source_id, 'qb_test_42');
      assert.strictEqual(mapped.source_type, 'question_bank');
      assert.match(mapped.prompt, /\[Đoạn văn đọc\]/);
      assert.match(mapped.prompt, /She _____ to school/);
      assert.deepStrictEqual(JSON.parse(mapped.options_json), ['A. goes', 'B. go', 'C. going', 'D. went']);
    });

    test('BRIDGE-04: safePublicBankQuestion guarantees NO answer leakage for client search', () => {
      const bankRow = {
        id: 'qb_1',
        grade_level: 'lop_7',
        question_text: 'What is the capital of Vietnam?',
        options_json: '["A. Hanoi","B. Hue","C. Danang","D. HCM"]',
        correct_option_id: 'A',
        explanation: 'Hanoi is the political capital.',
        status: 'published'
      };

      const safe = safePublicBankQuestion(bankRow);
      assert.strictEqual(safe.id, 'qb_1');
      assert.strictEqual(safe.prompt, 'What is the capital of Vietnam?');
      assert.strictEqual('correct_answer' in safe, false, 'Must NOT contain correct_answer');
      assert.strictEqual('correct_option_id' in safe, false, 'Must NOT contain correct_option_id');
      assert.strictEqual('explanation' in safe, false, 'Must NOT contain explanation');
    });
  });

  describe('Part C: Public Quiz Catalog Seed (Migration 0019)', () => {
    test('CATALOG-01: Migration 0019 creates tables and seeds 13 published quizzes covering Grades 1-12 + IELTS', () => {
      // 1. Create quizzes & quiz_questions schema
      db.exec(`
        CREATE TABLE IF NOT EXISTS quizzes (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          description TEXT,
          created_by TEXT NOT NULL,
          creator_name TEXT,
          source_file_id TEXT,
          source_file_name TEXT,
          time_limit_minutes INTEGER NOT NULL DEFAULT 30,
          status TEXT NOT NULL DEFAULT 'draft',
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
          updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        );

        CREATE TABLE IF NOT EXISTS quiz_questions (
          id TEXT PRIMARY KEY,
          quiz_id TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
          type TEXT NOT NULL,
          prompt TEXT NOT NULL,
          prompt_image_url TEXT,
          options_json TEXT,
          correct_answer TEXT,
          explanation TEXT,
          points REAL NOT NULL DEFAULT 1.0,
          q_order INTEGER NOT NULL DEFAULT 0
        );
      `);

      // 2. Apply migration 0019
      const seedSql = fs.readFileSync('migrations/0019_seed_public_quiz_catalog.sql', 'utf8');
      db.exec(seedSql);

      // Verify quizzes count
      const quizzes = db.prepare("SELECT id, title, time_limit_minutes, status FROM quizzes WHERE status = 'published' ORDER BY id;").all();
      assert.strictEqual(quizzes.length, 13, 'Expected exactly 13 published quizzes');

      const expectedQuizIds = [
        'quiz_pub_grade_1',
        'quiz_pub_grade_2',
        'quiz_pub_grade_3',
        'quiz_pub_grade_4',
        'quiz_pub_grade_5',
        'quiz_pub_grade_6',
        'quiz_pub_grade_7',
        'quiz_pub_grade_8',
        'quiz_pub_grade_9',
        'quiz_pub_grade_10',
        'quiz_pub_grade_11',
        'quiz_pub_grade_12',
        'quiz_pub_ielts'
      ];

      const actualQuizIds = quizzes.map((q) => q.id).sort();
      assert.deepStrictEqual(actualQuizIds, expectedQuizIds.sort(), 'All Grades 1-12 and IELTS must be seeded');

      // Verify each quiz has 10-15 valid questions
      for (const q of quizzes) {
        assert.ok(q.title.length > 5, `Quiz ${q.id} title is too short`);
        assert.ok(q.time_limit_minutes >= 10 && q.time_limit_minutes <= 60, `Quiz ${q.id} time limit invalid`);

        const questions = db.prepare('SELECT * FROM quiz_questions WHERE quiz_id = ? ORDER BY q_order;').all(q.id);
        assert.ok(questions.length >= 10 && questions.length <= 15, `Quiz ${q.id} has ${questions.length} questions (expected 10-15)`);

        for (const qq of questions) {
          assert.strictEqual(qq.type, 'multiple_choice');
          assert.ok(qq.prompt && qq.prompt.length > 3, `Question ${qq.id} has invalid prompt`);
          const opts = JSON.parse(qq.options_json);
          assert.ok(Array.isArray(opts) && opts.length >= 2, `Question ${qq.id} has invalid options`);
          assert.ok(qq.correct_answer && qq.correct_answer.length > 0, `Question ${qq.id} missing correct_answer`);
        }
      }
    });

    test('CATALOG-02: Migration 0019 is idempotent upon re-execution', () => {
      const seedSql = fs.readFileSync('migrations/0019_seed_public_quiz_catalog.sql', 'utf8');
      db.exec(seedSql);

      const quizCount = db.prepare('SELECT COUNT(*) AS count FROM quizzes;').get().count;
      assert.strictEqual(quizCount, 13, 'Re-running seed must not create duplicate quizzes');

      const questionCount = db.prepare('SELECT COUNT(*) AS count FROM quiz_questions;').get().count;
      assert.strictEqual(questionCount, 13 * 12, 'Re-running seed must not create duplicate questions');
    });

    test('CATALOG-03: Contract check - each of the 13 quizzes has 12 questions with balanced A,B,C,D distribution (2-4 each) and source traceability', () => {
      const quizzes = db.prepare('SELECT id, title FROM quizzes ORDER BY id;').all();
      assert.strictEqual(quizzes.length, 13, 'Expected 13 quizzes');

      for (const q of quizzes) {
        const questions = db.prepare('SELECT id, correct_answer FROM quiz_questions WHERE quiz_id = ? ORDER BY q_order;').all(q.id);
        assert.strictEqual(questions.length, 12, `Quiz ${q.id} must have exactly 12 questions`);

        const distribution = { A: 0, B: 0, C: 0, D: 0 };
        for (const item of questions) {
          const letter = item.correct_answer?.[0];
          assert.ok(['A', 'B', 'C', 'D'].includes(letter), `Invalid answer letter "${letter}" for question ${item.id}`);
          distribution[letter]++;

          // Traceability check: ID starts with qq_{quizId}_
          assert.match(item.id, new RegExp(`^qq_${q.id}_.+`), `Question ID ${item.id} must trace back to question_bank`);
        }

        // Contract: every option A, B, C, D must appear between 2 and 4 times
        for (const [letter, count] of Object.entries(distribution)) {
          assert.ok(
            count >= 2 && count <= 4,
            `Quiz ${q.id} option ${letter} appears ${count} times (must be between 2 and 4)`
          );
        }
      }
    });
  });

  describe('Part D: Public / Guest Protection & Answer Stripping', () => {
    test('SECURITY-01: publicQuestion strips correct_answer and explanation for non-staff guests', () => {
      const row = {
        id: 'qq_test_1',
        quiz_id: 'quiz_1',
        type: 'multiple_choice',
        prompt: 'Choose the correct answer',
        options_json: '["A. Yes", "B. No"]',
        correct_answer: 'A. Yes',
        explanation: 'Yes is correct because of rule X',
        points: 1,
        q_order: 0,
        source_type: 'question_bank',
        source_id: 'qb_123'
      };

      // Non-staff / guest view
      const guestView = publicQuestion(row, false);
      assert.strictEqual('correct_answer' in guestView, false, 'Guest view must NOT contain correct_answer');
      assert.strictEqual('explanation' in guestView, false, 'Guest view must NOT contain explanation');
      assert.strictEqual('source_type' in guestView, false, 'Guest view must NOT contain source_type');
      assert.strictEqual('source_id' in guestView, false, 'Guest view must NOT contain source_id');
      assert.deepStrictEqual(guestView.options, ['A. Yes', 'B. No']);

      // Staff / review view
      const staffView = publicQuestion(row, true);
      assert.strictEqual(staffView.correct_answer, 'A. Yes', 'Staff view includes correct_answer');
      assert.strictEqual(staffView.explanation, 'Yes is correct because of rule X', 'Staff view includes explanation');
      assert.strictEqual(staffView.source_type, 'question_bank', 'Staff view includes source_type');
      assert.strictEqual(staffView.source_id, 'qb_123', 'Staff view includes source_id');
    });

    test('SECURITY-02: gradeAnswers correctly evaluates submitted answers', () => {
      const questions = [
        { id: 'q1', type: 'multiple_choice', correct_answer: 'A. red', points: 1 },
        { id: 'q2', type: 'multiple_choice', correct_answer: 'B. blue', points: 1 }
      ];

      const submitted = {
        q1: 'A. red',
        q2: 'C. green'
      };

      const result = gradeAnswers(questions, submitted);
      assert.strictEqual(result.autoScore, 1);
      assert.strictEqual(result.maxScore, 2);
      assert.strictEqual(result.grading[0].correct, true);
      assert.strictEqual(result.grading[1].correct, false);
    });
  });

  describe('Part E: Migration 0020 Provenance & Deduplication Contract', () => {
    test('PROV-01: Migration 0020 adds source_type and source_id columns and backfills existing seed rows', () => {
      const migrationSql = fs.readFileSync('migrations/0020_quiz_question_provenance.sql', 'utf8');
      db.exec(migrationSql);

      const sample = db.prepare("SELECT id, quiz_id, source_type, source_id FROM quiz_questions WHERE id LIKE 'qq_%' LIMIT 5;").all();
      assert.strictEqual(sample.length, 5);
      for (const row of sample) {
        assert.strictEqual(row.source_type, 'question_bank', 'Backfilled source_type must be question_bank');
        assert.ok(row.source_id && row.source_id.length > 0, `Backfilled source_id "${row.source_id}" must not be empty`);
      }

      // Check no seed questions have null source_type or source_id
      const nullCount = db.prepare("SELECT COUNT(*) count FROM quiz_questions WHERE id LIKE 'qq_%' AND (source_type IS NULL OR source_id IS NULL);").get().count;
      assert.strictEqual(nullCount, 0, 'All catalog questions must have non-null provenance');
    });

    test('PROV-02: Unique index enforces deduplication on (quiz_id, source_type, source_id)', () => {
      // Trying to insert another row with the same quiz_id, source_type, and source_id must fail
      const firstRow = db.prepare("SELECT * FROM quiz_questions WHERE quiz_id = 'quiz_pub_grade_1' LIMIT 1;").get();

      assert.throws(() => {
        db.prepare(`
          INSERT INTO quiz_questions (id, quiz_id, type, prompt, options_json, correct_answer, points, q_order, source_type, source_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        `).run(
          'qq_duplicate_test',
          firstRow.quiz_id,
          'multiple_choice',
          'Duplicate test question',
          '["A","B"]',
          'A',
          1,
          99,
          firstRow.source_type,
          firstRow.source_id
        );
      }, /UNIQUE constraint failed/, 'Duplicate (quiz_id, source_type, source_id) must be rejected by unique index');
    });
  });
});
