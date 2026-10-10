-- 0017_users_approval_status.sql
-- Thêm cột approval_status vào bảng users và backfill trạng thái an toàn
-- Phục vụ luồng onboarding và phân quyền staff/giáo viên theo Issue #22 / PR #23

ALTER TABLE users ADD COLUMN approval_status TEXT DEFAULT 'approved';

-- 1. Giữ trạng thái tương ứng cho các tài khoản trial / pending / rejected
UPDATE users
SET approval_status = 'trial'
WHERE status = 'trial';

UPDATE users
SET approval_status = 'pending'
WHERE status = 'pending';

UPDATE users
SET approval_status = 'rejected'
WHERE status = 'rejected';

-- 2. Giáo viên active / official được set là approved
UPDATE users
SET approval_status = 'approved'
WHERE role = 'teacher' AND (status = 'active' OR status = 'official');

-- 3. Các user còn lại (superadmin, admin, leader, student, parent...) giữ 'approved'
UPDATE users
SET approval_status = 'approved'
WHERE approval_status IS NULL OR approval_status = '';
