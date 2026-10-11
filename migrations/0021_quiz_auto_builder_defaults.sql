-- ============================================================================
-- MIGRATION 0021: QUIZ AUTO BUILDER DEFAULTS & EXPANDED QUESTION TYPES
-- Target: Cloudflare D1 / SQLite
-- Note: One-shot ledger migration. Rebuilds quiz_questions to expand the
-- CHECK constraint to the 10 canonical types, creates quiz_question_sources
-- for many-to-one provenance tracking, and creates quiz_builder_defaults.
-- ============================================================================

CREATE TABLE IF NOT EXISTS quiz_builder_defaults (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL DEFAULT 'upload' CHECK(source_type IN ('upload', 'drive', 'question_bank', 'knowledge_vault')),
  question_count INTEGER NOT NULL DEFAULT 10 CHECK(question_count BETWEEN 1 AND 200),
  time_limit_minutes INTEGER NOT NULL DEFAULT 15 CHECK(time_limit_minutes BETWEEN 1 AND 180),
  grade_level INTEGER NOT NULL DEFAULT 7 CHECK(grade_level BETWEEN 0 AND 12),
  difficulty TEXT NOT NULL DEFAULT 'medium' CHECK(difficulty IN ('easy', 'medium', 'hard', 'nhan_biet', 'thong_hieu', 'van_dung', 'van_dung_cao')),
  type_mix_json TEXT NOT NULL DEFAULT '{}',
  default_status TEXT NOT NULL DEFAULT 'draft' CHECK(default_status IN ('draft', 'published')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_quiz_builder_defaults_user ON quiz_builder_defaults(user_id);

-- Rebuild quiz_questions to enforce exactly the 10 canonical types:
-- multiple_choice, fill_blank, matching, paragraph, picture_guess, rewrite,
-- true_false, word_guess, ordering, memory_match.
-- Any legacy 'essay' is normalized to 'paragraph'.
PRAGMA foreign_keys = OFF;

CREATE TABLE quiz_questions_new (
  id TEXT PRIMARY KEY,
  quiz_id TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('multiple_choice','fill_blank','matching','paragraph','picture_guess','rewrite','true_false','word_guess','ordering','memory_match')),
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

INSERT INTO quiz_questions_new (id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order, source_type, source_id)
  SELECT
    id,
    quiz_id,
    CASE WHEN type = 'essay' THEN 'paragraph' ELSE type END AS type,
    prompt,
    prompt_image_url,
    options_json,
    correct_answer,
    explanation,
    points,
    q_order,
    source_type,
    source_id
  FROM quiz_questions;

DROP TABLE quiz_questions;

ALTER TABLE quiz_questions_new RENAME TO quiz_questions;

CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz ON quiz_questions(quiz_id, q_order);

-- Question Bank deduplication: a specific bank question cannot be imported twice into same quiz
CREATE UNIQUE INDEX IF NOT EXISTS idx_quiz_questions_bank_unique
  ON quiz_questions(quiz_id, source_type, source_id)
  WHERE source_type = 'question_bank' AND source_id IS NOT NULL;

-- General lookup index for source provenance
CREATE INDEX IF NOT EXISTS idx_quiz_questions_source
  ON quiz_questions(quiz_id, source_type, source_id)
  WHERE source_type IS NOT NULL AND source_id IS NOT NULL;

-- Dedicated Many-to-One Question Sources Table for Full Traceability
CREATE TABLE IF NOT EXISTS quiz_question_sources (
  id TEXT PRIMARY KEY NOT NULL,
  quiz_id TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK(source_type IN ('question_bank', 'drive', 'upload', 'knowledge_vault')),
  source_id TEXT NOT NULL,
  source_sub_id TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_qq_sources_quiz ON quiz_question_sources(quiz_id);
CREATE INDEX IF NOT EXISTS idx_qq_sources_question ON quiz_question_sources(question_id);
CREATE INDEX IF NOT EXISTS idx_qq_sources_lookup ON quiz_question_sources(source_type, source_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_qq_sources_unique ON quiz_question_sources(quiz_id, question_id, source_type, source_id);

-- Backfill existing questions into quiz_question_sources
INSERT OR IGNORE INTO quiz_question_sources (id, quiz_id, question_id, source_type, source_id)
  SELECT 'qqs_' || id, quiz_id, id, source_type, source_id
  FROM quiz_questions
  WHERE source_type IS NOT NULL AND source_id IS NOT NULL;

PRAGMA foreign_keys = ON;
