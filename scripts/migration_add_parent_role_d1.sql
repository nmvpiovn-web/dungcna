-- ================================================================
-- MIGRATION: UNIQUE indexes + class_enrollments + role constraints
-- Database: tienganh-pro-db (a0d2d5f7-b4ae-48a3-99d6-ecac7ed87218)
-- Date: 2026-09-27
-- Pre-conditions:
--   - PRAGMA table_info(users) confirmed 12 columns
--   - 0 duplicate usernames, 0 duplicate phones
--   - No FK references from other tables to users
--   - No triggers on users table
-- ================================================================

-- PHASE 1: UNIQUE INDEXES ON USERS
-- =================================
-- Drop old non-unique indexes and create partial UNIQUE ones
-- (WHERE ... IS NOT NULL allows multiple NULLs, which is correct
-- since not all users have username or phone)

DROP INDEX IF EXISTS idx_users_username;
DROP INDEX IF EXISTS idx_users_phone;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_unique 
  ON users(username) WHERE username IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_unique 
  ON users(phone) WHERE phone IS NOT NULL;

-- Verify: PRAGMA index_list(users) should show both with unique=1

-- PHASE 2: CLASS ENROLLMENTS TABLE
-- ==================================
-- Structured membership table replaces LIKE metadata queries.
-- UNIQUE(user_id, class_id) prevents duplicate enrollment.

CREATE TABLE IF NOT EXISTS class_enrollments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  class_id TEXT NOT NULL,
  enrolled_at TEXT DEFAULT CURRENT_TIMESTAMP,
  status TEXT DEFAULT 'active',
  UNIQUE(user_id, class_id)
);

CREATE INDEX IF NOT EXISTS idx_class_enrollments_class 
  ON class_enrollments(class_id, status);

CREATE INDEX IF NOT EXISTS idx_class_enrollments_user 
  ON class_enrollments(user_id, status);

-- PHASE 3: BACKFILL class_enrollments FROM METADATA
-- ===================================================
-- Extract class_id from users.metadata JSON for existing students.
-- INSERT OR IGNORE prevents duplicates on re-run.

INSERT OR IGNORE INTO class_enrollments (id, user_id, class_id)
  SELECT 'ce_' || id || '_' || json_extract(metadata, '$.class_id'),
         id,
         json_extract(metadata, '$.class_id')
  FROM users
  WHERE role = 'student'
    AND metadata IS NOT NULL
    AND json_valid(metadata)
    AND json_extract(metadata, '$.class_id') IS NOT NULL;

-- PHASE 4: ADD 'leader' TO role CHECK (if users table was recreated)
-- ===================================================================
-- NOTE: SQLite does not support ALTER TABLE ... ADD CONSTRAINT.
-- The current production users table has:
--   CHECK(role IN ('superadmin', 'teacher', 'student', 'parent'))
-- Adding 'leader' requires table rebuild. Since this is destructive,
-- we handle it at application level (register rejects invalid roles).
-- The CHECK constraint will be updated when users table is next rebuilt.

-- PHASE 5: ROLLBACK PLAN
-- ========================
-- If any step fails:
--   DROP INDEX IF EXISTS idx_users_username_unique;
--   DROP INDEX IF EXISTS idx_users_phone_unique;
--   CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
--   CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
--   DROP TABLE IF EXISTS class_enrollments;
-- No data is modified in users table, only indexes and new table.

-- ================================================================
-- VERIFICATION QUERIES (run after migration):
-- ================================================================
-- PRAGMA index_list(users);
--   → idx_users_username_unique (unique=1), idx_users_phone_unique (unique=1)
--
-- SELECT COUNT(*) FROM class_enrollments;
--   → Should match number of students with class_id in metadata
--
-- INSERT INTO users (id, email, name, role, username, password) 
--   VALUES ('test_dup', 'test@test.com', 'Test', 'student', '<existing_username>', 'pass');
--   → Should FAIL with UNIQUE constraint error
-- ================================================================
