-- V6.3: persist structured recruitment choices and make parent-link audits reliable.
ALTER TABLE teacher_recruitment ADD COLUMN selected_grades_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE teacher_recruitment ADD COLUMN selected_subjects_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE teacher_recruitment ADD COLUMN interview_preference TEXT;
ALTER TABLE teacher_recruitment ADD COLUMN availability TEXT;
ALTER TABLE teacher_recruitment ADD COLUMN cv_link TEXT;

ALTER TABLE parent_student_links ADD COLUMN updated_at TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_parent_student_unique
  ON parent_student_links(parent_user_id, student_user_id);
