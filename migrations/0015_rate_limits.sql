-- Migration 0015: D1-backed rate limiting (Kimi live-audit 2026-10-06, round 3)
-- Per-isolate in-memory Maps do NOT stop brute force on Cloudflare Workers
-- (requests spread across isolates; no isolate ever reaches the threshold).
-- Shared D1 state fixes it: one write per attempt.
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  window_start INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_rate_limits_window_start ON rate_limits(window_start);
