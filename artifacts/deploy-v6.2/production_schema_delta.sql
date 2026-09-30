-- V6.2 production-only delta for the live D1 schema inspected on 2026-09-30.
-- Recovery bookmark before this change:
-- 00000073-00000000-000050f6-fa25d3f6a288f762ba0b94ee3d7e9c32

ALTER TABLE users ADD COLUMN profile_version INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME,
  revoked_at DATETIME,
  last_active_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT,
  actor_role TEXT,
  action TEXT NOT NULL,
  details TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tuition_transactions (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  bill_id TEXT,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed',
  gateway TEXT NOT NULL DEFAULT 'sepay',
  gateway_name TEXT DEFAULT 'sepay',
  gateway_transaction_id TEXT,
  reference_code TEXT,
  transfer_content TEXT,
  payer_name TEXT,
  payer_account TEXT,
  raw_payload TEXT,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tuition_transactions_gateway
  ON tuition_transactions(gateway_transaction_id);

CREATE TABLE IF NOT EXISTS parent_test_records (
  id TEXT PRIMARY KEY,
  parent_user_id TEXT NOT NULL,
  student_user_id TEXT NOT NULL,
  test_name TEXT NOT NULL,
  test_type TEXT NOT NULL DEFAULT 'standard_45m',
  score REAL NOT NULL,
  max_score REAL NOT NULL DEFAULT 10,
  test_date TEXT NOT NULL,
  teacher_feedback TEXT,
  image_url TEXT,
  source TEXT NOT NULL DEFAULT 'parent_manual',
  status TEXT NOT NULL DEFAULT 'unverified',
  version INTEGER NOT NULL DEFAULT 1,
  idempotency_key TEXT,
  payload_hash TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_parent_test_records_child
  ON parent_test_records(parent_user_id, student_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_parent_test_records_idem
  ON parent_test_records(parent_user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE question_bank ADD COLUMN skill_category TEXT NOT NULL DEFAULT 'grammar';
UPDATE question_bank
SET skill_category = CASE
  WHEN lower(topic) LIKE '%phonic%' OR lower(topic) LIKE '%stress%' OR lower(topic) LIKE '%pronun%' THEN 'phonics'
  WHEN lower(topic) LIKE '%read%' THEN 'reading'
  WHEN lower(topic) LIKE '%vocab%' OR lower(topic) LIKE '%lexic%' THEN 'vocabulary'
  ELSE 'grammar'
END;
CREATE INDEX IF NOT EXISTS idx_question_bank_skill
  ON question_bank(grade_level, cognitive_level, skill_category);
