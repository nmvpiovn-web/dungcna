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
  const type = url.searchParams.get('type') || 'all'; // 'leaves' | 'advances' | 'recruitment' | 'transactions' | 'sessions' | 'all'

  try {
    let leaves = [];
    let advances = [];
    let recruitment = [];
    let transactions = [];
    let sessions = [];

    // 1. Fetch Leaves & Substitute Requests
    if (type === 'all' || type === 'leaves') {
      if (manager) {
        const res = await db.prepare(`
          SELECT * FROM teacher_leave_requests ORDER BY created_at DESC;
        `).all();
        leaves = res.results || [];
      } else {
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

    // 4. Fetch Salary Transactions Ledger
    if (type === 'all' || type === 'transactions') {
      if (manager) {
        const res = await db.prepare(`
          SELECT * FROM salary_transactions ORDER BY created_at DESC LIMIT 100;
        `).all();
        transactions = res.results || [];
      } else {
        const res = await db.prepare(`
          SELECT * FROM salary_transactions WHERE teacher_id = ? ORDER BY created_at DESC LIMIT 50;
        `).bind(auth.user.id).all();
        transactions = res.results || [];
      }
    }

    // 5. Fetch Class Sessions (Substitute & Actual Teaching Roster)
    if (type === 'all' || type === 'sessions') {
      if (manager) {
        const res = await db.prepare(`
          SELECT * FROM class_sessions ORDER BY session_date DESC, start_time ASC LIMIT 100;
        `).all();
        sessions = res.results || [];
      } else {
        const res = await db.prepare(`
          SELECT * FROM class_sessions 
          WHERE teacher_id = ? OR substitute_teacher_id = ?
          ORDER BY session_date DESC, start_time ASC LIMIT 50;
        `).bind(auth.user.id, auth.user.id).all();
        sessions = res.results || [];
      }
    }

    return json({
      success: true,
      manager,
      leaves,
      advances,
      recruitment,
      transactions,
      sessions
    });
  } catch (err) {
    console.error('Error fetching teacher workflows:', err);
    return json({ success: false, error: 'DatabaseError: Lỗi khi truy vấn dữ liệu nghiệp vụ giáo viên' }, { status: 500 });
  }
}

export async function POST({ request, platform }) {
  let body = {};
  try {
    body = await request.json();
  } catch {
    return json({ success: false, error: 'InvalidJSON: Payload yêu cầu đúng định dạng JSON' }, { status: 400 });
  }

  if (!platform?.env?.DB) {
    return json({ success: false, error: 'DatabaseUnavailable: Cloudflare D1 không khả dụng' }, { status: 500 });
  }

  const db = platform.env.DB;
  const action = body.action;

  // PUBLIC ACTION: CANDIDATE JOB APPLICATION (Does not require staff login)
  if (action === 'candidate_apply' || action === 'apply_job') {
    const { candidate_name, phone, email, role_type, experience_years, certificates, notes } = body;
    if (!candidate_name || !phone) {
      return json({ success: false, error: 'Vui lòng cung cấp họ tên và số điện thoại liên hệ' }, { status: 400 });
    }

    const recId = `rec_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    try {
      await db.prepare(`
        INSERT INTO teacher_recruitment 
        (id, candidate_name, phone, email, role_type, experience_years, certificates, status, interview_notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'applied', ?);
      `).bind(
        recId,
        candidate_name.trim(),
        phone.trim(),
        email ? email.trim() : null,
        role_type || 'lead',
        Number(experience_years) || 0,
        certificates || '',
        notes || 'Hồ sơ nộp trực tuyến qua cổng tuyển dụng'
      ).run();

      // Notify Leader of new applicant
      await db.prepare(`
        INSERT INTO system_notifications (id, target_role, title, body, category, reference_id)
        VALUES (?, 'leader', 'Hồ sơ ứng viên giáo viên mới', ?, 'recruitment', ?);
      `).bind(
        `notif_rec_${Date.now()}`,
        `Ứng viên ${candidate_name} vừa nộp hồ sơ vị trí ${role_type || 'giáo viên'}. SĐT: ${phone}`,
        recId
      ).run();

      return json({
        success: true,
        message: 'Nộp hồ sơ ứng tuyển thành công! Ban Quản Lý Tiếng Anh Cô Dung sẽ liên hệ phỏng vấn trong vòng 48h.',
        recruitment_id: recId
      });
    } catch (e) {
      return json({ success: false, error: `Lỗi ghi nhận hồ sơ: ${e.message}` }, { status: 500 });
    }
  }

  // ALL OTHER ACTIONS REQUIRE AUTHENTICATION & STAFF ROLE
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) {
    return json({ success: false, error: auth.error || 'Unauthorized: Yêu cầu đăng nhập' }, { status: auth.status || 401 });
  }
  if (!isStaffUser(auth.user)) {
    return json({ success: false, error: 'Forbidden: Thao tác chỉ dành cho nhân sự' }, { status: 403 });
  }

  const manager = isManager(auth.user);

  // ACTION 1: REQUEST LEAVE (Single Session Bound & Time Overlap Check)
  if (action === 'request_leave') {
    const { session_id, reason, substitute_teacher_id, substitute_teacher_name } = body;
    if (!session_id || !reason) {
      return json({ success: false, error: 'Vui lòng chọn ca học cụ thể (session_id) và nêu rõ lý do' }, { status: 400 });
    }

    // Verify session existence and teacher ownership
    const session = await db.prepare('SELECT id, class_name, teacher_id, teacher_name, session_date, start_time, end_time FROM class_sessions WHERE id = ?').bind(session_id).first();
    if (!session) {
      return json({ success: false, error: 'NotFound: Không tìm thấy ca học tương ứng' }, { status: 404 });
    }
    if (session.teacher_id !== auth.user.id && !manager) {
      return json({ success: false, error: 'Forbidden: Bạn chỉ có thể làm đơn xin nghỉ ca dạy của chính mình' }, { status: 403 });
    }

    const sessionDate = session.session_date;

    // Time-Interval Conflict Check: Overlap occurs if startA < endB AND endA > startB
    if (substitute_teacher_id) {
      const conflictRes = await db.prepare(`
        SELECT id, class_name, start_time, end_time FROM class_sessions 
        WHERE (teacher_id = ? OR substitute_teacher_id = ?) 
          AND session_date = ? 
          AND status != 'cancelled'
          AND start_time < ? 
          AND end_time > ?;
      `).bind(substitute_teacher_id, substitute_teacher_id, sessionDate, session.end_time, session.start_time).all();

      if (conflictRes?.results && conflictRes.results.length > 0) {
        const c = conflictRes.results[0];
        return json({
          success: false,
          error: `Trùng lịch: Giáo viên ${substitute_teacher_name || 'được chọn'} đã có lịch dạy lớp '${c.class_name}' trùng giờ (${c.start_time} - ${c.end_time}) vào ngày ${sessionDate}.`
        }, { status: 409 });
      }
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
        session.teacher_id,
        session.teacher_name,
        session_id,
        sessionDate,
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
          `Thầy/Cô ${session.teacher_name} đề nghị bạn dạy thay lớp ${session.class_name} vào ca ngày ${sessionDate} (${session.start_time} - ${session.end_time}).`,
          leaveId
        ).run();
      }

      // Notify Leader/Admin
      await db.prepare(`
        INSERT INTO system_notifications (id, target_role, title, body, category, reference_id)
        VALUES (?, 'leader', 'Đơn xin nghỉ ca mới', ?, 'leave', ?);
      `).bind(
        `notif_l_${Date.now()}`,
        `Giáo viên ${session.teacher_name} vừa nộp đơn xin nghỉ ca ${session.class_name} ngày ${sessionDate}.`,
        leaveId
      ).run();

      return json({ success: true, message: 'Đã gửi đơn xin nghỉ thành công', leave_id: leaveId });
    } catch (e) {
      return json({ success: false, error: `Lỗi lưu đơn xin nghỉ: ${e.message}` }, { status: 500 });
    }
  }

  // ACTION 2: RESPOND TO SUBSTITUTE REQUEST
  if (action === 'respond_substitute') {
    const { leave_id, decision } = body; // 'accepted' | 'declined'
    if (!leave_id || (decision !== 'accepted' && decision !== 'declined')) {
      return json({ success: false, error: 'Thiếu mã đơn hoặc quyết định không hợp lệ' }, { status: 400 });
    }

    const leave = await db.prepare('SELECT * FROM teacher_leave_requests WHERE id = ?').bind(leave_id).first();
    if (!leave) {
      return json({ success: false, error: 'Không tìm thấy đơn xin nghỉ' }, { status: 404 });
    }

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

  // ACTION 3: APPROVE/REJECT LEAVE (Atomic Batch Update of Leave & Single Class Session)
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

    // STRICT 2-STEP WORKFLOW ENFORCEMENT:
    if (targetDecision === 'approved' && leave.substitute_teacher_id && leave.substitute_status !== 'accepted') {
      return json({ 
        success: false, 
        error: 'PreconditionFailed: Chưa thể duyệt đơn khi giáo viên dạy thay chưa bấm xác nhận đồng ý nhận ca' 
      }, { status: 400 });
    }

    try {
      const batchStmts = [
        db.prepare(`
          UPDATE teacher_leave_requests 
          SET admin_status = ?, admin_notes = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND admin_status = 'pending';
        `).bind(targetDecision, admin_notes || '', leave_id)
      ];

      // Update EXACT single class session bound to this leave request
      if (targetDecision === 'approved' && leave.session_id && leave.substitute_teacher_id) {
        batchStmts.push(
          db.prepare(`
            UPDATE class_sessions 
            SET substitute_teacher_id = ?, 
                substitute_teacher_name = ?, 
                substitute_notes = ?,
                status = 'substitute_assigned',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND teacher_id = ?;
          `).bind(
            leave.substitute_teacher_id,
            leave.substitute_teacher_name,
            `Dạy thay cho ${leave.teacher_name} theo đơn ${leave_id}`,
            leave.session_id,
            leave.teacher_id
          )
        );
      }

      const batchRes = await db.batch(batchStmts);
      if (!batchRes || batchRes[0].meta?.changes !== 1) {
        return json({ success: false, error: 'Đơn xin nghỉ này đã được xử lý trước đó.' }, { status: 409 });
      }

      // Notify teacher
      await db.prepare(`
        INSERT INTO system_notifications (id, target_role, target_user_id, title, body, category, reference_id)
        VALUES (?, 'teacher', ?, 'Kết quả duyệt đơn nghỉ phép', ?, 'leave', ?);
      `).bind(
        `notif_${Date.now()}`,
        leave.teacher_id,
        `Đơn xin nghỉ ngày ${leave.session_date} đã được Leader ${targetDecision === 'approved' ? 'DUYỆT' : 'TỪ CHỐI'}.`,
        leave_id
      ).run();

      return json({
        success: true,
        message: `Đã ${targetDecision === 'approved' ? 'duyệt' : 'từ chối'} đơn nghỉ phép và cập nhật phân công ca học thành công.`
      });
    } catch (e) {
      return json({ success: false, error: `Lỗi duyệt đơn: ${e.message}` }, { status: 500 });
    }
  }

  // ACTION 4: REQUEST SALARY ADVANCE (Teacher or Manager) - Phase 1: Pending
  if (action === 'request_salary_advance') {
    const { amount_vnd, reason, billing_cycle } = body;
    const amount = Number(amount_vnd);
    if (!amount || amount <= 0 || amount > 20000000) {
      return json({ success: false, error: 'Số tiền ứng lương không hợp lệ (tối thiểu 100.000đ, tối đa 20.000.000đ)' }, { status: 400 });
    }
    if (!reason || !reason.trim()) {
      return json({ success: false, error: 'Vui lòng nêu rõ lý do ứng lương' }, { status: 400 });
    }

    const cycle = billing_cycle || new Date().toISOString().slice(0, 7);
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

  // ACTION 5: APPROVE/REJECT SALARY ADVANCE (Leader only) - Phase 2: Approved
  if (action === 'approve_salary_advance') {
    if (!manager) {
      return json({ success: false, error: 'Forbidden: Chỉ Leader/Admin mới có quyền duyệt ứng lương' }, { status: 403 });
    }

    const { advance_id, decision, admin_notes } = body;
    if (!advance_id || (decision !== 'approved' && decision !== 'rejected')) {
      return json({ success: false, error: 'Quyết định duyệt không hợp lệ' }, { status: 400 });
    }

    const advance = await db.prepare('SELECT * FROM teacher_salary_advances WHERE id = ?').bind(advance_id).first();
    if (!advance) {
      return json({ success: false, error: 'Không tìm thấy yêu cầu ứng lương' }, { status: 404 });
    }

    try {
      // Must be pending! Cannot approve an already disbursed or deducted advance!
      const updateRes = await db.prepare(`
        UPDATE teacher_salary_advances 
        SET status = ?, approved_by = ?, approved_at = CURRENT_TIMESTAMP, admin_notes = ?
        WHERE id = ? AND status = 'pending';
      `).bind(decision, auth.user.name, admin_notes || '', advance_id).run();

      if (!updateRes || updateRes.meta?.changes !== 1) {
        return json({ success: false, error: 'Không thể duyệt: Đơn ứng lương không ở trạng thái pending hoặc đã được xử lý.' }, { status: 409 });
      }

      // Notify teacher
      await db.prepare(`
        INSERT INTO system_notifications (id, target_role, target_user_id, title, body, category, reference_id)
        VALUES (?, 'teacher', ?, 'Hạn mức ứng lương được duyệt', ?, 'salary', ?);
      `).bind(
        `notif_${Date.now()}`,
        advance.teacher_id,
        `Yêu cầu ứng ${Number(advance.amount_vnd).toLocaleString('vi-VN')}đ đã được Leader ${decision === 'approved' ? 'DUYỆT HẠN MỨC' : 'TỪ CHỐI'}. Đang chờ Kế toán thực chi.`,
        advance_id
      ).run();

      return json({ success: true, message: `Đã ${decision === 'approved' ? 'duyệt hạn mức' : 'từ chối'} ứng lương` });
    } catch (e) {
      return json({ success: false, error: `Lỗi duyệt ứng lương: ${e.message}` }, { status: 500 });
    }
  }

  // ACTION 6: DISBURSE SALARY ADVANCE (Manager / Finance) - Phase 3: Disbursed (Thực chi) - ATOMIC BATCH
  if (action === 'disburse_salary_advance') {
    if (!manager) {
      return json({ success: false, error: 'Forbidden: Chỉ Ban Quản Lý / Kế toán mới có quyền thực chi' }, { status: 403 });
    }

    const { advance_id, disbursement_ref, notes } = body;
    if (!advance_id) {
      return json({ success: false, error: 'Thiếu mã yêu cầu ứng lương (advance_id)' }, { status: 400 });
    }

    const advance = await db.prepare('SELECT * FROM teacher_salary_advances WHERE id = ?').bind(advance_id).first();
    if (!advance) {
      return json({ success: false, error: 'Không tìm thấy yêu cầu ứng lương' }, { status: 404 });
    }

    const txId = `tx_disb_${advance_id}`;
    const refCode = disbursement_ref || `UNC_${Date.now().toString().slice(-6)}`;

    try {
      // ATOMIC TRANSACTION BATCH:
      // 1. Advance MUST be in 'approved' status to be disbursed!
      const updateStmt = db.prepare(`
        UPDATE teacher_salary_advances 
        SET status = 'disbursed', disbursed_at = CURRENT_TIMESTAMP, disbursed_by = ?, disbursement_ref = ?
        WHERE id = ? AND status = 'approved';
      `).bind(auth.user.name, refCode, advance_id);

      // 2. Append to financial transactions ledger
      const ledgerStmt = db.prepare(`
        INSERT INTO salary_transactions 
        (id, teacher_id, teacher_name, transaction_type, amount_vnd, billing_cycle, status, ref_id, notes, created_by)
        VALUES (?, ?, ?, 'advance_disbursed', ?, ?, 'completed', ?, ?, ?);
      `).bind(
        txId,
        advance.teacher_id,
        advance.teacher_name,
        advance.amount_vnd,
        advance.billing_cycle,
        advance_id,
        notes || `Thực chi chuyển khoản mã ${refCode}`,
        auth.user.name
      );

      const batchRes = await db.batch([updateStmt, ledgerStmt]);
      if (!batchRes || batchRes[0].meta?.changes !== 1) {
        return json({
          success: false,
          error: `Thực chi thất bại: Đơn ứng lương đang ở trạng thái '${advance.status}', chỉ có thể chi khi đã 'approved' và chưa từng thực chi.`
        }, { status: 409 });
      }

      // 3. Notify teacher
      await db.prepare(`
        INSERT INTO system_notifications (id, target_role, target_user_id, title, body, category, reference_id)
        VALUES (?, 'teacher', ?, 'Kế toán đã thực chi ứng lương', ?, 'salary', ?);
      `).bind(
        `notif_${Date.now()}`,
        advance.teacher_id,
        `Khoản ứng lương ${Number(advance.amount_vnd).toLocaleString('vi-VN')}đ đã được thực chi (Số lệnh: ${refCode}). Khoản này sẽ được đối trừ khi quyết toán bảng lương kỳ ${advance.billing_cycle}.`,
        advance_id
      ).run();

      return json({ success: true, message: 'Đã thực hiện chi ứng lương và ghi sổ kế toán thành công', transaction_id: txId, disbursement_ref: refCode });
    } catch (e) {
      return json({ success: false, error: `Lỗi thực chi: ${e.message}` }, { status: 500 });
    }
  }

  // ACTION 7: DEDUCT SALARY ADVANCE (Payroll Engine / Manager) - Phase 4: Deducted (Đối trừ) - ATOMIC BATCH
  if (action === 'deduct_salary_advance') {
    if (!manager) {
      return json({ success: false, error: 'Forbidden: Thao tác quyết toán chỉ dành cho Ban Quản Lý' }, { status: 403 });
    }

    const { advance_id, payroll_id } = body;
    if (!advance_id || !payroll_id) {
      return json({ success: false, error: 'Thiếu advance_id hoặc payroll_id kỳ lương quyết toán' }, { status: 400 });
    }

    const advance = await db.prepare('SELECT * FROM teacher_salary_advances WHERE id = ?').bind(advance_id).first();
    if (!advance) {
      return json({ success: false, error: 'Không tìm thấy yêu cầu ứng lương' }, { status: 404 });
    }

    const txId = `tx_ded_${advance_id}_${payroll_id}`;

    try {
      // ATOMIC TRANSACTION BATCH:
      // 1. Advance MUST be in 'disbursed' status! If changes !== 1, fail closed!
      const updateStmt = db.prepare(`
        UPDATE teacher_salary_advances 
        SET status = 'deducted', deducted_at = CURRENT_TIMESTAMP, deducted_payroll_id = ?
        WHERE id = ? AND status = 'disbursed';
      `).bind(payroll_id, advance_id);

      // 2. Insert into ledger (has UNIQUE constraint on transaction_type, ref_id)
      const ledgerStmt = db.prepare(`
        INSERT INTO salary_transactions 
        (id, teacher_id, teacher_name, transaction_type, amount_vnd, billing_cycle, status, ref_id, notes, created_by)
        VALUES (?, ?, ?, 'advance_deducted', ?, ?, 'completed', ?, ?, ?);
      `).bind(
        txId,
        advance.teacher_id,
        advance.teacher_name,
        advance.amount_vnd,
        advance.billing_cycle,
        advance_id,
        `Đối trừ quyết toán vào bảng lương ${payroll_id}`,
        auth.user.name
      );

      const batchRes = await db.batch([updateStmt, ledgerStmt]);
      // STRICT CHECK: Ensure update statement actually changed 1 row!
      if (!batchRes || batchRes[0].meta?.changes !== 1) {
        return json({
          success: false,
          error: 'Không thể đối trừ: Khoản ứng lương này đã được đối trừ trước đó hoặc chưa được thực chi (changes = 0).'
        }, { status: 409 });
      }

      return json({ success: true, message: 'Đã đối trừ khoản ứng lương thành công', transaction_id: txId });
    } catch (e) {
      return json({ success: false, error: `Lỗi đối trừ: ${e.message}` }, { status: 500 });
    }
  }

  // ACTION 8: MANAGE RECRUITMENT & INTERVIEWS (Manager only)
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
          candidate_name.trim(),
          phone.trim(),
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
