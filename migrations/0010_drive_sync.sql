-- Migration 0010: Drive sync state + logs (issue #2 P1)
-- Các bảng này trước đây chỉ nằm trong docs, chưa có migration versioned

CREATE TABLE IF NOT EXISTS drive_sync_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_change_token TEXT,
  last_poll_at TEXT,
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS drive_sync_logs (
  id TEXT PRIMARY KEY,
  started_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  finished_at TEXT,
  direction TEXT DEFAULT 'drive_to_d1',
  folder_id TEXT,
  folder_name TEXT,
  files_scanned INTEGER DEFAULT 0,
  files_added INTEGER DEFAULT 0,
  files_updated INTEGER DEFAULT 0,
  files_skipped INTEGER DEFAULT 0,
  files_failed INTEGER DEFAULT 0,
  errors TEXT,
  triggered_by TEXT,
  status TEXT DEFAULT 'running'
);
CREATE INDEX IF NOT EXISTS idx_drive_sync_logs_started ON drive_sync_logs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_drive_sync_logs_status ON drive_sync_logs(status);

-- Audit log cho thao tác credential/sync toàn cục (issue #2 P1)
CREATE TABLE IF NOT EXISTS drive_credential_audit (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  actor_user_id TEXT,
  actor_username TEXT,
  detail TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_drive_credential_audit_created ON drive_credential_audit(created_at DESC);
