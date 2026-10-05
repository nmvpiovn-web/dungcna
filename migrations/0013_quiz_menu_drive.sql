ALTER TABLE quizzes ADD COLUMN source_metadata_json TEXT;
ALTER TABLE quizzes ADD COLUMN source_text_excerpt TEXT;

-- DOCX/Google Docs is the canonical lesson document. Quiz and homework point to
-- the same revision so the three surfaces cannot silently drift apart.
ALTER TABLE homework_assignments ADD COLUMN source_quiz_id TEXT REFERENCES quizzes(id) ON DELETE SET NULL;
ALTER TABLE homework_assignments ADD COLUMN source_google_doc_file_id TEXT;
ALTER TABLE homework_assignments ADD COLUMN source_docx_file_id TEXT;
ALTER TABLE homework_assignments ADD COLUMN source_content_revision INTEGER;
ALTER TABLE quiz_attempts ADD COLUMN deferred_question_ids_json TEXT;
ALTER TABLE quiz_attempts ADD COLUMN saved_for_later_at TEXT;

CREATE TABLE IF NOT EXISTS quiz_bundles (
  quiz_id TEXT PRIMARY KEY REFERENCES quizzes(id) ON DELETE CASCADE,
  google_doc_file_id TEXT,
  printable_docx_file_id TEXT,
  homework_assignment_id TEXT,
  homework_draft_json TEXT NOT NULL,
  canonical_source TEXT NOT NULL DEFAULT 'docx' CHECK(canonical_source IN ('docx')),
  revision INTEGER NOT NULL DEFAULT 1,
  quiz_checksum TEXT NOT NULL,
  google_doc_modified_time TEXT,
  sync_status TEXT NOT NULL DEFAULT 'pending' CHECK(sync_status IN ('pending','synced','conflict','error')),
  last_synced_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_quiz_bundles_homework ON quiz_bundles(homework_assignment_id);
CREATE INDEX IF NOT EXISTS idx_homework_source_quiz ON homework_assignments(source_quiz_id);
