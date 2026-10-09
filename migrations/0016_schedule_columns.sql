-- Migration 0016: Schedule columns for SessionEditModal fields
-- Adds: location, notify_minutes_before, assistant_teacher_name, teacher_role
ALTER TABLE class_sessions ADD COLUMN location TEXT;
ALTER TABLE class_sessions ADD COLUMN notify_minutes_before INTEGER DEFAULT 10;
ALTER TABLE class_sessions ADD COLUMN assistant_teacher_name TEXT;
ALTER TABLE class_sessions ADD COLUMN teacher_role TEXT DEFAULT 'lead';
