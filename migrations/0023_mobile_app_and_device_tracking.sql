-- Migration 0023: Mobile App Attendance Flows & Real-time Device/Session Tracking (DOOGEE R10 / APK)

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

CREATE TABLE IF NOT EXISTS device_heartbeats (
  device_id TEXT PRIMARY KEY,
  session_id TEXT,
  user_id TEXT,
  username TEXT,
  user_role TEXT,
  device_model TEXT,
  app_mode TEXT,
  user_agent TEXT,
  ip_address TEXT,
  screen_size TEXT,
  current_path TEXT,
  is_android_apk INTEGER DEFAULT 0,
  first_seen_at TEXT DEFAULT CURRENT_TIMESTAMP,
  last_active_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_device_heartbeats_last_active
  ON device_heartbeats(last_active_at DESC);
CREATE INDEX IF NOT EXISTS idx_device_heartbeats_user
  ON device_heartbeats(user_id, last_active_at DESC);
