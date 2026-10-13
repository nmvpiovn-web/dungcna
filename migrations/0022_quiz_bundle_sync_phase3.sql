-- Migration 0022: Quiz Bundle Sync Locks & Audit Events (Phase 3)
-- Safe, idempotent tables for distributed concurrency locking and audit trail.

CREATE TABLE IF NOT EXISTS quiz_bundle_sync_locks (
  quiz_id TEXT PRIMARY KEY REFERENCES quizzes(id) ON DELETE CASCADE,
  lock_token TEXT NOT NULL,
  locked_by TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_quiz_bundle_locks_expiry ON quiz_bundle_sync_locks(expires_at);

CREATE TABLE IF NOT EXISTS quiz_bundle_sync_events (
  id TEXT PRIMARY KEY,
  quiz_id TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('started', 'succeeded', 'conflict', 'failed', 'cleanup_warning')),
  direction TEXT CHECK(direction IN ('publish_quiz_to_docs', 'import_docs_to_quiz', 'publish_homework') OR direction IS NULL),
  resolution TEXT CHECK(resolution IN ('keep_quiz', 'keep_docs', 'none') OR resolution IS NULL),
  from_revision INTEGER,
  to_revision INTEGER,
  error_code TEXT,
  error_message TEXT,
  details_json TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_quiz_bundle_events_quiz ON quiz_bundle_sync_events(quiz_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quiz_bundle_events_actor ON quiz_bundle_sync_events(actor_id, created_at DESC);
