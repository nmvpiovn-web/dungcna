import { json } from '@sveltejs/kit';
import { verifyServerAuth, isStaffUser, SUPERADMIN_USERNAMES } from '$lib/server/auth';

export const prerender = false;

function isManager(user) {
  if (!user) return false;
  return user.role === 'superadmin' || user.role === 'leader' || SUPERADMIN_USERNAMES.includes(user.username);
}

export async function GET({ url, request, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) {
    return json({ success: false, error: auth.error || 'Unauthorized: Yêu cầu đăng nhập tài khoản hợp lệ' }, { status: auth.status || 401 });
  }
  if (!isStaffUser(auth.user)) {
    return json({ success: false, error: 'Forbidden: Khu vực dành riêng cho Giáo viên và Ban Quản Lý' }, { status: 403 });
  }

  if (!platform?.env?.DB) {
    return json({ success: false, error: 'DatabaseUnavailable: Cloudflare D1 không khả dụng' }, { status: 500 });
  }

  const db = platform.env.DB;
  const manager = isManager(auth.user);
  const type = url.searchParams.get('type') || 'all'; // 'leaves' | 'advances' | 'recruitment' | 'all'

  try {
    let leaves = [];
    let advances = [];
    let recruitment = [];

    // 1. Fetch Leaves & Substitute Requests
    if (type === 'all' || type === 'leaves') {
      if (manager) {
        const res = await db.prepare(`
          SELECT * FROM teacher_leave_requests ORDER BY created_at DESC;
        `).all();
        leaves = res.results || [];
      } else {
        // Teacher sees leaves they requested OR requests where they are chosen as substitute
        const res = await db.prepare(`
          SELECT * FROM teacher_leave_requests 
          WHERE teacher_id = ? OR substitute_teacher_id = ?
          ORDER BY created_at DESC;
        `).bind(auth.user.id, auth.user.id).all();
        leaves = res.results || [];
      }
    }

    // 2. Fetch Salary Advances
    if (type === 'all' || type === 'advances') {
      if (manager) {
        const res = await db.prepare(`
          SELECT * FROM teacher_salary_advances ORDER BY created_at DESC;
        `).all();
        advances = res.results || [];
      } else {
        const res = await db.prepare(`
          SELECT * FROM teacher_salary_advances 
          WHERE teacher_id = ?
          ORDER BY created_at DESC;
        `).bind(auth.user.id).all();
        advances = res.results || [];
      }
    }

    // 3. Fetch Recruitment (Manager only)
    if ((type === 'all' || type === 'recruitment') && manager) {
      const res = await db.prepare(`
        SELECT * FROM teacher_recruitment ORDER BY created_at DESC;
      `).all();
      recruitment = res.results || [];
    }

    return json({
      success: true,
      manager,
      leaves,
      advances,
      recruitment
    });
  } catch (err) {
    console.error('Error fetching teacher workflows:', err);
    return json({ success: false, error: 'DatabaseError: Lỗi khi truy vấn dữ liệu nghiệp vụ giáo viên' }, { status: 500 });
  }
}

export async function POST({ request, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) {
    return json({ success: false, error: auth.error || 'Unauthorized: Yêu cầu đăng nhập' }, { status: auth.status || 401 });
  }
  if (!isStaffUser(auth.user)) {
    return json({ success: false, error: 'Forbidden: Thao tác chỉ dành cho nhân sự' }, { status: 403 });
  }

  if (!platform?.env?.DB) {
    return json({ success: false, error: 'DatabaseUnavailable: Cloudflare D1 không khả dụng' }, { status: 500 });
  }

  const db = platform.env.DB;
  const manager = isManager(auth.user);

  let body = {};
  try {
    body = await request.json();
  } catch {
    return json({ success: false, error: 'InvalidJSON: Payload yêu cầu đúng định dạng JSON' }, { status: 400 });
  }

  const action = body.action;

  // ACTION 1: REQUEST LEAVE (Teacher or Manager)
  if (action === 'request_leave') {
    const { session_id, session_date, reason, substitute_teacher_id, substitute_teacher_name } = body;
    if (!session_date || !reason) {
      return json({ success: false, error: 'Vui lòng cung cấp ngày nghỉ và lý do cụ thể' }, { status: 400 });
    }

    const leaveId = `leave_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const substituteStatus = substitute_teacher_id ? 'pending' : 'not_requested';

    try {
      await db.prepare(`
        INSERT INTO teacher_leave_requests 
        (id, teacher_id, teacher_name, session_id, session_date, reason, substitute_teacher_id, substitute_teacher_name, substitute_status, admin_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending');
      `).bind(
        leaveId,
        auth.user.id,
        auth.user.name,
        session_id || null,
        session_date,
        reason,
        substitute_teacher_id || null,
        substitute_teacher_name || null,
        substituteStatus
      ).run();

      // Trigger notification for substitute teacher if selected
      if (substitute_teacher_id) {
        await db.prepare(`
          INSERT INTO system_notifications (id, target_role, target_user_id, title, body, category, reference_id)
          VALUES (?, 'teacher', ?, 'Lời mời dạy thay', ?, 'leave', ?);
        `).bind(
          `notif_${Date.now()}`,
          substitute_teacher_id,
          `Thầy/Cô ${auth.user.name} đề nghị bạn dạy thay vào ca ngày ${session_date}.`,
          leaveId
        ).run();
      }

      // Notify Leader/Admin
      await db.prepare(`
        INSERT INTO system_notifications (id, target_role, title, body, category, reference_id)
        VALUES (?, 'leader', 'Đơn xin nghỉ ca mới', ?, 'leave', ?);
      `).bind(
        `notif_l_${Date.now()}`,
        `Giáo viên ${auth.user.name} vừa nộp đơn xin nghỉ ngày ${session_date}.`,
        leaveId
      ).run();

      return json({ success: true, message: 'Đã gửi đơn xin nghỉ thành công', leave_id: leaveId });
    } catch (e) {
      return json({ success: false, error: `Lỗi lưu đơn xin nghỉ: ${e.message}` }, { status: 500 });
    }
  }

  // ACTION 2: RESPOND TO SUBSTITUTE REQUEST (Only the selected substitute teacher)
  if (action === 'respond_substitute') {
    const { leave_id, decision } = body; // decision: 'accepted' | 'declined'
    if (!leave_id || (decision !== 'accepted' && decision !== 'declined')) {
      return json({ success: false, error: 'Thiếu mã đơn hoặc quyết định không hợp lệ' }, { status: 400 });
    }

    const leave = await db.prepare('SELECT * FROM teacher_leave_requests WHERE id = ?').bind(leave_id).first();
    if (!leave) {
      return json({ success: false, error: 'Không tìm thấy đơn xin nghỉ' }, { status: 404 });
    }

    // Strict validation: Only the assigned substitute teacher can respond
    if (leave.substitute_teacher_id !== auth.user.id && !manager) {
      return json({ success: false, error: 'Forbidden: Bạn không phải người được đề nghị dạy thay' }, { status: 403 });
    }

    try {
      await db.prepare(`
        UPDATE teacher_leave_requests 
        SET substitute_status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?;
      `).bind(decision, leave_id).run();

      // Notify original teacher
      await db.prepare(`
        INSERT INTO system_notifications (id, target_role, target_user_id, title, body, category, reference_id)
        VALUES (?, 'teacher', ?, 'Phản hồi dạy thay', ?, 'leave', ?);
      `).bind(
        `notif_${Date.now()}`,
        leave.teacher_id,
        `${auth.user.name} đã ${decision === 'accepted' ? 'ĐỒNG Ý' : 'TỪ CHỐI'} nhận ca dạy thay ngày ${leave.session_date}.`,
        leave_id
      ).run();

      return json({ success: true, message: `Đã ${decision === 'accepted' ? 'đồng ý' : 'từ chối'} dạy thay thành công` });
    } catch (e) {
      return json({ success: false, error: `Lỗi cập nhật: ${e.message}` }, { status: 500 });
    }
  }

  // ACTION 3: APPROVE/REJECT LEAVE (Manager/Leader only - 2-Step Workflow Enforced)
  if (action === 'approve_leave' || action === 'admin_decision') {
    if (!manager) {
      return json({ success: false, error: 'Forbidden: Chỉ Leader Cô Dung và Superadmin mới có quyền phê duyệt' }, { status: 403 });
    }

    const { leave_id, decision, admin_notes } = body;
    const targetDecision = (decision === 'approve' || decision === 'approved') ? 'approved' : (decision === 'reject' || decision === 'rejected') ? 'rejected' : null;
    
    if (!leave_id || !targetDecision) {
      return json({ success: false, error: 'Mã đơn hoặc quyết định duyệt không hợp lệ' }, { status: 400 });
    }

    const leave = await db.prepare('SELECT * FROM teacher_leave_requests WHERE id = ?').bind(leave_id).first();
    if (!leave) {
      return json({ success: false, error: 'Không tìm thấy đơn nghỉ' }, { status: 404 });
    }

    // STRICT SERVER ENFORCEMENT: 2-Step Workflow
    // If a substitute teacher was designated, they MUST have accepted before Leader can approve
    if (targetDecision === 'approved' && leave.substitute_teacher_id && leave.substitute_status !== 'accepted') {
      return json({ 
        success: false, 
        error: 'PreconditionFailed: Chưa thể duyệt đơn khi giáo viên dạy thay chưa bấm xác nhận đồng ý nhận ca' 
      }, { status: 400 });
    }

    try {
      await db.prepare(`
        UPDATE teacher_leave_requests 
        SET admin_status = ?, admin_notes = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?;
      `).bind(targetDecision, admin_notes || '', leave_id).run();

      // Notify teacher
      await db.prepare(`
        INSERT INTO system_notifications (id, target_role, target_user_id, title, body, category, reference_id)
        VALUES (?, 'teacher', ?, 'Kết quả duyệt đơn nghỉ phép', ?, 'leave', ?);
      `).bind(
        `notif_${Date.now()}`,
        leave.teacher_id,
        `Đơn xin nghỉ ngày ${leave.session_date} đã được Leader ${decision === 'approved' ? 'DUYỆT' : 'TỪ CHỐI'}. Ghi chú: ${admin_notes || 'Không có'}`,
        leave_id
      ).run();

      return json({ success: true, message: `Đã ${decision === 'approved' ? 'duyệt' : 'từ chối'} đơn nghỉ phép` });
    } catch (e) {
      return json({ success: false, error: `Lỗi duyệt đơn: ${e.message}` }, { status: 500 });
    }
  }

  // ACTION 4: REQUEST SALARY ADVANCE (Teacher or Manager)
  if (action === 'request_salary_advance') {
    const { amount_vnd, reason, billing_cycle } = body;
    const amount = Number(amount_vnd);
    if (!amount || amount <= 0 || amount > 20000000) {
      return json({ success: false, error: 'Số tiền ứng lương không hợp lệ (tối thiểu 100.000đ, tối đa 20.000.000đ)' }, { status: 400 });
    }
    if (!reason || !reason.trim()) {
      return json({ success: false, error: 'Vui lòng nêu rõ lý do ứng lương' }, { status: 400 });
    }

    const cycle = billing_cycle || new Date().toISOString().slice(0, 7); // 'YYYY-MM'
    const advanceId = `adv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    try {
      await db.prepare(`
        INSERT INTO teacher_salary_advances 
        (id, teacher_id, teacher_name, amount_vnd, reason, billing_cycle, status)
        VALUES (?, ?, ?, ?, ?, ?, 'pending');
      `).bind(advanceId, auth.user.id, auth.user.name, amount, reason.trim(), cycle).run();

      // Notify Leader
      await db.prepare(`
        INSERT INTO system_notifications (id, target_role, title, body, category, reference_id)
        VALUES (?, 'leader', 'Yêu cầu ứng lương mới', ?, 'salary', ?);
      `).bind(
        `notif_adv_${Date.now()}`,
        `Thầy/Cô ${auth.user.name} yêu cầu ứng ${amount.toLocaleString('vi-VN')}đ cho kỳ ${cycle}.`,
        advanceId
      ).run();

      return json({ success: true, message: 'Đã gửi yêu cầu ứng lương thành công', advance_id: advanceId });
    } catch (e) {
      return json({ success: false, error: `Lỗi lưu yêu cầu ứng lương: ${e.message}` }, { status: 500 });
    }
  }

  // ACTION 5: APPROVE/REJECT SALARY ADVANCE (Manager only)
  if (action === 'approve_salary_advance') {
    if (!manager) {
      return json({ success: false, error: 'Forbidden: Chỉ Leader/Admin mới có quyền duyệt ứng lương' }, { status: 403 });
    }

    const { advance_id, decision, admin_notes } = body; // 'approved' | 'rejected'
    if (!advance_id || (decision !== 'approved' && decision !== 'rejected')) {
      return json({ success: false, error: 'Quyết định duyệt không hợp lệ' }, { status: 400 });
    }

    const advance = await db.prepare('SELECT * FROM teacher_salary_advances WHERE id = ?').bind(advance_id).first();
    if (!advance) {
      return json({ success: false, error: 'Không tìm thấy yêu cầu ứng lương' }, { status: 404 });
    }

    try {
      await db.prepare(`
        UPDATE teacher_salary_advances 
        SET status = ?, approved_by = ?, approved_at = CURRENT_TIMESTAMP, admin_notes = ?
        WHERE id = ?;
      `).bind(decision, auth.user.name, admin_notes || '', advance_id).run();

      // Notify teacher
      await db.prepare(`
        INSERT INTO system_notifications (id, target_role, target_user_id, title, body, category, reference_id)
        VALUES (?, 'teacher', ?, 'Kết quả duyệt ứng lương', ?, 'salary', ?);
      `).bind(
        `notif_${Date.now()}`,
        advance.teacher_id,
        `Yêu cầu ứng lương ${Number(advance.amount_vnd).toLocaleString('vi-VN')}đ đã được Leader ${decision === 'approved' ? 'DUYỆT' : 'TỪ CHỐI'}.`,
        advance_id
      ).run();

      return json({ success: true, message: `Đã ${decision === 'approved' ? 'duyệt' : 'từ chối'} ứng lương thành công` });
    } catch (e) {
      return json({ success: false, error: `Lỗi duyệt ứng lương: ${e.message}` }, { status: 500 });
    }
  }

  // ACTION 6: MANAGE RECRUITMENT (Manager only)
  if (action === 'create_recruitment' || action === 'update_recruitment') {
    if (!manager) {
      return json({ success: false, error: 'Forbidden: Chỉ Quản lý mới được thao tác tuyển dụng' }, { status: 403 });
    }

    if (action === 'create_recruitment') {
      const { candidate_name, phone, email, role_type, experience_years, certificates, interview_time, interview_notes } = body;
      if (!candidate_name || !phone) {
        return json({ success: false, error: 'Vui lòng cung cấp tên ứng viên và số điện thoại' }, { status: 400 });
      }

      const recId = `rec_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const status = interview_time ? 'interview_scheduled' : 'applied';

      try {
        await db.prepare(`
          INSERT INTO teacher_recruitment 
          (id, candidate_name, phone, email, role_type, experience_years, certificates, status, interview_time, interviewer_name, interview_notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        `).bind(
          recId,
          candidate_name,
          phone,
          email || null,
          role_type || 'lead',
          Number(experience_years) || 0,
          certificates || '',
          status,
          interview_time || null,
          auth.user.name,
          interview_notes || ''
        ).run();

        return json({ success: true, message: 'Đã thêm hồ sơ ứng viên thành công', recruitment_id: recId });
      } catch (e) {
        return json({ success: false, error: `Lỗi lưu hồ sơ tuyển dụng: ${e.message}` }, { status: 500 });
      }
    } else {
      const { id, status, interview_time, interviewer_name, interview_notes, trial_feedback } = body;
      if (!id) {
        return json({ success: false, error: 'Thiếu mã hồ sơ ứng viên' }, { status: 400 });
      }

      try {
        await db.prepare(`
          UPDATE teacher_recruitment 
          SET status = COALESCE(?, status),
              interview_time = COALESCE(?, interview_time),
              interviewer_name = COALESCE(?, interviewer_name),
              interview_notes = COALESCE(?, interview_notes),
              trial_feedback = COALESCE(?, trial_feedback),
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?;
        `).bind(status || null, interview_time || null, interviewer_name || null, interview_notes || null, trial_feedback || null, id).run();

        return json({ success: true, message: 'Đã cập nhật hồ sơ ứng viên' });
      } catch (e) {
        return json({ success: false, error: `Lỗi cập nhật tuyển dụng: ${e.message}` }, { status: 500 });
      }
    }
  }

  return json({ success: false, error: `Hành động không hợp lệ: '${action}'` }, { status: 400 });
}
