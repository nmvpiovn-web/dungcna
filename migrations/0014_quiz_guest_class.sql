-- Guest-reported class is for reconciliation, not an enrollment or authorization.
ALTER TABLE quiz_attempts ADD COLUMN guest_class TEXT;
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_class_started ON quiz_attempts(guest_class, started_at);
