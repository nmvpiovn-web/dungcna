-- ============================================================================
-- MIGRATION 0001: INITIAL COMPLETE SCHEMA & SEED FOR D1
-- Target: Cloudflare D1 Native Database
-- Idempotent: Safe to apply with IF NOT EXISTS / INSERT OR REPLACE
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  phone TEXT,
  email TEXT,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  avatar TEXT,
  status TEXT DEFAULT 'active',
  metadata TEXT,
  grade TEXT,
  password TEXT,
  approval_status TEXT DEFAULT 'approved',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS campuses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  short_code TEXT,
  address TEXT,
  hotline TEXT,
  manager_user_id TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS parent_student_links (
  id TEXT PRIMARY KEY,
  parent_user_id TEXT NOT NULL,
  student_user_id TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS class_sessions (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL,
  class_name TEXT NOT NULL,
  teacher_id TEXT NOT NULL,
  substitute_teacher_id TEXT,
  session_date TEXT NOT NULL,
  start_time TEXT,
  end_time TEXT,
  room TEXT,
  topic TEXT,
  status TEXT DEFAULT 'scheduled',
  attendance_taken INTEGER DEFAULT 0,
  payroll_rate REAL DEFAULT 250000,
  payroll_processed INTEGER DEFAULT 0,
  substitute_payroll_rate REAL,
  substitute_payroll_processed INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS attendance_records (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  status TEXT NOT NULL,
  notes TEXT,
  recorded_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS student_stars (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  stars INTEGER DEFAULT 0,
  reason TEXT,
  awarded_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS homework_assignments (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  class_id TEXT NOT NULL,
  class_name TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  due_date TEXT NOT NULL,
  total_points INTEGER DEFAULT 10,
  created_by TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS homework_submissions (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  student_name TEXT,
  submitted_at TEXT DEFAULT CURRENT_TIMESTAMP,
  content TEXT,
  score REAL,
  feedback TEXT,
  status TEXT DEFAULT 'submitted'
);

CREATE TABLE IF NOT EXISTS tuition_bills (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  student_name TEXT,
  parent_id TEXT,
  month_label TEXT NOT NULL,
  amount REAL NOT NULL,
  amount_paid REAL DEFAULT 0,
  status TEXT DEFAULT 'pending',
  due_date TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tuition_transactions (
  id TEXT PRIMARY KEY,
  bill_id TEXT NOT NULL,
  gateway_transaction_id TEXT UNIQUE,
  gateway TEXT NOT NULL,
  amount REAL NOT NULL,
  payer_name TEXT,
  payer_account TEXT,
  status TEXT DEFAULT 'confirmed',
  raw_payload TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS teacher_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL,
  bio TEXT,
  degree TEXT,
  certifications TEXT,
  hourly_rate REAL DEFAULT 250000,
  is_native INTEGER DEFAULT 0,
  specialty TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS teacher_leave_requests (
  id TEXT PRIMARY KEY,
  teacher_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  reason TEXT,
  substitute_teacher_id TEXT,
  substitute_status TEXT DEFAULT 'pending',
  admin_status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS teacher_recruitment (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  degree TEXT,
  status TEXT DEFAULT 'new',
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS teacher_payrolls (
  id TEXT PRIMARY KEY,
  teacher_id TEXT NOT NULL,
  month_label TEXT NOT NULL,
  base_pay REAL DEFAULT 0,
  teaching_pay REAL DEFAULT 0,
  substitute_pay REAL DEFAULT 0,
  deductions REAL DEFAULT 0,
  bonus REAL DEFAULT 0,
  total_net REAL DEFAULT 0,
  status TEXT DEFAULT 'draft',
  paid_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS knowledge_vault (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  folder TEXT NOT NULL,
  category TEXT NOT NULL,
  tags TEXT,
  content_markdown TEXT,
  source_path TEXT,
  source_hash TEXT,
  status TEXT DEFAULT 'active',
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS knowledge_links (
  id TEXT PRIMARY KEY,
  source_note_id TEXT NOT NULL,
  target_note_id TEXT,
  wikilink_text TEXT NOT NULL,
  is_resolved INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS exams (
  id TEXT PRIMARY KEY,
  curriculum_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  grade INTEGER DEFAULT 0,
  format_type TEXT,
  skill_category TEXT,
  duration_minutes INTEGER NOT NULL,
  total_questions INTEGER DEFAULT 0,
  pass_percentage INTEGER DEFAULT 60,
  created_by TEXT,
  is_published INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  exam_id TEXT NOT NULL,
  question_index INTEGER NOT NULL,
  skill TEXT,
  type TEXT,
  passage TEXT,
  prompt TEXT NOT NULL,
  audio_url TEXT,
  image_url TEXT,
  options_json TEXT,
  correct_answer TEXT,
  explanation TEXT,
  cambridge_level TEXT,
  rubric_json TEXT
);

CREATE TABLE IF NOT EXISTS exam_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  exam_id TEXT NOT NULL,
  status TEXT DEFAULT 'in_progress',
  score REAL DEFAULT 0,
  total_points REAL DEFAULT 10,
  duration_seconds INTEGER DEFAULT 0,
  deadline TEXT,
  started_at TEXT DEFAULT CURRENT_TIMESTAMP,
  submitted_at TEXT
);

CREATE TABLE IF NOT EXISTS exam_attempts (
  id TEXT PRIMARY KEY,
  session_id TEXT UNIQUE NOT NULL,
  user_id TEXT NOT NULL,
  user_name TEXT,
  user_email TEXT,
  exam_id TEXT NOT NULL,
  exam_title TEXT,
  class_id TEXT,
  score REAL NOT NULL,
  max_score REAL NOT NULL,
  answers_json TEXT NOT NULL,
  feedback_json TEXT,
  duration_seconds INTEGER,
  status TEXT DEFAULT 'completed',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_exam_attempts_session_id ON exam_attempts(session_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT,
  actor_role TEXT,
  action TEXT NOT NULL,
  details TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Seed Essential Users & Relationships
INSERT OR REPLACE INTO users (id, username, phone, email, name, role, avatar, status, metadata, grade, password)
VALUES
('usr_super_1', 'admin', '0901234567', 'nmvpiovn@gmail.com', 'Nguyễn Minh Vũ (SuperAdmin Owner)', 'superadmin', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150', 'active', '{"permissions":["all"]}', 'Lớp 12', '123'),
('usr_super_2', 'msdung', '0912345678', 'msdung@timbk.io.vn', 'Ms. Dung (SuperAdmin Leader)', 'leader', 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150', 'active', '{"permissions":["all"]}', 'Lớp 7', '123'),
('usr_teach_1', 'teacher.john', '0933111222', 'teacher.john@timbk.io.vn', 'Mr. Johnathan Miller', 'teacher', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150', 'active', '{"nationality":"British"}', 'Lớp 7', '123'),
('usr_teach_2', 'nguyen.huong', '0933222333', 'nguyen.huong@timbk.io.vn', 'Cô Nguyễn Hương', 'teacher', 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150', 'active', '{"school":"THPT Chuyên"}', 'Lớp 7', '123'),
('usr_parent_demo', 'phuhuynh', '0966778899', 'mailan.parent@gmail.com', 'Chị Mai Lan (Phụ Huynh)', 'parent', 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150', 'active', '{"linked_student_id":"usr_student_demo","phone":"0966778899"}', 'Lớp 7', '123'),
('usr_student_demo', 'hocsinh', '0988123456', 'hocsinh.demo@timbk.io.vn', 'Lê Bảo Anh (Học viên tiêu biểu)', 'student', 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150', 'active', '{"grade":7}', 'Lớp 7', '123'),
('usr_student_baokhiem', 'baokhiem', '0918889999', 'baokhiem@tienganhcodung.edu.vn', 'Nguyễn Bảo Khiêm (Lớp 7)', 'student', 'https://api.dicebear.com/7.x/bottts/svg?seed=baokhiem', 'active', '{"grade":"Lớp 7"}', 'Lớp 7', '123');

INSERT OR REPLACE INTO parent_student_links (id, parent_user_id, student_user_id)
VALUES
('psl_1', 'usr_parent_demo', 'usr_student_demo'),
('psl_2', 'usr_parent_demo', 'usr_student_baokhiem');

INSERT OR REPLACE INTO tuition_bills (id, student_id, student_name, parent_id, month_label, amount, amount_paid, status, due_date)
VALUES
('HP_G7_001', 'usr_student_demo', 'Lê Bảo Anh (Lớp 7)', 'usr_parent_demo', 'Tháng 10/2026', 1500000, 0, 'pending', '2026-10-05'),
('HP_G7_002', 'usr_student_baokhiem', 'Nguyễn Bảo Khiêm (Lớp 7)', 'usr_parent_demo', 'Tháng 10/2026', 1800000, 1800000, 'paid', '2026-10-05');
