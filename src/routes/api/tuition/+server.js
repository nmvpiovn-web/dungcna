import { json } from '@sveltejs/kit';
import { verifyServerAuth, isStaffUser, SUPERADMIN_USERNAMES } from '$lib/server/auth.js';
import { getAllTuitionBills, saveTuitionBill, getStudentStars, dispatchBotReport, getAllUsers } from '$lib/unifiedStore';

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

  // 2. Record-Level Authorization
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
    // Parent can only inspect bills tied to their registered phone or their verified children
    const allUsers = getAllUsers();
    const myChildren = allUsers.filter(u => 
      u.role === 'student' && 
      ((user.phone && (u.parent_phone === user.phone || u.phone === user.phone)) || (user.name && u.parent_name === user.name))
    );
    const myChildIds = myChildren.map(c => c.id);

    if (requestedStudentId) {
      if (!myChildIds.includes(requestedStudentId) && requestedStudentId !== user.id) {
        return json({
          success: false,
          error: 'Forbidden: Quý phụ huynh chỉ có quyền xem học phí của con em mình'
        }, { status: 403 });
      }
      allowedStudentId = requestedStudentId;
    } else if (!user.phone && myChildIds.length === 0) {
      // Fail-closed: parent without phone and without linked child sees nothing
      return json({ success: true, total: 0, bills: [], source: 'fail_closed_unlinked_parent' });
    }
  }

  try {
    // 3. Query Cloudflare D1
    if (platform?.env?.DB) {
      try {
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

        const d1Res = await platform.env.DB.prepare(query).bind(...params).all();
        if (d1Res?.results) {
          return json({
            success: true,
            total: d1Res.results.length,
            bills: d1Res.results,
            source: 'cloudflare_d1'
          });
        }
      } catch (d1Err) {
        console.error('D1 tuition query error:', d1Err);
      }
    }

    // 4. Fallback to unifiedStore
    let bills = getAllTuitionBills();
    if (allowedStudentId) {
      bills = bills.filter(b => b.student_id === allowedStudentId);
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
      source: 'local_store'
    });
  } catch (err) {
    return json({ success: false, error: err.message }, { status: 500 });
  }
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

  try {
    const body = await request.json();
    if (!body.student_name || !body.base_tuition_vnd) {
      return json({ success: false, error: 'Thiếu thông tin học sinh hoặc mức học phí gốc' }, { status: 400 });
    }

    // 1. Calculate discount with formula: 100 stars = 1,000 VND
    const starsDeducted = Number(body.stars_deducted) || 0;
    const discountVnd = Math.floor(starsDeducted / 100) * 1000;
    const baseTuition = Number(body.base_tuition_vnd) || 0;
    const finalAmount = Math.max(0, baseTuition - discountVnd);
    const billId = body.id || `bill_${Date.now()}`;

    // 2. Save in unifiedStore
    const saved = saveTuitionBill({
      ...body,
      id: billId,
      discount_vnd: discountVnd,
      final_amount_vnd: finalAmount
    });

    // 3. Write directly to Cloudflare D1 if present
    if (platform?.env?.DB) {
      try {
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
            updated_at = CURRENT_TIMESTAMP;
        `;
        await platform.env.DB.prepare(d1Sql).bind(
          saved.id, saved.student_id, saved.student_name, saved.age || 13, saved.grade_level || 'Lớp 7',
          saved.program_name || 'Tiếng Anh K12', saved.billing_period || 'Tháng 10/2026',
          saved.base_tuition_vnd, saved.attendance_total_sessions || 12, saved.attendance_attended_sessions || 12,
          saved.stars_available || 0, saved.stars_deducted || 0, saved.discount_vnd || 0,
          saved.final_amount_vnd, saved.vietqr_url || '', saved.bank_name || 'MBBank',
          saved.bank_account || '0901234567', saved.account_holder || 'NGUYEN MINH VU',
          saved.growth_status || 'normal', saved.growth_percentage || 0, saved.growth_notes || '',
          saved.eval_listening || 8.0, saved.eval_reading || 8.0, saved.eval_writing || 8.0,
          saved.eval_speaking || 8.0, saved.eval_grammar || 8.0, saved.test_score_15m || 8.0,
          saved.test_score_45m || 8.5, saved.template_id || 1, saved.status || 'approved',
          saved.superadmin_notes || '', saved.approved_by || 'Cô Dung & SuperAdmin',
          saved.parent_name || '', saved.parent_phone || '', saved.parent_zalo_id || ''
        ).run();
      } catch (d1SaveErr) {
        console.error('D1 tuition save error:', d1SaveErr);
      }
    }

    // 4. Trigger Webhook
    dispatchBotReport('TUITION_BILL_APPROVED', {
      bill_id: saved.id,
      student_name: saved.student_name,
      billing_period: saved.billing_period,
      stars_deducted: saved.stars_deducted,
      discount_vnd: saved.discount_vnd,
      final_amount_vnd: saved.final_amount_vnd,
      vietqr_url: saved.vietqr_url
    });

    return json({
      success: true,
      message: 'Lập và duyệt phiếu báo học phí thành công!',
      bill: saved
    });
  } catch (err) {
    return json({ success: false, error: err.message }, { status: 500 });
  }
}
