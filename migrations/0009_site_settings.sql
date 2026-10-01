-- 0009_site_settings.sql — cai dat chung cua web (theme mau sac do admin chon)
-- API /api/site-theme tu tao bang neu chua co (CREATE TABLE IF NOT EXISTS),
-- migration nay chi de luu tru schema.
CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
