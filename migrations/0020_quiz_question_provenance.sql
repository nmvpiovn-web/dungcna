-- ============================================================================
-- MIGRATION 0020: ADD QUIZ QUESTION PROVENANCE (SOURCE_TYPE, SOURCE_ID)
-- Target: Cloudflare D1 / SQLite
-- Safe & Idempotent: Adds provenance metadata and deduplication index
-- ============================================================================

ALTER TABLE quiz_questions ADD COLUMN source_type TEXT;
ALTER TABLE quiz_questions ADD COLUMN source_id TEXT;

-- Enforce uniqueness of imported question origin per quiz to prevent duplicate insertions
CREATE UNIQUE INDEX IF NOT EXISTS idx_quiz_questions_quiz_source 
  ON quiz_questions(quiz_id, source_type, source_id) 
  WHERE source_type IS NOT NULL AND source_id IS NOT NULL;

-- Backfill provenance for existing public catalog questions with deterministic ID format qq_{quizId}_{bankId}
UPDATE quiz_questions 
SET source_type = 'question_bank', 
    source_id = SUBSTR(id, LENGTH(quiz_id) + 5) 
WHERE id LIKE 'qq_%' AND source_type IS NULL;
