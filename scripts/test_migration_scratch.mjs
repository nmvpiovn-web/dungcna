import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';

const db = new DatabaseSync(':memory:');
db.exec(fs.readFileSync('migrations/0012_quiz_menu.sql', 'utf8'));
db.exec(fs.readFileSync('migrations/0020_quiz_question_provenance.sql', 'utf8'));

db.exec("INSERT INTO quizzes (id, title, created_by) VALUES ('q1', 'test', 'u1')");
db.exec("INSERT INTO quiz_questions (id, quiz_id, type, prompt) VALUES ('qq1', 'q1', 'multiple_choice', 'test')");

const migrationSql = `
PRAGMA foreign_keys = OFF;
CREATE TABLE quiz_questions_new (
  id TEXT PRIMARY KEY,
  quiz_id TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('multiple_choice','fill_blank','matching','paragraph','picture_guess','rewrite','true_false','word_guess','ordering','memory_match','essay')),
  prompt TEXT NOT NULL,
  prompt_image_url TEXT,
  options_json TEXT,
  correct_answer TEXT,
  explanation TEXT,
  points REAL NOT NULL DEFAULT 1.0 CHECK(points >= 0 AND points <= 100),
  q_order INTEGER NOT NULL DEFAULT 0,
  source_type TEXT,
  source_id TEXT
);
INSERT INTO quiz_questions_new SELECT id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order, source_type, source_id FROM quiz_questions;
DROP TABLE quiz_questions;
ALTER TABLE quiz_questions_new RENAME TO quiz_questions;
CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz ON quiz_questions(quiz_id, q_order);
CREATE UNIQUE INDEX IF NOT EXISTS idx_quiz_questions_quiz_source ON quiz_questions(quiz_id, source_type, source_id) WHERE source_type IS NOT NULL AND source_id IS NOT NULL;
PRAGMA foreign_keys = ON;
`;

db.exec(migrationSql);
db.exec("INSERT INTO quiz_questions (id, quiz_id, type, prompt) VALUES ('qq2', 'q1', 'true_false', 'Is it true?')");
console.log('Success! Count:', db.prepare('SELECT count(*) as c FROM quiz_questions').get());
