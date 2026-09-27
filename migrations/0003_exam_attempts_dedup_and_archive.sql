-- ============================================================================
-- MIGRATION 0003: EXAM ATTEMPTS DEDUPLICATION & HISTORICAL ARCHIVING
-- Target: Cloudflare D1 / SQLite
-- Purpose: Safely migrate pre-existing databases with duplicate attempts
--          without losing historical attempt data before applying UNIQUE index.
-- Idempotent: Can be run multiple times safely.
-- ============================================================================

-- 1. Create Archive Table to preserve ALL historical attempts without loss
CREATE TABLE IF NOT EXISTS exam_attempts_archive (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_name TEXT,
  user_email TEXT,
  exam_id TEXT NOT NULL,
  exam_title TEXT,
  score REAL NOT NULL,
  max_score REAL NOT NULL,
  answers_json TEXT NOT NULL,
  duration_seconds INTEGER DEFAULT 0,
  session_id TEXT,
  class_id TEXT,
  created_at DATETIME,
  archived_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  archive_reason TEXT DEFAULT 'pre_unique_migration_duplicate'
);

-- 2. Create Server-Owned Exam Sessions Table for Full Exam Lifecycle
CREATE TABLE IF NOT EXISTS exam_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  exam_id TEXT NOT NULL,
  attempt_number INTEGER DEFAULT 1,
  questions_snapshot_json TEXT NOT NULL,
  time_limit_minutes INTEGER NOT NULL,
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deadline_at DATETIME NOT NULL,
  submitted_at DATETIME,
  status TEXT DEFAULT 'in_progress', -- 'in_progress', 'submitted', 'expired'
  score REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. Archive duplicate attempts that share the same (user_id, exam_id)
-- Keeps the most recent attempt in exam_attempts; older attempts move to archive.
INSERT OR IGNORE INTO exam_attempts_archive (
  id, user_id, user_name, user_email, exam_id, exam_title,
  score, max_score, answers_json, duration_seconds, session_id, class_id, created_at, archive_reason
)
SELECT a.id, a.user_id, a.user_name, a.user_email, a.exam_id, a.exam_title,
       a.score, a.max_score, a.answers_json, a.duration_seconds, a.session_id, a.class_id, a.created_at,
       'duplicate_prior_attempt'
FROM exam_attempts a
WHERE a.id NOT IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY user_id, exam_id
      ORDER BY datetime(created_at) DESC, rowid DESC
    ) as rn
    FROM exam_attempts
  ) WHERE rn = 1
);

-- 4. Delete the archived older duplicates from exam_attempts so UNIQUE index will succeed
DELETE FROM exam_attempts
WHERE id IN (
  SELECT id FROM exam_attempts_archive
  WHERE archive_reason = 'duplicate_prior_attempt'
);

-- 5. Safe creation of UNIQUE index on deduplicated exam_attempts table
CREATE UNIQUE INDEX IF NOT EXISTS idx_exam_attempts_user_exam 
ON exam_attempts (user_id, exam_id);

-- 6. Index on sessions for fast lookup
CREATE INDEX IF NOT EXISTS idx_exam_sessions_user_exam 
ON exam_sessions (user_id, exam_id, status);
