import { json } from '@sveltejs/kit';
import { verifyServerAuth, isStaffUser, isManager } from '../../../../lib/server/auth.js';

export const prerender = false;

// salary.manage contract: superadmin, admin, and leader can manage workflows
// (isManager is now the shared helper in lib/server/auth.js — EP-M2)

async function ensurePayrollTable(db) {
  if (!db) return;
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS teacher_payrolls (
        id TEXT PRIMARY KEY,
        teacher_id TEXT NOT NULL,
        billing_cycle TEXT NOT NULL,
        gross_amount INTEGER NOT NULL DEFAULT 0,
        net_amount INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'draft',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `).run();
  } catch (e) {
    console.warn('Could not ensure teacher_payrolls table:', e);
  }
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

async function insertTeacherRecruitment(db, data) {
  let cols = new Set();
  try {
    const info = await db.prepare('PRAGMA table_info(teacher_recruitment);').all();
    const rows = info.results || info || [];
    cols = new Set(rows.map(r => r.name));
  } catch {}

  const fields = ['id'];
  const values = [data.id];

  if (cols.size === 0 || cols.has('full_name')) {
    fields.push('full_name');
    values.push(data.candidate_name);
  }
  if (cols.size === 0 || cols.has('candidate_name')) {
    fields.push('candidate_name');
    values.push(data.candidate_name);
  }
  if (cols.size === 0 || cols.has('phone')) {
    fields.push('phone');
    values.push(data.phone);
  }
  if (cols.size === 0 || cols.has('email')) {
    fields.push('email');
    values.push(data.email || null);
  }
  if (cols.size === 0 || cols.has('role_type')) {
    fields.push('role_type');
    values.push(data.role_type || 'lead');
  }
  if (cols.size === 0 || cols.has('experience_years')) {
    fields.push('experience_years');
    values.push(data.experience_years || 0);
  }
  if (cols.size === 0 || cols.has('certificates')) {
    fields.push('certificates');
    values.push(data.certificates || '');
  }
  if (cols.size === 0 || cols.has('status')) {
    fields.push('status');
    values.push(data.status || 'applied');
  }
  if (cols.has('interview_time') && data.interview_time !== undefined) {
    fields.push('interview_time');
    values.push(data.interview_time || null);
  }
  if (cols.has('interviewer_name') && data.interviewer_name !== undefined) {
    fields.push('interviewer_name');
    values.push(data.interviewer_name || null);
  }
  if (cols.size === 0 || cols.has('interview_notes')) {
    fields.push('interview_notes');
    values.push(data.interview_notes || '');
  }
  for (const [field, value] of [
    ['selected_grades_json', data.selected_grades_json],
    ['selected_subjects_json', data.selected_subjects_json],
    ['interview_preference', data.interview_preference],
    ['availability', data.availability],
    ['cv_link', data.cv_link]
  ]) {
    if (cols.has(field)) {
      fields.push(field);
      values.push(value ?? null);
    }
  }

  const placeholders = fields.map(() => '?').join(', ');
  const sql = `INSERT INTO teacher_recruitment (${fields.join(', ')}) VALUES (${placeholders});`;
  return db.prepare(sql).bind(...values).run();
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
    const {
      candidate_name,
      phone,
      email,
      role_type,
      experience_years,
      certificates,
      selected_grades,
      selected_subjects,
      interview_preference,
      availability,
      cv_link,
      notes
    } = body;

    if (typeof candidate_name !== 'string' || !candidate_name.trim() || candidate_name.length > 150 || typeof phone !== 'string' || !phone.trim() || phone.length > 30) {
      return json({ success: false, error: 'Vui lòng cung cấp họ tên và số điện thoại liên hệ' }, { status: 400 });
    }

    if (!['lead', 'contractor', 'assistant'].includes(role_type || 'lead')) {
      return json({ success: false, error: 'Vị trí ứng tuyển không hợp lệ.' }, { status: 400 });
    }
    if (!Array.isArray(selected_grades) || selected_grades.length === 0 || selected_grades.length > 30 || selected_grades.some(g => typeof g !== 'string' || !g.trim() || g.length > 100)) {
      return json({ success: false, error: 'Vui lòng chọn ít nhất một khối hoặc chứng chỉ hợp lệ.' }, { status: 400 });
    }
    if ((email != null && typeof email !== 'string') || (certificates != null && typeof certificates !== 'string') || (selected_subjects != null && (!Array.isArray(selected_subjects) || selected_subjects.length > 30 || selected_subjects.some(s => typeof s !== 'string' || s.length > 100)))) {
      return json({ success: false, error: 'Thông tin hồ sơ không hợp lệ.' }, { status: 400 });
    }

    const recId = `rec_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const structuredPayload = {
      selected_grades: [...new Set(selected_grades.map(g => g.trim()))],
      selected_subjects: Array.isArray(selected_subjects) ? selected_subjects : [],
      interview_preference: interview_preference || 'online',
      availability: availability || '',
      cv_link: cv_link || '',
      raw_notes: notes || '',
      submitted_at: new Date().toISOString()
    };

    try {
      await insertTeacherRecruitment(db, {
        id: recId,
        candidate_name: candidate_name.trim(),
        phone: phone.trim(),
        email: email ? email.trim() : null,
        role_type: role_type || 'lead',
        experience_years: Number(experience_years) || 0,
        certificates: certificates || '',
        status: 'applied',
        interview_notes: JSON.stringify(structuredPayload),
        selected_grades_json: JSON.stringify(structuredPayload.selected_grades),
        selected_subjects_json: JSON.stringify(structuredPayload.selected_subjects),
        interview_preference: structuredPayload.interview_preference,
        availability: structuredPayload.availability,
        cv_link: structuredPayload.cv_link
      });

      // The application is durable even when notification delivery fails.
      try {
      await db.prepare(`
        INSERT INTO system_notifications (id, target_role, title, body, category, reference_id)
        VALUES (?, 'leader', 'Hồ sơ ứng viên giáo viên mới', ?, 'recruitment', ?);
      `).bind(
        `notif_rec_${Date.now()}`,
        `Ứng viên ${candidate_name} vừa nộp hồ sơ vị trí ${role_type || 'giáo viên'} (Lớp: ${(selected_grades || []).join(', ')}). SĐT: ${phone}`,
        recId
      ).run();
      } catch (notificationError) {
        console.warn('Recruitment saved; leader notification failed:', notificationError);
      }

      return json({
        success: true,
        message: 'Nộp hồ sơ ứng tuyển thành công! Ban quản lý sẽ duyệt hồ sơ và liên hệ cấp tài khoản giảng dạy.',
        recruitment_id: recId,
        selected_grades: structuredPayload.selected_grades
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

    // STRICT IDEMPOTENCY & STATUS CHECK:
    if (leave.admin_status === targetDecision) {
      return json({
        success: true,
        message: `Đơn nghỉ này đã được ${targetDecision === 'approved' ? 'duyệt' : 'từ chối'} trước đó.`,
        already_processed: true
      });
    }
    if (leave.admin_status !== 'pending') {
      return json({
        success: false,
        error: `Đơn xin nghỉ này đã được xử lý trước đó với kết quả '${leave.admin_status}'. Không thể xử lý lại.`
      }, { status: 409 });
    }

    // STRICT 2-STEP WORKFLOW ENFORCEMENT:
    if (targetDecision === 'approved' && leave.substitute_teacher_id && leave.substitute_status !== 'accepted') {
      return json({
        success: false,
        error: 'PreconditionFailed: Chưa thể duyệt đơn khi giáo viên dạy thay chưa bấm xác nhận đồng ý nhận ca'
      }, { status: 400 });
    }

    try {
      if (targetDecision === 'approved' && leave.session_id) {
        // Pre-check session status and ownership
        const session = await db.prepare('SELECT * FROM class_sessions WHERE id = ?').bind(leave.session_id).first();
        if (!session) {
          return json({ success: false, error: 'Không tìm thấy ca học của đơn nghỉ.' }, { status: 404 });
        }
        if (session.status !== 'scheduled' || session.teacher_id !== leave.teacher_id) {
          return json({
            success: false,
            error: `Ca học này đã bị thay đổi hoặc đã được phân công giáo viên khác (trạng thái: ${session.status}).`
          }, { status: 409 });
        }

        // Write-time overlap check for substitute teacher
        if (leave.substitute_teacher_id) {
          const overlap = await db.prepare(`
            SELECT id, class_name, start_time, end_time FROM class_sessions
            WHERE (teacher_id = ? OR substitute_teacher_id = ?)
              AND session_date = ?
              AND id != ?
              AND start_time < ? AND end_time > ?
          `).bind(
            leave.substitute_teacher_id,
            leave.substitute_teacher_id,
            leave.session_date,
            leave.session_id,
            session.end_time,
            session.start_time
          ).first();

          if (overlap) {
            return json({
              success: false,
              error: `Trùng lịch tại thời điểm duyệt: Giáo viên ${leave.substitute_teacher_name || 'dạy thay'} đã có lịch dạy ca '${overlap.class_name}' (${overlap.start_time} - ${overlap.end_time}) ngày ${leave.session_date}.`
            }, { status: 409 });
          }
        }

        // ATOMIC BATCH: Both leave request status and class session must update together in a single transaction
        // Both statements strictly guard on status = 'scheduled' and NOT EXISTS time overlap to eliminate post-commit compensation
        const subId = leave.substitute_teacher_id || '';

        const stmtLeave = subId ? db.prepare(`
          UPDATE teacher_leave_requests
          SET admin_status = ?, admin_notes = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND admin_status = 'pending'
            AND EXISTS (
              SELECT 1 FROM class_sessions
              WHERE id = ? AND teacher_id = ? AND status = 'scheduled'
                AND NOT EXISTS (
                  SELECT 1 FROM class_sessions s2
                  WHERE (s2.teacher_id = ? OR s2.substitute_teacher_id = ?)
                    AND s2.session_date = class_sessions.session_date
                    AND s2.id != class_sessions.id
                    AND s2.status != 'cancelled'
                    AND s2.start_time < class_sessions.end_time
                    AND s2.end_time > class_sessions.start_time
                )
            );
        `).bind(
          targetDecision,
          admin_notes || '',
          leave_id,
          leave.session_id,
          leave.teacher_id,
          subId,
          subId
        ) : db.prepare(`
          UPDATE teacher_leave_requests
          SET admin_status = ?, admin_notes = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND admin_status = 'pending'
            AND EXISTS (
              SELECT 1 FROM class_sessions
              WHERE id = ? AND teacher_id = ? AND status = 'scheduled'
            );
        `).bind(targetDecision, admin_notes || '', leave_id, leave.session_id, leave.teacher_id);
        const stmtSession = subId ? db.prepare(`
          UPDATE class_sessions
          SET substitute_teacher_id = ?,
              substitute_teacher_name = ?,
              substitute_notes = ?,
              status = 'substitute_assigned',
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND teacher_id = ? AND status = 'scheduled'
            AND NOT EXISTS (
              SELECT 1 FROM class_sessions s2
              WHERE (s2.teacher_id = ? OR s2.substitute_teacher_id = ?)
                AND s2.session_date = class_sessions.session_date
                AND s2.id != class_sessions.id
                AND s2.status != 'cancelled'
                AND s2.start_time < class_sessions.end_time
                AND s2.end_time > class_sessions.start_time
            );
        `).bind(
          leave.substitute_teacher_id,
          leave.substitute_teacher_name,
          `Dạy thay cho ${leave.teacher_name} theo đơn ${leave_id}`,
          leave.session_id,
          leave.teacher_id,
          subId,
          subId
        ) : db.prepare(`
          UPDATE class_sessions
          SET status = 'cancelled',
              substitute_notes = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND teacher_id = ? AND status = 'scheduled';
        `).bind(
          `Nghỉ dạy theo đơn ${leave_id} (không có giáo viên thay)`,
          leave.session_id,
          leave.teacher_id
        );

        const batchRes = await db.batch([stmtLeave, stmtSession]);
        if (!batchRes || batchRes[0].meta?.changes !== 1 || batchRes[1].meta?.changes !== 1) {
          // Compensatory reversal ONLY if stmtLeave changed in this execution
          if (batchRes && batchRes[0].meta?.changes === 1) {
            await db.prepare(`
              UPDATE teacher_leave_requests
              SET admin_status = 'pending', admin_notes = 'Tự động hoàn tác: Lỗi phân công ca học', updated_at = CURRENT_TIMESTAMP
              WHERE id = ? AND admin_status = ?;
            `).bind(leave_id, targetDecision).run();
          }

          return json({
            success: false,
            error: 'Không thể phân công ca học: Ca học không tồn tại hoặc đã được phân công trước đó (changes = 0).'
          }, { status: 409 });
        }
      } else {
        const updateLeave = await db.prepare(`
          UPDATE teacher_leave_requests
          SET admin_status = ?, admin_notes = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND admin_status = 'pending';
        `).bind(targetDecision, admin_notes || '', leave_id).run();

        if (!updateLeave || updateLeave.meta?.changes !== 1) {
          return json({ success: false, error: 'Đơn xin nghỉ này đã được xử lý trước đó (changes = 0).' }, { status: 409 });
        }
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
  if (action === 'request_salary_advance' || action === 'request_advance') {
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
  if (action === 'approve_salary_advance' || action === 'advance_decision') {
    if (!manager) {
      return json({ success: false, error: 'Forbidden: Chỉ Leader/Admin mới có quyền duyệt ứng lương' }, { status: 403 });
    }

    const { advance_id, admin_notes } = body;
    let targetDecision = body.decision;
    if (targetDecision === 'approve') targetDecision = 'approved';
    if (targetDecision === 'reject') targetDecision = 'rejected';

    if (!advance_id || (targetDecision !== 'approved' && targetDecision !== 'rejected')) {
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
      `).bind(targetDecision, auth.user.name, admin_notes || '', advance_id).run();

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
        `Yêu cầu ứng ${Number(advance.amount_vnd).toLocaleString('vi-VN')}đ đã được Leader ${targetDecision === 'approved' ? 'DUYỆT HẠN MỨC' : 'TỪ CHỐI'}. Đang chờ Kế toán thực chi.`,
        advance_id
      ).run();

      return json({ success: true, message: `Đã ${targetDecision === 'approved' ? 'duyệt hạn mức' : 'từ chối'} ứng lương` });
    } catch (e) {
      return json({ success: false, error: `Lỗi duyệt ứng lương: ${e.message}` }, { status: 500 });
    }
  }

  // ACTION 6: DISBURSE SALARY ADVANCE (Manager / Finance) - Phase 3: Disbursed (Thực chi)
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

    // STRICT IDEMPOTENCY & STATUS CHECK:
    if (advance.status === 'disbursed') {
      if (disbursement_ref && advance.disbursement_ref && advance.disbursement_ref !== disbursement_ref.trim()) {
        return json({
          success: false,
          error: `Conflict: Khoản ứng lương này đã được thực chi với mã tham chiếu '${advance.disbursement_ref}', không thể thực chi lại với mã khác '${disbursement_ref.trim()}'.`
        }, { status: 409 });
      }
      return json({ success: true, message: 'Đơn ứng lương này đã được thực chi trước đó.', already_processed: true });
    }
    if (advance.status !== 'approved') {
      return json({ success: false, error: `Đơn ứng lương đang ở trạng thái '${advance.status}', chỉ có thể thực chi khi đã 'approved'.` }, { status: 409 });
    }

    const txId = `tx_disb_${advance_id}`;
    const hasRealBankProof = Boolean(disbursement_ref && disbursement_ref.trim() !== '');
    const refCode = hasRealBankProof ? disbursement_ref.trim() : `SYS_INTERNAL_${Date.now().toString().slice(-6)}`;
    const voucherType = hasRealBankProof ? 'bank_transfer_receipt' : 'internal_system_memo';

    try {
      const stmt1 = db.prepare(`
        UPDATE teacher_salary_advances
        SET status = 'disbursed', disbursed_at = CURRENT_TIMESTAMP, disbursed_by = ?, disbursement_ref = ?
        WHERE id = ? AND status = 'approved'
          AND (SELECT COUNT(*) FROM salary_transactions WHERE transaction_type = 'advance_disbursed' AND ref_id = ?) = 0;
      `).bind(auth.user.name, refCode, advance_id, advance_id);

      const stmt2 = db.prepare(`
        INSERT INTO salary_transactions
        (id, teacher_id, teacher_name, transaction_type, amount_vnd, billing_cycle, status, ref_id, notes, created_by)
        SELECT ?, teacher_id, teacher_name, 'advance_disbursed', amount_vnd, billing_cycle, 'completed', id, ?, ?
        FROM teacher_salary_advances
        WHERE id = ? AND status = 'disbursed' AND disbursement_ref = ?
          AND (SELECT COUNT(*) FROM salary_transactions WHERE transaction_type = 'advance_disbursed' AND ref_id = ?) = 0;
      `).bind(
        txId,
        notes || `Thực chi chuyển khoản mã ${refCode}`,
        auth.user.name,
        advance_id,
        refCode,
        advance_id
      );

      const batchRes = await db.batch([stmt1, stmt2]);

      if (!batchRes || batchRes[0].meta?.changes !== 1 || batchRes[1].meta?.changes !== 1) {
        // Compensatory rollback ONLY if stmt1 changed in this execution
        if (batchRes && batchRes[0].meta?.changes === 1) {
          await db.prepare(`
            UPDATE teacher_salary_advances
            SET status = 'approved', disbursed_at = NULL, disbursed_by = NULL, disbursement_ref = NULL, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND status = 'disbursed';
          `).bind(advance_id).run();
        }

        return json({
          success: false,
          error: `Thực chi thất bại: Giao dịch kế toán không thể ghi sổ (changes = 0). Đã tự động hoàn tác.`
        }, { status: 409 });
      }

      // STEP 3: Notify teacher
      await db.prepare(`
        INSERT INTO system_notifications (id, target_role, target_user_id, title, body, category, reference_id)
        VALUES (?, 'teacher', ?, 'Kế toán đã thực chi ứng lương', ?, 'salary', ?);
      `).bind(
        `notif_${Date.now()}`,
        advance.teacher_id,
        `Khoản ứng lương ${Number(advance.amount_vnd).toLocaleString('vi-VN')}đ đã được thực chi (Số lệnh: ${refCode}). Khoản này sẽ được đối trừ khi quyết toán bảng lương kỳ ${advance.billing_cycle}.`,
        advance_id
      ).run();

      return json({
        success: true,
        message: 'Đã thực hiện chi ứng lương và ghi sổ kế toán thành công',
        transaction_id: txId,
        disbursement_ref: refCode,
        voucher_type: voucherType,
        is_bank_voucher: hasRealBankProof
      });
    } catch (e) {
      return json({ success: false, error: `Lỗi thực chi: ${e.message}` }, { status: 500 });
    }
  }

  // ACTION 7: DEDUCT SALARY ADVANCE (Payroll Engine / Manager) - Phase 4: Deducted (Đối trừ)
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

    await ensurePayrollTable(db);
    const payroll = await db.prepare('SELECT id, teacher_id, billing_cycle, status FROM teacher_payrolls WHERE id = ?').bind(payroll_id).first();
    if (!payroll) {
      return json({ success: false, error: `NotFound: Không tìm thấy bảng lương '${payroll_id}'.` }, { status: 404 });
    }
    if (payroll.teacher_id !== advance.teacher_id) {
      return json({ success: false, error: `Forbidden: Bảng lương '${payroll_id}' thuộc về giáo viên '${payroll.teacher_id}', không khớp với giáo viên của khoản ứng '${advance.teacher_id}'.` }, { status: 400 });
    }
    if (payroll.billing_cycle !== advance.billing_cycle) {
      return json({ success: false, error: `Mismatch: Kỳ lương của bảng lương (${payroll.billing_cycle}) không khớp với kỳ lương của khoản ứng (${advance.billing_cycle}).` }, { status: 400 });
    }
    if (payroll.status === 'locked' || payroll.status === 'closed' || payroll.status === 'paid') {
      return json({ success: false, error: `Forbidden: Bảng lương '${payroll_id}' đã bị khóa hoặc thanh toán (${payroll.status}), không thể đối trừ thêm khoản tạm ứng.` }, { status: 409 });
    }

    // STRICT IDEMPOTENCY & STATUS CHECK:
    if (advance.status === 'deducted') {
      if (advance.deducted_payroll_id === payroll_id) {
        return json({ success: true, message: 'Khoản ứng lương này đã được đối trừ vào bảng lương này trước đó.', already_processed: true });
      } else {
        return json({
          success: false,
          error: `Conflict: Khoản ứng lương này đã được đối trừ trước đó vào bảng lương '${advance.deducted_payroll_id}', không thể đối trừ vào bảng lương khác '${payroll_id}'.`
        }, { status: 409 });
      }
    }
    if (advance.status !== 'disbursed') {
      return json({ success: false, error: `Khoản ứng lương đang ở trạng thái '${advance.status}', chỉ có thể đối trừ khi đã 'disbursed'.` }, { status: 409 });
    }

    const txId = `tx_ded_${advance_id}_${payroll_id}`;

    try {
      const stmt1 = db.prepare(`
        UPDATE teacher_salary_advances
        SET status = 'deducted', deducted_at = CURRENT_TIMESTAMP, deducted_payroll_id = ?
        WHERE id = ? AND status = 'disbursed'
          AND EXISTS (
            SELECT 1 FROM teacher_payrolls p
            WHERE p.id = ? AND p.teacher_id = ? AND p.billing_cycle = ?
              AND p.status NOT IN ('locked', 'closed', 'paid')
          )
          AND (SELECT COUNT(*) FROM salary_transactions WHERE transaction_type = 'advance_deduction' AND ref_id = ?) = 0;
      `).bind(payroll_id, advance_id, payroll_id, advance.teacher_id, advance.billing_cycle, advance_id);

      const stmt2 = db.prepare(`
        INSERT INTO salary_transactions
        (id, teacher_id, teacher_name, transaction_type, amount_vnd, billing_cycle, status, ref_id, notes, created_by)
        SELECT ?, teacher_id, teacher_name, 'advance_deduction', amount_vnd, ?, 'completed', id, ?, ?
        FROM teacher_salary_advances
        WHERE id = ? AND status = 'deducted' AND deducted_payroll_id = ?
          AND (SELECT COUNT(*) FROM salary_transactions WHERE transaction_type = 'advance_deduction' AND ref_id = ?) = 0;
      `).bind(
        txId,
        advance.billing_cycle,
        `Đối trừ quyết toán vào bảng lương ${payroll_id}`,
        auth.user.name,
        advance_id,
        payroll_id,
        advance_id
      );

      const batchRes = await db.batch([stmt1, stmt2]);

      if (!batchRes || batchRes[0].meta?.changes !== 1 || batchRes[1].meta?.changes !== 1) {
        // Compensatory rollback ONLY if stmt1 changed in this execution
        if (batchRes && batchRes[0].meta?.changes === 1) {
          await db.prepare(`
            UPDATE teacher_salary_advances
            SET status = 'disbursed', deducted_at = NULL, deducted_payroll_id = NULL, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND status = 'deducted';
          `).bind(advance_id).run();
        }

        return json({
          success: false,
          error: 'Không thể đối trừ: Giao dịch quyết toán không thể ghi sổ (changes = 0). Đã tự động hoàn tác.'
        }, { status: 409 });
      }

      return json({ success: true, message: 'Đã đối trừ khoản ứng lương thành công', transaction_id: txId });
    } catch (e) {
      return json({ success: false, error: `Lỗi đối trừ: ${e.message}` }, { status: 500 });
    }
  }

  // ACTION 8: MANAGE RECRUITMENT & INTERVIEWS (Manager only)
  if (action === 'create_recruitment' || action === 'update_recruitment' || action === 'upsert_recruitment') {
    if (!manager) {
      return json({ success: false, error: 'Forbidden: Chỉ Quản lý mới được thao tác tuyển dụng' }, { status: 403 });
    }

    const isCreate = action === 'create_recruitment' || (action === 'upsert_recruitment' && !body.id);

    if (isCreate) {
      const { candidate_name, phone, email, role_type, position_type, experience_years, certificates, interview_time, interview_notes, cv_link, notes } = body;
      if (typeof candidate_name !== 'string' || !candidate_name.trim() || candidate_name.length > 150 || typeof phone !== 'string' || !phone.trim() || phone.length > 30) {
        return json({ success: false, error: 'Vui lòng cung cấp tên ứng viên và số điện thoại' }, { status: 400 });
      }

      const recId = `rec_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const status = interview_time ? 'interview_scheduled' : 'applied';
      const resolvedRoleType = role_type || position_type || 'lead';
      const combinedNotes = [notes, cv_link ? `Link CV: ${cv_link}` : null, interview_notes].filter(Boolean).join('\n');

      try {
        await insertTeacherRecruitment(db, {
          id: recId,
          candidate_name: candidate_name.trim(),
          phone: phone.trim(),
          email: email || null,
          role_type: resolvedRoleType,
          experience_years: Number(experience_years) || 0,
          certificates: certificates || '',
          status,
          interview_time: interview_time || null,
          interviewer_name: auth.user.name,
          interview_notes: combinedNotes
        });

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
