import { json } from '@sveltejs/kit';
import { verifyServerAuth, isStaffUser, SUPERADMIN_USERNAMES } from '$lib/server/auth.js';
import { getAllTuitionBills, saveTuitionBill, dispatchBotReport } from '$lib/unifiedStore';

export const prerender = false;

function isManager(user) {
  if (!user) return false;
  return user.role === 'superadmin' || user.role === 'leader' || SUPERADMIN_USERNAMES.includes(user.username);
}

export async function GET({ url, request, platform }) {
  // 1. Verify Authentication
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) {
    return json({
      success: false,
      error: auth.error || 'Unauthorized: Vui lòng đăng nhập để tra cứu học phí'
    }, { status: auth.status || 401 });
  }

  const user = auth.user;
  const requestedStudentId = url.searchParams.get('student_id');

  // 2. Cloudflare D1 Authoritative Path (Fail-Closed)
  if (platform?.env?.DB) {
    const db = platform.env.DB;
    try {
      let allowedStudentId = null;

      if (isStaffUser(user)) {
        // Staff can inspect any student or all students
        allowedStudentId = requestedStudentId;
      } else if (user.role === 'student') {
        // Student can ONLY access their own bills
        if (requestedStudentId && requestedStudentId !== user.id) {
          return json({
            success: false,
            error: 'Forbidden: Học sinh chỉ có quyền xem phiếu báo học phí của chính mình'
          }, { status: 403 });
        }
        allowedStudentId = user.id;
      } else if (user.role === 'parent') {
        // Parent: Validate authorized children strictly from D1 parent_student_links / users
        const linksRes = await db.prepare(`
          SELECT student_user_id FROM parent_student_links 
          WHERE parent_user_id = ? OR (parent_phone = ? AND parent_phone IS NOT NULL AND parent_phone != '');
        `).bind(user.id, user.phone || '').all();

        const studentUsersRes = await db.prepare(`
          SELECT id FROM users 
          WHERE role = 'student' AND (parent_phone = ? OR parent_name = ?);
        `).bind(user.phone || 'NONE', user.name || 'NONE').all();

        const linkedStudentIds = new Set();
        (linksRes?.results || []).forEach(r => linkedStudentIds.add(r.student_user_id));
        (studentUsersRes?.results || []).forEach(r => linkedStudentIds.add(r.id));

        if (requestedStudentId) {
          if (!linkedStudentIds.has(requestedStudentId) && requestedStudentId !== user.id) {
            return json({
              success: false,
              error: 'Forbidden: Quý phụ huynh chỉ có quyền xem học phí của con em mình'
            }, { status: 403 });
          }
          allowedStudentId = requestedStudentId;
        } else {
          // If no specific child requested, verify if parent has any verified child links
          if (linkedStudentIds.size === 0 && !user.phone) {
            // Strict Fail-Closed: Unlinked parent with no phone sees nothing
            return json({ success: true, total: 0, bills: [], source: 'fail_closed_unlinked_parent' });
          }
        }
      }

      // Query D1 tuition_bills
      let query = 'SELECT * FROM tuition_bills';
      let params = [];

      if (allowedStudentId) {
        query += ' WHERE student_id = ?';
        params.push(allowedStudentId);
      } else if (user.role === 'parent') {
        if (user.phone) {
          query += ' WHERE parent_phone = ?';
          params.push(user.phone);
        } else {
          query += ' WHERE 1 = 0'; // Fail-closed
        }
      }

      query += ' ORDER BY created_at DESC';

      const d1Res = await db.prepare(query).bind(...params).all();
      return json({
        success: true,
        total: (d1Res?.results || []).length,
        bills: d1Res?.results || [],
        source: 'cloudflare_d1'
      });
    } catch (d1Err) {
      console.error('Critical D1 Tuition Query Error:', d1Err);
      // STRICT FAIL-CLOSED: No fallback to mock/local store in production environment
      return json({
        success: false,
        error: `DatabaseError: Lỗi truy vấn cơ sở dữ liệu học phí D1 (${d1Err.message})`
      }, { status: 500 });
    }
  }

  // 3. Development Fallback (Only active when platform.env.DB is completely missing in local dev)
  let bills = getAllTuitionBills();
  if (requestedStudentId) {
    bills = bills.filter(b => b.student_id === requestedStudentId);
  } else if (user.role === 'parent') {
    if (user.phone) {
      bills = bills.filter(b => b.parent_phone === user.phone);
    } else {
      bills = [];
    }
  }

  return json({
    success: true,
    total: bills.length,
    bills,
    source: 'local_store_dev'
  });
}

export async function POST({ request, platform }) {
  // 1. Verify Authentication & Role
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) {
    return json({
      success: false,
      error: auth.error || 'Unauthorized: Vui lòng đăng nhập để lập phiếu học phí'
    }, { status: auth.status || 401 });
  }

  if (!isStaffUser(auth.user)) {
    return json({
      success: false,
      error: 'Forbidden: Chỉ Giáo viên hoặc Ban Quản Lý mới có quyền lập hoặc chỉnh sửa phiếu học phí'
    }, { status: 403 });
  }

  const manager = isManager(auth.user);

  try {
    const body = await request.json();
    if (!body.student_name || !body.base_tuition_vnd) {
      return json({ success: false, error: 'Thiếu thông tin học sinh hoặc mức học phí gốc' }, { status: 400 });
    }

    // 2. Calculate discount with formula: 100 stars = 1,000 VND
    const starsDeducted = Number(body.stars_deducted) || 0;
    const discountVnd = Math.floor(starsDeducted / 100) * 1000;
    const baseTuition = Number(body.base_tuition_vnd) || 0;
    const finalAmount = Math.max(0, baseTuition - discountVnd);
    const billId = body.id || `bill_${Date.now()}`;

    // 3. Strict Financial Separation of Duties:
    // Only Manager (Leader Cô Dung / SuperAdmin) can approve or mark paid.
    // Regular teachers can ONLY create or update 'draft' bills.
    let targetStatus = 'draft';
    let approverName = null;

    if (manager) {
      targetStatus = body.status === 'paid' ? 'paid' : (body.status === 'draft' ? 'draft' : 'approved');
      approverName = auth.user.name || 'Ban Quản Lý';
    } else {
      // Normal teacher creating bill
      targetStatus = 'draft';
      approverName = null;
    }

    const billData = {
      ...body,
      id: billId,
      discount_vnd: discountVnd,
      final_amount_vnd: finalAmount,
      status: targetStatus,
      approved_by: approverName
    };

    // 4. Save to Cloudflare D1 (Strict Fail-Closed)
    if (platform?.env?.DB) {
      const db = platform.env.DB;
      const d1Sql = `
        INSERT INTO tuition_bills (
          id, student_id, student_name, age, grade_level, program_name,
          billing_period, base_tuition_vnd, attendance_total_sessions,
          attendance_attended_sessions, stars_available, stars_deducted,
          discount_vnd, final_amount_vnd, vietqr_url, bank_name,
          bank_account, account_holder, growth_status, growth_percentage,
          growth_notes, eval_listening, eval_reading, eval_writing,
          eval_speaking, eval_grammar, test_score_15m, test_score_45m,
          template_id, status, superadmin_notes, approved_by,
          parent_name, parent_phone, parent_zalo_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          base_tuition_vnd = excluded.base_tuition_vnd,
          stars_deducted = excluded.stars_deducted,
          discount_vnd = excluded.discount_vnd,
          final_amount_vnd = excluded.final_amount_vnd,
          status = excluded.status,
          approved_by = excluded.approved_by,
          updated_at = CURRENT_TIMESTAMP;
      `;

      await db.prepare(d1Sql).bind(
        billData.id, billData.student_id || 'student_1', billData.student_name, billData.age || 13, billData.grade_level || 'Lớp 7',
        billData.program_name || 'Tiếng Anh K12', billData.billing_period || 'Tháng 10/2026',
        billData.base_tuition_vnd, billData.attendance_total_sessions || 12, billData.attendance_attended_sessions || 12,
        billData.stars_available || 0, billData.stars_deducted || 0, billData.discount_vnd || 0,
        billData.final_amount_vnd, billData.vietqr_url || '', billData.bank_name || 'MBBank',
        billData.bank_account || '0901234567', billData.account_holder || 'NGUYEN MINH VU',
        billData.growth_status || 'normal', billData.growth_percentage || 0, billData.growth_notes || '',
        billData.eval_listening || 8.0, billData.eval_reading || 8.0, billData.eval_writing || 8.0,
        billData.eval_speaking || 8.0, billData.eval_grammar || 8.0, billData.test_score_15m || 8.0,
        billData.test_score_45m || 8.5, billData.template_id || 1, billData.status,
        billData.superadmin_notes || '', billData.approved_by,
        billData.parent_name || '', billData.parent_phone || '', billData.parent_zalo_id || ''
      ).run();
    } else {
      // Dev mode store sync
      saveTuitionBill(billData);
    }

    // 5. Trigger Webhook on Approval
    if (targetStatus === 'approved' || targetStatus === 'paid') {
      dispatchBotReport('TUITION_BILL_APPROVED', {
        bill_id: billData.id,
        student_name: billData.student_name,
        billing_period: billData.billing_period,
        stars_deducted: billData.stars_deducted,
        discount_vnd: billData.discount_vnd,
        final_amount_vnd: billData.final_amount_vnd,
        vietqr_url: billData.vietqr_url,
        approved_by: billData.approved_by
      });
    }

    return json({
      success: true,
      message: manager 
        ? `Lập và ${targetStatus === 'approved' ? 'duyệt' : targetStatus} phiếu báo học phí thành công!` 
        : 'Đã lập dự thảo phiếu báo học phí thành công. Đang chờ Ban Quản Lý phê duyệt!',
      bill: billData
    });
  } catch (err) {
    console.error('Critical failure in POST tuition:', err);
    return json({ success: false, error: `FailClosed: Không thể hoàn tất ghi nhận học phí (${err.message})` }, { status: 500 });
  }
}
