CREATE TABLE IF NOT EXISTS users_new (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('superadmin', 'teacher', 'student', 'parent')),
  avatar TEXT,
  status TEXT DEFAULT 'active',
  metadata TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  username TEXT,
  phone TEXT,
  password TEXT
);

INSERT INTO users_new (id, email, name, role, avatar, status, metadata, created_at, updated_at, username, phone, password)
  SELECT id, email, name, role, avatar, status, metadata, created_at, updated_at, username, phone, password FROM users;

DROP TABLE users;

ALTER TABLE users_new RENAME TO users;

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
