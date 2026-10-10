-- ============================================================================
-- MIGRATION 0020: ADD QUIZ QUESTION PROVENANCE (SOURCE_TYPE, SOURCE_ID)
-- Target: Cloudflare D1 / SQLite
-- Note: One-shot ledger migration. ALTER TABLE ADD COLUMN is NOT idempotent
-- if executed directly a second time; rely on wrangler d1 migrations ledger.
-- ============================================================================

ALTER TABLE quiz_questions ADD COLUMN source_type TEXT;
ALTER TABLE quiz_questions ADD COLUMN source_id TEXT;

-- Enforce uniqueness of imported question origin per quiz to prevent duplicate insertions
CREATE UNIQUE INDEX IF NOT EXISTS idx_quiz_questions_quiz_source
  ON quiz_questions(quiz_id, source_type, source_id)
  WHERE source_type IS NOT NULL AND source_id IS NOT NULL;

-- Backfill provenance ONLY for the 156 public catalog questions seeded from question_bank
-- Strictly matches catalog quiz IDs and composite ID pattern qq_{quiz_id}_*
UPDATE quiz_questions
SET source_type = 'question_bank',
    source_id = SUBSTR(id, LENGTH(quiz_id) + 5)
WHERE (quiz_id LIKE 'quiz_pub_grade_%' OR quiz_id = 'quiz_pub_ielts')
  AND id LIKE ('qq_' || quiz_id || '_%')
  AND source_type IS NULL;
