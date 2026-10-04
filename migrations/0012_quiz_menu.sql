PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS quizzes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  created_by TEXT NOT NULL,
  creator_name TEXT,
  source_file_id TEXT,
  source_file_name TEXT,
  time_limit_minutes INTEGER NOT NULL DEFAULT 30 CHECK(time_limit_minutes BETWEEN 1 AND 180),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'published', 'archived')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_quizzes_status ON quizzes(status);
CREATE INDEX IF NOT EXISTS idx_quizzes_created_by ON quizzes(created_by);

CREATE TABLE IF NOT EXISTS quiz_questions (
  id TEXT PRIMARY KEY,
  quiz_id TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('multiple_choice','fill_blank','matching','paragraph','picture_guess','rewrite')),
  prompt TEXT NOT NULL,
  prompt_image_url TEXT,
  options_json TEXT,
  correct_answer TEXT,
  explanation TEXT,
  points REAL NOT NULL DEFAULT 1.0 CHECK(points >= 0 AND points <= 100),
  q_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz ON quiz_questions(quiz_id, q_order);

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id TEXT PRIMARY KEY,
  quiz_id TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  user_id TEXT,
  guest_name TEXT,
  guest_token_hash TEXT,
  client_ip_hash TEXT NOT NULL,
  answers_json TEXT,
  auto_score REAL,
  final_score REAL,
  max_score REAL,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK(status IN ('in_progress','submitted','review_pending','graded','expired')),
  duration_seconds INTEGER,
  started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deadline_at TEXT NOT NULL,
  submitted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_quiz ON quiz_attempts(quiz_id, submitted_at);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_rate ON quiz_attempts(client_ip_hash, started_at);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user ON quiz_attempts(user_id, started_at);

CREATE TABLE IF NOT EXISTS quiz_reviews (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
  reviewer_id TEXT NOT NULL,
  reviewer_name TEXT,
  feedback_json TEXT,
  score_override REAL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_quiz_reviews_attempt ON quiz_reviews(attempt_id, created_at);
