-- migrations/0008_gamification.sql
-- Academic Warmth Phase 4 (2026-09-30): persist gamification (streak/xp/badges).
-- LUU Y VAN HANH: migration nay KHONG duoc apply len production D1 trong dot nay.
-- Mọi code runtime doc/ghi bang nay DEU phai defensive (try/catch, khong bao gio 500
-- neu bang chua ton tai) — xem src/routes/api/gamification/+server.js.
CREATE TABLE IF NOT EXISTS gamification (
  user_id TEXT PRIMARY KEY,
  streak_days INTEGER DEFAULT 0,
  last_active_date TEXT,
  xp_total INTEGER DEFAULT 0,
  badges TEXT DEFAULT '[]',
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
