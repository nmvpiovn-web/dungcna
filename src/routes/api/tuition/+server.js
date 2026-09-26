import { json } from '@sveltejs/kit';
import { verifyServerAuth, isStaffUser, SUPERADMIN_USERNAMES } from '../../../lib/server/auth.js';
import { getAllTuitionBills, saveTuitionBill, dispatchBotReport } from '../../../lib/unifiedStore.js';

export const prerender = false;

async function ensureStarLedgerTable(db) {
  if (!db) return;
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS student_stars (
      student_id TEXT PRIMARY KEY,
      stars_balance INTEGER DEFAULT 0,
      total_earned_stars INTEGER DEFAULT 0,
      stars_redeemed INTEGER DEFAULT 0,
      last_updated TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS student_star_ledger (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      bill_id TEXT,
      delta_stars INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      action_type TEXT NOT NULL,
      reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `).run();
}

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
        // STRICT ID-ONLY PARENT VERIFICATION:
        // Exclusively query parent_student_links based on parent_user_id.
        // Names and phone numbers are NEVER used to establish parental access rights.
        const linksRes = await db.prepare(`
          SELECT student_user_id FROM parent_student_links 
          WHERE parent_user_id = ?;
        `).bind(user.id).all();

        const linkedStudentIds = (linksRes?.results || []).map(r => r.student_user_id);

        if (linkedStudentIds.length === 0) {
          // Fail-closed: Unlinked parent has zero access
          return json({ success: true, total: 0, bills: [], source: 'fail_closed_unlinked_parent' });
        }

        if (requestedStudentId) {
          if (!linkedStudentIds.includes(requestedStudentId)) {
            return json({
              success: false,
              error: 'Forbidden: Quý phụ huynh chỉ có quyền xem học phí của con em mình'
            }, { status: 403 });
          }
          allowedStudentId = requestedStudentId;
        } else {
          // If no specific child is requested, query ONLY the set of verified child IDs
          const placeholders = linkedStudentIds.map(() => '?').join(',');
          const d1Res = await db.prepare(`
            SELECT * FROM tuition_bills 
            WHERE student_id IN (${placeholders}) 
            ORDER BY created_at DESC;
          `).bind(...linkedStudentIds).all();

          return json({
            success: true,
            total: (d1Res?.results || []).length,
            bills: d1Res?.results || [],
            source: 'cloudflare_d1'
          });
        }
      }

      // Query D1 tuition_bills for staff or single student
      let query = 'SELECT * FROM tuition_bills';
      let params = [];

      if (allowedStudentId) {
        query += ' WHERE student_id = ?';
        params.push(allowedStudentId);
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
    if (!body.student_name || body.base_tuition_vnd === undefined || body.base_tuition_vnd === null) {
      return json({ success: false, error: 'Thiếu thông tin học sinh hoặc mức học phí gốc' }, { status: 400 });
    }

    const studentId = body.student_id ? String(body.student_id).trim() : 'student_1';
    if (!studentId) {
      return json({ success: false, error: 'Thiếu student_id của học sinh' }, { status: 400 });
    }

    // 1. Strict Validation of stars_deducted: must be non-negative integer & finite
    const rawStarsDeducted = body.stars_deducted !== undefined ? body.stars_deducted : 0;
    if (typeof rawStarsDeducted !== 'number' || !Number.isInteger(rawStarsDeducted) || rawStarsDeducted < 0 || !Number.isFinite(rawStarsDeducted)) {
      return json({
        success: false,
        error: 'SchemaError: stars_deducted phải là số nguyên không âm hợp lệ (>= 0).'
      }, { status: 400 });
    }
    const starsDeducted = rawStarsDeducted;

    const baseTuition = Number(body.base_tuition_vnd);
    if (!Number.isFinite(baseTuition) || baseTuition < 0) {
      return json({ success: false, error: 'base_tuition_vnd phải là số hợp lệ (>= 0)' }, { status: 400 });
    }

    // Maximum star cap: 50,000 stars or base tuition conversion
    const MAX_STAR_CAP = 50000;
    if (starsDeducted > MAX_STAR_CAP) {
      return json({
        success: false,
        error: `Giới hạn quy đổi: Số sao khấu trừ tối đa là ${MAX_STAR_CAP} sao mỗi hóa đơn.`
      }, { status: 400 });
    }

    const billId = body.id || `bill_${Date.now()}`;
    let availableStars = 0;
    let netStarsToDebit = starsDeducted;
    let debitedInThisRequest = 0;

    // 2. Strict Protection of Approved / Paid Bills & Server Star Ledger (D1)
    if (platform?.env?.DB) {
      const db = platform.env.DB;
      await ensureStarLedgerTable(db);

      // Check existing bill
      if (body.id) {
        const existing = await db.prepare('SELECT id, status, student_id, stars_deducted FROM tuition_bills WHERE id = ?').bind(body.id).first();
        if (existing) {
          if (existing.status !== 'draft' && !manager) {
            return json({
              success: false,
              error: `Forbidden: Hóa đơn đã ở trạng thái '${existing.status}'. Giáo viên không được phép chỉnh sửa hóa đơn đã phê duyệt hoặc đã thanh toán. Vui lòng liên hệ Ban Quản Lý.`
            }, { status: 403 });
          }
          if (existing.student_id && existing.student_id !== studentId) {
            return json({
              success: false,
              error: 'Forbidden: Không được phép chuyển đổi hóa đơn sang học sinh khác.'
            }, { status: 400 });
          }
          const previousDeducted = Number(existing.stars_deducted) || 0;
          netStarsToDebit = starsDeducted - previousDeducted;
        }
      }

      // Query true verified student star balance from DB (NEVER trust body.stars_available)
      const starRow = await db.prepare('SELECT stars_balance FROM student_stars WHERE student_id = ?').bind(studentId).first();
      availableStars = starRow ? Number(starRow.stars_balance) : 0;

      // Handle Star Debit / Refund
      if (netStarsToDebit > 0) {
        if (availableStars < netStarsToDebit) {
          return json({
            success: false,
            error: `Số dư sao không đủ: Học sinh chỉ có ${availableStars} sao khả dụng trong hệ thống, không đủ để khấu trừ thêm ${netStarsToDebit} sao (yêu cầu tổng: ${starsDeducted} sao).`
          }, { status: 400 });
        }

        // Atomic CAS Debit from student_stars
        const debitRes = await db.prepare(`
          UPDATE student_stars
          SET stars_balance = stars_balance - ?,
              stars_redeemed = stars_redeemed + ?,
              last_updated = CURRENT_TIMESTAMP
          WHERE student_id = ? AND stars_balance >= ?;
        `).bind(netStarsToDebit, netStarsToDebit, studentId, netStarsToDebit).run();

        if (!debitRes || debitRes.meta?.changes !== 1) {
          return json({
            success: false,
            error: 'Xung đột số dư sao: Số dư sao của học sinh đã bị thay đổi đồng thời bởi giao dịch khác (changes = 0). Vui lòng thử lại.'
          }, { status: 409 });
        }

        debitedInThisRequest = netStarsToDebit;

        // Record in student_star_ledger
        const ledgerId = `stl_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const balanceAfter = availableStars - netStarsToDebit;
        await db.prepare(`
          INSERT INTO student_star_ledger (id, student_id, bill_id, delta_stars, balance_after, action_type, reason)
          VALUES (?, ?, ?, ?, ?, 'deduct', ?);
        `).bind(ledgerId, studentId, billId, -netStarsToDebit, balanceAfter, `Khấu trừ ${netStarsToDebit} sao cho phiếu học phí ${billId}`).run();

        availableStars = balanceAfter;
      } else if (netStarsToDebit < 0) {
        // Refund delta stars if bill was revised to deduct fewer stars
        const refundAmount = -netStarsToDebit;
        await db.prepare(`
          UPDATE student_stars
          SET stars_balance = stars_balance + ?,
              stars_redeemed = MAX(0, stars_redeemed - ?),
              last_updated = CURRENT_TIMESTAMP
          WHERE student_id = ?;
        `).bind(refundAmount, refundAmount, studentId).run();

        const ledgerId = `stl_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const balanceAfter = availableStars + refundAmount;
        await db.prepare(`
          INSERT INTO student_star_ledger (id, student_id, bill_id, delta_stars, balance_after, action_type, reason)
          VALUES (?, ?, ?, ?, ?, 'refund', ?);
        `).bind(ledgerId, studentId, billId, refundAmount, balanceAfter, `Hoàn ${refundAmount} sao do giảm khấu trừ trên phiếu học phí ${billId}`).run();

        availableStars = balanceAfter;
      }
    }

    // 3. Calculate discount with formula: 100 stars = 1,000 VND
    const discountVnd = Math.floor(starsDeducted / 100) * 1000;
    const finalAmount = Math.max(0, baseTuition - discountVnd);

    // 4. Strict Financial Separation of Duties:
    let targetStatus = 'draft';
    let approverName = null;

    if (manager) {
      targetStatus = body.status === 'paid' ? 'paid' : (body.status === 'draft' ? 'draft' : 'approved');
      approverName = auth.user.name || 'Ban Quản Lý';
    } else {
      targetStatus = 'draft';
      approverName = null;
    }

    const billData = {
      ...body,
      id: billId,
      student_id: studentId,
      stars_available: availableStars, // Server authoritative balance
      stars_deducted: starsDeducted,
      discount_vnd: discountVnd,
      final_amount_vnd: finalAmount,
      status: targetStatus,
      approved_by: approverName
    };

    // 5. Save to Cloudflare D1 (Strict Fail-Closed)
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
          updated_at = CURRENT_TIMESTAMP
        WHERE (tuition_bills.status = 'draft' OR ? = 1);
      `;

      let runRes;
      try {
        runRes = await db.prepare(d1Sql).bind(
          billData.id, billData.student_id, billData.student_name, billData.age || 13, billData.grade_level || 'Lớp 7',
          billData.program_name || 'Tiếng Anh K12', billData.billing_period || 'Tháng 10/2026',
          billData.base_tuition_vnd, billData.attendance_total_sessions || 12, billData.attendance_attended_sessions || 12,
          billData.stars_available, billData.stars_deducted, billData.discount_vnd,
          billData.final_amount_vnd, billData.vietqr_url || '', billData.bank_name || 'MBBank',
          billData.bank_account || '0901234567', billData.account_holder || 'NGUYEN MINH VU',
          billData.growth_status || 'normal', billData.growth_percentage || 0, billData.growth_notes || '',
          billData.eval_listening || 8.0, billData.eval_reading || 8.0, billData.eval_writing || 8.0,
          billData.eval_speaking || 8.0, billData.eval_grammar || 8.0, billData.test_score_15m || 8.0,
          billData.test_score_45m || 8.5, billData.template_id || 1, billData.status,
          billData.superadmin_notes || '', billData.approved_by,
          billData.parent_name || '', billData.parent_phone || '', billData.parent_zalo_id || '',
          manager ? 1 : 0
        ).run();
      } catch (insertErr) {
        // Rollback debited stars if D1 insert threw
        if (debitedInThisRequest > 0) {
          await db.prepare(`
            UPDATE student_stars
            SET stars_balance = stars_balance + ?,
                stars_redeemed = MAX(0, stars_redeemed - ?),
                last_updated = CURRENT_TIMESTAMP
            WHERE student_id = ?;
          `).bind(debitedInThisRequest, debitedInThisRequest, studentId).run();

          await db.prepare(`
            INSERT INTO student_star_ledger (id, student_id, bill_id, delta_stars, balance_after, action_type, reason)
            VALUES (?, ?, ?, ?, ?, 'refund', 'Tự động hoàn sao do lỗi ghi phiếu học phí D1');
          `).bind(`stl_rb_${Date.now()}`, studentId, billId, debitedInThisRequest, availableStars + debitedInThisRequest).run();
        }
        throw insertErr;
      }

      if (body.id && (!runRes || runRes.meta?.changes !== 1)) {
        // Rollback debited stars if bill was locked and couldn't be updated
        if (debitedInThisRequest > 0) {
          await db.prepare(`
            UPDATE student_stars
            SET stars_balance = stars_balance + ?,
                stars_redeemed = MAX(0, stars_redeemed - ?),
                last_updated = CURRENT_TIMESTAMP
            WHERE student_id = ?;
          `).bind(debitedInThisRequest, debitedInThisRequest, studentId).run();

          await db.prepare(`
            INSERT INTO student_star_ledger (id, student_id, bill_id, delta_stars, balance_after, action_type, reason)
            VALUES (?, ?, ?, ?, ?, 'refund', 'Tự động hoàn sao do không thể ghi đè phiếu đã khóa');
          `).bind(`stl_rb_${Date.now()}`, studentId, billId, debitedInThisRequest, availableStars + debitedInThisRequest).run();
        }
        return json({
          success: false,
          error: 'Forbidden: Hóa đơn đã được duyệt hoặc không còn ở trạng thái dự thảo (draft). Giáo viên không được phép ghi đè.'
        }, { status: 403 });
      }
    } else {
      saveTuitionBill(billData);
    }

    // 6. Trigger Webhook on Approval
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

export async function DELETE({ url, request, platform }) {
  const auth = await verifyServerAuth(request, platform);
  if (!auth.authenticated) {
    return json({ success: false, error: auth.error || 'Unauthorized' }, { status: 401 });
  }
  if (!isManager(auth.user)) {
    return json({ success: false, error: 'Forbidden: Chỉ Ban Quản Lý mới có quyền xóa hóa đơn học phí' }, { status: 403 });
  }

  const billId = url.searchParams.get('id');
  if (!billId) {
    return json({ success: false, error: 'Thiếu id hóa đơn cần xóa' }, { status: 400 });
  }

  if (platform?.env?.DB) {
    const db = platform.env.DB;
    await ensureStarLedgerTable(db);
    const bill = await db.prepare('SELECT id, student_id, stars_deducted FROM tuition_bills WHERE id = ?').bind(billId).first();
    if (!bill) {
      return json({ success: false, error: 'Không tìm thấy hóa đơn cần xóa' }, { status: 404 });
    }

    const starsDeducted = Number(bill.stars_deducted) || 0;
    if (starsDeducted > 0) {
      // Refund deducted stars
      await db.prepare(`
        UPDATE student_stars
        SET stars_balance = stars_balance + ?,
            stars_redeemed = MAX(0, stars_redeemed - ?),
            last_updated = CURRENT_TIMESTAMP
        WHERE student_id = ?;
      `).bind(starsDeducted, starsDeducted, bill.student_id).run();

      const starRow = await db.prepare('SELECT stars_balance FROM student_stars WHERE student_id = ?').bind(bill.student_id).first();
      const balanceAfter = starRow ? Number(starRow.stars_balance) : starsDeducted;

      await db.prepare(`
        INSERT INTO student_star_ledger (id, student_id, bill_id, delta_stars, balance_after, action_type, reason)
        VALUES (?, ?, ?, ?, ?, 'refund', ?);
      `).bind(`stl_del_${Date.now()}`, bill.student_id, billId, starsDeducted, balanceAfter, `Hoàn lại ${starsDeducted} sao do xóa hóa đơn ${billId}`).run();
    }

    await db.prepare('DELETE FROM tuition_bills WHERE id = ?').bind(billId).run();
    return json({ success: true, message: `Đã xóa hóa đơn ${billId} và hoàn lại ${starsDeducted} sao cho học sinh.` });
  }

  return json({ success: true, message: `Đã xóa hóa đơn ${billId} (local dev).` });
}
