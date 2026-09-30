-- ============================================================================
-- MIGRATION 0004: V5 SCHEMA ALIGNMENT & PERSISTENCE FOUNDATION
-- Target: Cloudflare D1 Native Database
-- Aligns users, parent_student_links, student_evaluations, workflows, homework, schedule, sessions
-- ============================================================================

-- 1. Users schema update
ALTER TABLE users ADD COLUMN profile_version INTEGER DEFAULT 0;

-- 2. Parent-Student Links verification_status
ALTER TABLE parent_student_links ADD COLUMN verification_status TEXT DEFAULT 'pending';

-- 3. Student Evaluations table
CREATE TABLE IF NOT EXISTS student_evaluations (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  student_name TEXT NOT NULL,
  teacher_id TEXT,
  teacher_name TEXT,
  grade_level TEXT,
  listening_score REAL DEFAULT 0,
  reading_score REAL DEFAULT 0,
  writing_score REAL DEFAULT 0,
  speaking_score REAL DEFAULT 0,
  grammar_vocab_score REAL DEFAULT 0,
  overall_score REAL DEFAULT 0,
  primary_aptitude TEXT,
  secondary_aptitude TEXT,
  strengths TEXT,
  weaknesses TEXT,
  teacher_feedback TEXT,
  action_plan TEXT,
  recommended_materials TEXT,
  parent_name TEXT,
  parent_phone TEXT,
  parent_zalo_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_student_evaluations_student ON student_evaluations(student_id);

-- 4. Teacher Salary Advances & Transactions
CREATE TABLE IF NOT EXISTS teacher_salary_advances (
  id TEXT PRIMARY KEY,
  teacher_id TEXT NOT NULL,
  teacher_name TEXT,
  amount_vnd INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  billing_cycle TEXT,
  status TEXT DEFAULT 'pending',
  approved_by TEXT,
  approved_at DATETIME,
  admin_notes TEXT,
  disbursed_at DATETIME,
  disbursed_by TEXT,
  disbursement_ref TEXT,
  deducted_at DATETIME,
  deducted_payroll_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_teacher_salary_advances_teacher ON teacher_salary_advances(teacher_id);

CREATE TABLE IF NOT EXISTS salary_transactions (
  id TEXT PRIMARY KEY,
  teacher_id TEXT NOT NULL,
  teacher_name TEXT,
  transaction_type TEXT NOT NULL,
  amount_vnd INTEGER NOT NULL DEFAULT 0,
  billing_cycle TEXT,
  status TEXT DEFAULT 'completed',
  ref_id TEXT,
  notes TEXT,
  created_by TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_salary_transactions_teacher ON salary_transactions(teacher_id);

-- 5. Teacher leave requests & recruitment extra columns
ALTER TABLE teacher_leave_requests ADD COLUMN admin_notes TEXT;

ALTER TABLE teacher_recruitment ADD COLUMN candidate_name TEXT;
ALTER TABLE teacher_recruitment ADD COLUMN role_type TEXT;
ALTER TABLE teacher_recruitment ADD COLUMN experience_years INTEGER DEFAULT 0;
ALTER TABLE teacher_recruitment ADD COLUMN certificates TEXT;
ALTER TABLE teacher_recruitment ADD COLUMN interview_time DATETIME;
ALTER TABLE teacher_recruitment ADD COLUMN interviewer_name TEXT;
ALTER TABLE teacher_recruitment ADD COLUMN interview_notes TEXT;
ALTER TABLE teacher_recruitment ADD COLUMN trial_feedback TEXT;
ALTER TABLE teacher_recruitment ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP;

-- 6. Student Stars & Star Ledger
ALTER TABLE student_stars ADD COLUMN stars_balance INTEGER DEFAULT 0;
ALTER TABLE student_stars ADD COLUMN total_earned_stars INTEGER DEFAULT 0;
ALTER TABLE student_stars ADD COLUMN stars_redeemed INTEGER DEFAULT 0;
ALTER TABLE student_stars ADD COLUMN star_debt INTEGER DEFAULT 0;
ALTER TABLE student_stars ADD COLUMN last_updated TEXT DEFAULT CURRENT_TIMESTAMP;
CREATE UNIQUE INDEX IF NOT EXISTS idx_student_stars_student_id ON student_stars(student_id);
UPDATE student_stars SET stars_balance = stars, total_earned_stars = stars WHERE (stars_balance IS NULL OR stars_balance = 0) AND stars > 0;
INSERT INTO student_stars (id, student_id, stars_balance, total_earned_stars, stars_redeemed, star_debt)
VALUES ('star_demo', 'usr_student_demo', 150, 150, 0, 0)
ON CONFLICT(student_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS student_star_ledger (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  bill_id TEXT,
  reference_id TEXT,
  delta_stars INTEGER NOT NULL DEFAULT 0,
  amount INTEGER NOT NULL DEFAULT 0,
  balance_after INTEGER NOT NULL DEFAULT 0,
  debt_delta INTEGER DEFAULT 0,
  debt_after INTEGER DEFAULT 0,
  action_type TEXT NOT NULL,
  reason TEXT,
  note TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_student_star_ledger_student ON student_star_ledger(student_id);

-- 7. Homework assignments & submissions alignment
ALTER TABLE homework_assignments ADD COLUMN teacher_id TEXT;
ALTER TABLE homework_assignments ADD COLUMN teacher_name TEXT;
ALTER TABLE homework_assignments ADD COLUMN campus_id TEXT DEFAULT 'loc_codung';
ALTER TABLE homework_assignments ADD COLUMN skill_type TEXT;
ALTER TABLE homework_assignments ADD COLUMN obsidian_note_id TEXT;
ALTER TABLE homework_assignments ADD COLUMN obsidian_note_title TEXT;
ALTER TABLE homework_assignments ADD COLUMN assigned_date TEXT;
ALTER TABLE homework_assignments ADD COLUMN deadline_date TEXT;
ALTER TABLE homework_assignments ADD COLUMN deadline_time TEXT;
ALTER TABLE homework_assignments ADD COLUMN max_score REAL DEFAULT 10.0;
ALTER TABLE homework_assignments ADD COLUMN star_reward_on_time INTEGER DEFAULT 50;
ALTER TABLE homework_assignments ADD COLUMN status TEXT DEFAULT 'published';

ALTER TABLE homework_submissions ADD COLUMN submission_type TEXT;
ALTER TABLE homework_submissions ADD COLUMN content_text TEXT;
ALTER TABLE homework_submissions ADD COLUMN audio_url TEXT;
ALTER TABLE homework_submissions ADD COLUMN handwritten_image_url TEXT;
ALTER TABLE homework_submissions ADD COLUMN attachments_json TEXT;
ALTER TABLE homework_submissions ADD COLUMN is_on_time INTEGER DEFAULT 1;
ALTER TABLE homework_submissions ADD COLUMN graded_by_teacher_id TEXT;
ALTER TABLE homework_submissions ADD COLUMN graded_by_teacher_name TEXT;
ALTER TABLE homework_submissions ADD COLUMN graded_at TEXT;
ALTER TABLE homework_submissions ADD COLUMN teacher_feedback TEXT;
ALTER TABLE homework_submissions ADD COLUMN audio_feedback_url TEXT;
ALTER TABLE homework_submissions ADD COLUMN stars_awarded INTEGER DEFAULT 0;
ALTER TABLE homework_submissions ADD COLUMN star_awarded_reason TEXT;
ALTER TABLE homework_submissions ADD COLUMN version INTEGER DEFAULT 1;
ALTER TABLE homework_submissions ADD COLUMN grading_token TEXT;

-- 8. Auxiliary Tables: class_enrollments, system_notifications, location_activity_streams
CREATE TABLE IF NOT EXISTS class_enrollments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  class_id TEXT NOT NULL,
  enrolled_at TEXT DEFAULT CURRENT_TIMESTAMP,
  status TEXT DEFAULT 'active',
  UNIQUE(user_id, class_id)
);
CREATE INDEX IF NOT EXISTS idx_class_enrollments_user ON class_enrollments(user_id);
CREATE INDEX IF NOT EXISTS idx_class_enrollments_class ON class_enrollments(class_id);

CREATE TABLE IF NOT EXISTS system_notifications (
  id TEXT PRIMARY KEY,
  target_role TEXT,
  target_user_id TEXT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT,
  reference_id TEXT,
  is_read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_system_notifications_target ON system_notifications(target_user_id, target_role);

CREATE TABLE IF NOT EXISTS location_activity_streams (
  id TEXT PRIMARY KEY,
  campus_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  activity_type TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT,
  reference_id TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 9. Class Sessions extra columns for Schedule persistence
ALTER TABLE class_sessions ADD COLUMN grade_level TEXT;
ALTER TABLE class_sessions ADD COLUMN teacher_name TEXT;
ALTER TABLE class_sessions ADD COLUMN day_of_week INTEGER;
ALTER TABLE class_sessions ADD COLUMN day_name TEXT;
ALTER TABLE class_sessions ADD COLUMN student_ids TEXT;
ALTER TABLE class_sessions ADD COLUMN assistant_teacher_id TEXT;
ALTER TABLE class_sessions ADD COLUMN substitute_teacher_name TEXT;
ALTER TABLE class_sessions ADD COLUMN substitute_notes TEXT;

-- 10. Auth Sessions Registry (for G2 Server-side Revocation)
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

-- 11. Teacher Profiles columns alignment for staff & salary contracts
ALTER TABLE teacher_profiles ADD COLUMN teacher_id TEXT;
ALTER TABLE teacher_profiles ADD COLUMN teacher_name TEXT;
ALTER TABLE teacher_profiles ADD COLUMN username TEXT;
ALTER TABLE teacher_profiles ADD COLUMN role_type TEXT;
ALTER TABLE teacher_profiles ADD COLUMN role_title TEXT;
ALTER TABLE teacher_profiles ADD COLUMN salary_type TEXT;
ALTER TABLE teacher_profiles ADD COLUMN base_salary_vnd REAL DEFAULT 0;
ALTER TABLE teacher_profiles ADD COLUMN rate_per_session_vnd REAL DEFAULT 0;
ALTER TABLE teacher_profiles ADD COLUMN total_sessions_taught INTEGER DEFAULT 0;
ALTER TABLE teacher_profiles ADD COLUMN leader_rating REAL DEFAULT 5.0;
ALTER TABLE teacher_profiles ADD COLUMN leader_appraisal TEXT;
ALTER TABLE teacher_profiles ADD COLUMN bonuses TEXT;
ALTER TABLE teacher_profiles ADD COLUMN private_reminders TEXT;
ALTER TABLE teacher_profiles ADD COLUMN updated_at TEXT DEFAULT CURRENT_TIMESTAMP;

-- 12. Tuition Bills Schema Alignment for Financial Ledger
ALTER TABLE tuition_bills ADD COLUMN version INTEGER DEFAULT 1;
ALTER TABLE tuition_bills ADD COLUMN age INTEGER DEFAULT 13;
ALTER TABLE tuition_bills ADD COLUMN grade_level TEXT DEFAULT 'Lớp 7';
ALTER TABLE tuition_bills ADD COLUMN program_name TEXT DEFAULT 'Tiếng Anh K12';
ALTER TABLE tuition_bills ADD COLUMN billing_period TEXT;
ALTER TABLE tuition_bills ADD COLUMN base_tuition_vnd REAL DEFAULT 0;
ALTER TABLE tuition_bills ADD COLUMN attendance_total_sessions INTEGER DEFAULT 12;
ALTER TABLE tuition_bills ADD COLUMN attendance_attended_sessions INTEGER DEFAULT 12;
ALTER TABLE tuition_bills ADD COLUMN stars_available INTEGER DEFAULT 0;
ALTER TABLE tuition_bills ADD COLUMN stars_deducted INTEGER DEFAULT 0;
ALTER TABLE tuition_bills ADD COLUMN discount_vnd REAL DEFAULT 0;
ALTER TABLE tuition_bills ADD COLUMN final_amount_vnd REAL DEFAULT 0;
ALTER TABLE tuition_bills ADD COLUMN vietqr_url TEXT;
ALTER TABLE tuition_bills ADD COLUMN bank_name TEXT;
ALTER TABLE tuition_bills ADD COLUMN bank_account TEXT;
ALTER TABLE tuition_bills ADD COLUMN account_holder TEXT;
ALTER TABLE tuition_bills ADD COLUMN growth_status TEXT DEFAULT 'normal';
ALTER TABLE tuition_bills ADD COLUMN growth_percentage REAL DEFAULT 0;
ALTER TABLE tuition_bills ADD COLUMN growth_notes TEXT;
ALTER TABLE tuition_bills ADD COLUMN eval_listening REAL DEFAULT 8.0;
ALTER TABLE tuition_bills ADD COLUMN eval_reading REAL DEFAULT 8.0;
ALTER TABLE tuition_bills ADD COLUMN eval_writing REAL DEFAULT 8.0;
ALTER TABLE tuition_bills ADD COLUMN eval_speaking REAL DEFAULT 8.0;
ALTER TABLE tuition_bills ADD COLUMN eval_grammar REAL DEFAULT 8.0;
ALTER TABLE tuition_bills ADD COLUMN test_score_15m REAL DEFAULT 8.0;
ALTER TABLE tuition_bills ADD COLUMN test_score_45m REAL DEFAULT 8.5;
ALTER TABLE tuition_bills ADD COLUMN template_id INTEGER DEFAULT 1;
ALTER TABLE tuition_bills ADD COLUMN superadmin_notes TEXT;
ALTER TABLE tuition_bills ADD COLUMN approved_by TEXT;
ALTER TABLE tuition_bills ADD COLUMN parent_name TEXT;
ALTER TABLE tuition_bills ADD COLUMN parent_phone TEXT;
ALTER TABLE tuition_bills ADD COLUMN parent_zalo_id TEXT;
ALTER TABLE tuition_bills ADD COLUMN total_amount REAL DEFAULT 0;

-- 13. Tuition Transactions Schema Alignment for SePay Webhook
ALTER TABLE tuition_transactions ADD COLUMN student_id TEXT;
ALTER TABLE tuition_transactions ADD COLUMN gateway_name TEXT DEFAULT 'sepay';
ALTER TABLE tuition_transactions ADD COLUMN reference_code TEXT;
ALTER TABLE tuition_transactions ADD COLUMN transfer_content TEXT;

-- 14. Teacher Leave Requests Columns Alignment
ALTER TABLE teacher_leave_requests ADD COLUMN teacher_name TEXT;
ALTER TABLE teacher_leave_requests ADD COLUMN session_date TEXT;
ALTER TABLE teacher_leave_requests ADD COLUMN substitute_teacher_name TEXT;

-- 15. Teacher Payrolls Columns Alignment for Payroll Engine
ALTER TABLE teacher_payrolls ADD COLUMN billing_cycle TEXT;
ALTER TABLE teacher_payrolls ADD COLUMN gross_amount INTEGER DEFAULT 0;
ALTER TABLE teacher_payrolls ADD COLUMN net_amount INTEGER DEFAULT 0;
ALTER TABLE teacher_payrolls ADD COLUMN disbursed_advances_deducted INTEGER DEFAULT 0;
ALTER TABLE teacher_payrolls ADD COLUMN prior_debt_deducted INTEGER DEFAULT 0;
ALTER TABLE teacher_payrolls ADD COLUMN carried_over_debt INTEGER DEFAULT 0;
ALTER TABLE teacher_payrolls ADD COLUMN calculation_json TEXT;
ALTER TABLE teacher_payrolls ADD COLUMN approved_by TEXT;
ALTER TABLE teacher_payrolls ADD COLUMN approved_at DATETIME;
ALTER TABLE teacher_payrolls ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP;

-- 16. Finance Ledger Table for Payroll & Tuition Vouchers
CREATE TABLE IF NOT EXISTS finance_ledger (
  id TEXT PRIMARY KEY,
  voucher_type TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  teacher_id TEXT,
  actor_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  payment_method TEXT DEFAULT 'bank_transfer',
  billing_cycle TEXT NOT NULL,
  idempotency_key TEXT UNIQUE,
  voucher_number TEXT,
  status TEXT DEFAULT 'completed',
  description TEXT,
  metadata_json TEXT DEFAULT '{}',
  adjustment_version INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_finance_ledger_cycle ON finance_ledger(billing_cycle);
CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_ledger_payroll_version ON finance_ledger(reference_id, adjustment_version) WHERE voucher_type = 'PAYROLL_ADJUSTMENT' AND adjustment_version IS NOT NULL;

-- 17. Knowledge Links alignment for Second Brain backlinks & forward links
ALTER TABLE knowledge_links ADD COLUMN from_id TEXT;
ALTER TABLE knowledge_links ADD COLUMN to_id TEXT;
UPDATE knowledge_links SET from_id = source_note_id WHERE from_id IS NULL;
UPDATE knowledge_links SET to_id = target_note_id WHERE to_id IS NULL;

-- 18. System Notification Reads tracking table
CREATE TABLE IF NOT EXISTS system_notification_reads (
  notification_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  read_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (notification_id, user_id)
);

-- 19. Parent Test Records Table & Indexes
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
CREATE INDEX IF NOT EXISTS idx_parent_test_records_child ON parent_test_records(parent_user_id, student_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_parent_test_records_idem ON parent_test_records(parent_user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

-- 20. Guest Exam Sessions persistence table
CREATE TABLE IF NOT EXISTS guest_exam_sessions (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL,
  grade TEXT NOT NULL,
  curriculum TEXT NOT NULL DEFAULT 'global_success',
  blueprint_json TEXT,
  candidate_name TEXT,
  duration_minutes INTEGER NOT NULL,
  start_time INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  questions_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress',
  answers_json TEXT,
  result_json TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 21. Standardized Question Bank & Exam Instances tables
CREATE TABLE IF NOT EXISTS question_bank (
  id TEXT PRIMARY KEY,
  grade_level TEXT NOT NULL,
  cognitive_level TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published',
  skill_category TEXT NOT NULL DEFAULT 'grammar',
  question_text TEXT NOT NULL,
  options_json TEXT NOT NULL,
  correct_option_id TEXT NOT NULL,
  explanation TEXT,
  reading_passage TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_question_bank_skill ON question_bank(grade_level, cognitive_level, skill_category);

CREATE TABLE IF NOT EXISTS exam_instances (
  id TEXT PRIMARY KEY,
  exam_type TEXT NOT NULL,
  grade_level TEXT NOT NULL,
  title TEXT NOT NULL,
  total_questions INTEGER NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 50,
  created_by TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress',
  score REAL,
  answers_json TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  submitted_at DATETIME
);

CREATE TABLE IF NOT EXISTS exam_instance_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  instance_id TEXT NOT NULL,
  item_order INTEGER NOT NULL,
  question_id TEXT NOT NULL,
  question_text TEXT NOT NULL,
  options_json TEXT NOT NULL,
  correct_option_id TEXT NOT NULL,
  explanation TEXT,
  reading_passage TEXT
);
CREATE INDEX IF NOT EXISTS idx_exam_instance_items_inst ON exam_instance_items(instance_id);

-- 22. Exam Attempts Archive & Exam Sessions
CREATE TABLE IF NOT EXISTS exam_attempts_archive (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_name TEXT,
  user_email TEXT,
  exam_id TEXT NOT NULL,
  exam_title TEXT,
  score REAL NOT NULL,
  max_score REAL NOT NULL,
  answers_json TEXT NOT NULL,
  duration_seconds INTEGER DEFAULT 0,
  session_id TEXT,
  class_id TEXT,
  created_at DATETIME,
  archived_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  archive_reason TEXT DEFAULT 'pre_unique_migration_duplicate'
);

CREATE TABLE IF NOT EXISTS exam_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  exam_id TEXT NOT NULL,
  attempt_number INTEGER DEFAULT 1,
  questions_snapshot_json TEXT NOT NULL,
  answer_key_snapshot_json TEXT,
  time_limit_minutes INTEGER NOT NULL,
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deadline_at DATETIME NOT NULL,
  submitted_at DATETIME,
  status TEXT DEFAULT 'in_progress',
  score REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_exam_attempts_user_exam ON exam_attempts (user_id, exam_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_exam_attempts_session_id ON exam_attempts (session_id) WHERE session_id IS NOT NULL AND session_id != '';
