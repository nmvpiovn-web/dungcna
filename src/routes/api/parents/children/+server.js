import { json } from '@sveltejs/kit';
import { verifyServerAuth, isStaffUser } from '../../../../lib/server/auth.js';

export const prerender = false;

// Mock linked student repository for in-memory / local fallback
const defaultLinkedChildren = [
  {
    id: 'user_student_1',
    name: 'Nguyễn Minh Quân',
    username: 'minhquan7a',
    grade: 'Lớp 7',
    avatar: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150',
    stars_total: 150,
    attendance_rate: '96%',
    class_name: 'Tiếng Anh Lớp 7 - Chuyên Sâu',
    tuition_status: 'paid',
    last_active: '2026-10-07T14:20:00Z'
  },
  {
    id: 'usr_student_baokhiem',
    name: 'Nguyễn Bảo Khiêm',
    username: 'baokhiem',
    grade: 'Lớp 7',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
    stars_total: 220,
    attendance_rate: '100%',
    class_name: 'Tiếng Anh Lớp 7 - Global Success & KET A2',
    tuition_status: 'unpaid',
    last_active: '2026-10-08T09:15:00Z'
  }
];

export async function GET({ request, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) {
    return json({ success: false, error: auth.error || 'Vui lòng đăng nhập' }, { status: auth.status || 401 });
  }

  const user = auth.user;
  const isStaff = isStaffUser(user);

  // Scoping check: only parent or staff can inspect linked children
  if (user.role !== 'parent' && !isStaff) {
    return json({ 
      success: false, 
      error: 'Forbidden: Chỉ phụ huynh hoặc ban quản trị mới có quyền truy cập danh sách con liên kết' 
    }, { status: 403 });
  }

  const db = platform?.env?.DB;
  if (db) {
    try {
      // Query parent_student_links from Cloudflare D1
      // P1-REG-02 Fix: Pending links return ONLY request metadata; private profile is redacted until verified
      const linksRes = await db.prepare(`
        SELECT psl.id as link_id, psl.student_user_id, psl.verification_status, psl.created_at as requested_at,
               u.id, u.name, u.username, u.avatar, u.grade, u.status
        FROM parent_student_links psl
        LEFT JOIN users u ON psl.student_user_id = u.id
        WHERE psl.parent_user_id = ?;
      `).bind(user.id).all();

      const children = (linksRes?.results || []).map(r => {
        const isVerified = r.verification_status === 'verified';
        return {
          id: r.student_user_id || r.id,
          link_id: r.link_id,
          verification_status: r.verification_status || 'pending',
          is_verified: isVerified,
          requested_at: r.requested_at || null,
          // Private child profile ONLY revealed if link is formally verified
          name: isVerified ? (r.name || 'Học sinh liên kết') : 'Yêu cầu liên kết đang chờ xác minh',
          username: isVerified ? (r.username || '') : null,
          grade: isVerified ? (r.grade || 'Lớp 7') : null,
          avatar: isVerified ? (r.avatar || '') : null,
          status: isVerified ? (r.status || 'active') : 'pending_verification',
          stars_total: 0
        };
      });

      return json({
        success: true,
        children,
        total: children.length,
        source: 'cloudflare_d1'
      });
    } catch (e) {
      console.error('Error fetching parent children from D1:', e);
    }
  }

  // Fallback in-memory mode: Fail-closed (empty list for unverified parents)
  return json({
    success: true,
    children: [],
    total: 0,
    source: 'fail_closed_unlinked_parent'
  });
}

export async function POST({ request, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) {
    return json({ success: false, error: auth.error || 'Vui lòng đăng nhập' }, { status: auth.status || 401 });
  }

  const user = auth.user;
  if (user.role !== 'parent' && !isStaffUser(user)) {
    return json({ success: false, error: 'Forbidden: Chỉ phụ huynh mới có thể liên kết học sinh' }, { status: 403 });
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    return json({ success: false, error: 'InvalidJSON: Payload yêu cầu định dạng JSON hợp lệ' }, { status: 400 });
  }

  const { student_id, student_code } = body;
  if (!student_id && !student_code) {
    return json({ success: false, error: 'Thiếu mã học sinh hoặc ID học sinh để liên kết' }, { status: 400 });
  }

  const targetId = student_id || student_code;

  const db = platform?.env?.DB;
  if (db) {
    try {
      // Verify target student exists AND has role = 'student' (P1-REG-02)
      const targetUser = await db.prepare('SELECT id, name, role FROM users WHERE id = ? OR username = ?').bind(targetId, targetId).first();
      if (!targetUser) {
        return json({ success: false, error: 'Không tìm thấy hồ sơ học sinh với mã này' }, { status: 404 });
      }

      if (targetUser.role !== 'student') {
        return json({ success: false, error: 'Không thể liên kết: Tài khoản đích không phải là học sinh' }, { status: 400 });
      }

      // Check if already linked
      const existing = await db.prepare('SELECT id, verification_status FROM parent_student_links WHERE parent_user_id = ? AND student_user_id = ?')
        .bind(user.id, targetUser.id).first();
      if (existing) {
        return json({ 
          success: true, 
          verification_status: existing.verification_status || 'pending',
          message: existing.verification_status === 'verified' 
            ? 'Học sinh đã được xác minh liên kết từ trước' 
            : 'Yêu cầu liên kết đang chờ xét duyệt từ nhà trường/giáo viên (pending)', 
          student_id: targetUser.id 
        });
      }

      // Insert link with default PENDING status (P1-REG-02)
      const linkId = `link_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      await db.prepare(`
        INSERT INTO parent_student_links (id, parent_user_id, student_user_id, verification_status, created_at) 
        VALUES (?, ?, ?, 'pending', CURRENT_TIMESTAMP)
      `).bind(linkId, user.id, targetUser.id).run();

      return json({
        success: true,
        verification_status: 'pending',
        message: `Yêu cầu liên kết học sinh ${targetUser.name} đã được ghi nhận. Đang chờ nhà trường xác minh (pending).`,
        student_id: targetUser.id
      });
    } catch (e) {
      console.error('Error inserting parent_student_link to D1:', e);
      return json({ success: false, error: 'Lỗi ghi cơ sở dữ liệu' }, { status: 500 });
    }
  }

  // Fallback in-memory
  return json({
    success: true,
    message: `Đã liên kết thành công học sinh (demo: ${targetId})`,
    student_id: targetId
  });
}
