-- Student dashboard attendance, absence requests and reward idempotency.

CREATE TABLE IF NOT EXISTS student_absence_requests (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  session_date TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by TEXT,
  reviewed_at TEXT,
  review_note TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_student_absence_student ON student_absence_requests(student_id, session_date);
CREATE INDEX IF NOT EXISTS idx_student_absence_session ON student_absence_requests(session_id, status);

ALTER TABLE student_star_ledger ADD COLUMN idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_student_star_ledger_idempotency
  ON student_star_ledger(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_session_student_date
  ON attendance_records(session_id, student_id, session_date);

CREATE TABLE IF NOT EXISTS gamification_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  xp_delta INTEGER NOT NULL DEFAULT 0,
  activity_date TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, id)
);
CREATE INDEX IF NOT EXISTS idx_gamification_events_daily
  ON gamification_events(user_id, activity_date);
