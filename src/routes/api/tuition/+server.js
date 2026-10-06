import { json } from '@sveltejs/kit';
import { verifyServerAuth, isStaffUser, isManager } from '../../../lib/server/auth.js';
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
      star_debt INTEGER DEFAULT 0,
      last_updated TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS student_star_ledger (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      bill_id TEXT,
      reference_id TEXT,
      delta_stars INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      debt_delta INTEGER DEFAULT 0,
      debt_after INTEGER DEFAULT 0,
      action_type TEXT NOT NULL,
      reason TEXT,
      note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `).run();

  // Backward-compatible column migrations for existing D1 databases
  const migrations = [
    'ALTER TABLE tuition_bills ADD COLUMN version INTEGER DEFAULT 1;',
    'ALTER TABLE student_stars ADD COLUMN star_debt INTEGER DEFAULT 0;',
    'ALTER TABLE student_star_ledger ADD COLUMN bill_id TEXT;',
    'ALTER TABLE student_star_ledger ADD COLUMN reference_id TEXT;',
    'ALTER TABLE student_star_ledger ADD COLUMN delta_stars INTEGER;',
    'ALTER TABLE student_star_ledger ADD COLUMN amount INTEGER;',
    'ALTER TABLE student_star_ledger ADD COLUMN balance_after INTEGER;',
    'ALTER TABLE student_star_ledger ADD COLUMN debt_delta INTEGER DEFAULT 0;',
    'ALTER TABLE student_star_ledger ADD COLUMN debt_after INTEGER DEFAULT 0;',
    'ALTER TABLE student_star_ledger ADD COLUMN reason TEXT;',
    'ALTER TABLE student_star_ledger ADD COLUMN note TEXT;'
  ];
  for (const mig of migrations) {
    try {
      await db.prepare(mig).run();
    } catch {}
  }

  await db.prepare(`
    CREATE TRIGGER IF NOT EXISTS trg_student_stars_no_negative
    BEFORE UPDATE ON student_stars
    FOR EACH ROW
    WHEN NEW.stars_balance < 0
    BEGIN
      SELECT RAISE(ABORT, 'INSUFFICIENT_STARS: stars_balance cannot be negative');
    END;
  `).run();
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
          WHERE parent_user_id = ? AND verification_status = 'verified';
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
  let studentId = null;
  let originalStarsBalance = null;

  try {
    const rawBody = await request.json();
    const body = (rawBody && rawBody.bill) ? { ...rawBody.bill, ...rawBody } : rawBody;
    if (!body.student_name || body.base_tuition_vnd === undefined || body.base_tuition_vnd === null) {
      return json({ success: false, error: 'Thiếu thông tin học sinh hoặc mức học phí gốc' }, { status: 400 });
    }

    // Strict validation: student_id MUST be explicitly provided, non-empty string.
    // NEVER fall back to 'student_1' in financial transactions!
    const rawStudentId = body.student_id;
    if (!rawStudentId || typeof rawStudentId !== 'string' || !rawStudentId.trim()) {
      return json({ success: false, error: 'Thiếu student_id của học sinh' }, { status: 400 });
    }
    studentId = rawStudentId.trim();

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
      stars_available: 0,
      stars_deducted: starsDeducted,
      discount_vnd: discountVnd,
      final_amount_vnd: finalAmount,
      status: targetStatus,
      approved_by: approverName
    };

    // 2. Strict Protection of Approved / Paid Bills & Server Star Ledger (D1)
    if (platform?.env?.DB) {
      const db = platform.env.DB;
      await ensureStarLedgerTable(db);

      // Validate student exists before touching balance
      const studentRecord = await db.prepare('SELECT id, status, role, grade, metadata FROM users WHERE id = ?').bind(studentId).first();
      const starRecord = await db.prepare('SELECT student_id, stars_balance FROM student_stars WHERE student_id = ?').bind(studentId).first();

      if (!studentRecord && !starRecord) {
        return json({
          success: false,
          error: `Học sinh với ID '${studentId}' không tồn tại trong hệ thống.`
        }, { status: 400 });
      }

      // VONG-4: resolve grade from the student's own profile — never assume 'Lớp 7'.
      // If the student has no grade on record, store '' so the UI asks for a grade.
      let studentGrade = '';
      try {
        const sm = typeof studentRecord?.metadata === 'string' ? JSON.parse(studentRecord.metadata) : (studentRecord?.metadata || {});
        studentGrade = studentRecord?.grade || sm?.grade || '';
      } catch {}
      if (!billData.grade_level) billData.grade_level = studentGrade;

      if (studentRecord && studentRecord.status !== 'active') {
        return json({
          success: false,
          error: `Tài khoản học sinh '${studentId}' không ở trạng thái hoạt động (${studentRecord.status}).`
        }, { status: 403 });
      }

      // Check existing bill
      let existing = null;
      let previousDeducted = 0;
      let existingVersion = 1;

      if (body.id) {
        existing = await db.prepare('SELECT id, status, student_id, stars_deducted, version FROM tuition_bills WHERE id = ?').bind(body.id).first();
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
          previousDeducted = Number(existing.stars_deducted) || 0;
          existingVersion = Number(existing.version) || 1;
          netStarsToDebit = starsDeducted - previousDeducted;
        }
      }

      // Query true verified student star balance from DB (NEVER trust client body.stars_available)
      const starRow = await db.prepare('SELECT stars_balance FROM student_stars WHERE student_id = ?').bind(studentId).first();
      availableStars = starRow ? Number(starRow.stars_balance) : 0;
      billData.stars_available = availableStars;

      if (netStarsToDebit > 0 && availableStars < netStarsToDebit) {
        return json({
          success: false,
          error: `Số dư sao không đủ: Học sinh chỉ có ${availableStars} sao khả dụng trong hệ thống, không đủ để khấu trừ thêm ${netStarsToDebit} sao (yêu cầu tổng: ${starsDeducted} sao).`
        }, { status: 400 });
      }

      // 5. Construct Unified Atomic Batch Statements
      const statements = [];
      const ledgerId = `stl_${Date.now()}_${crypto.randomUUID()}`;

      if (netStarsToDebit > 0) {
        // Debit stars
        if (existing) {
          // Revision debit: guarded by existing version & previous stars_deducted
          const stmtStars = db.prepare(`
            UPDATE student_stars
            SET stars_balance = stars_balance - ?,
                stars_redeemed = stars_redeemed + ?,
                last_updated = CURRENT_TIMESTAMP
            WHERE student_id = ?
              AND EXISTS (SELECT 1 FROM tuition_bills WHERE id = ? AND student_id = ? AND version = ? AND stars_deducted = ? AND (status = 'draft' OR ? = 1));
          `).bind(netStarsToDebit, netStarsToDebit, studentId, billId, studentId, existingVersion, previousDeducted, manager ? 1 : 0);

          const stmtLedger = db.prepare(`
            INSERT INTO student_star_ledger (id, student_id, bill_id, reference_id, delta_stars, amount, balance_after, debt_delta, debt_after, action_type, reason, note)
            SELECT ?, ?, ?, ?, ?, ?, stars_balance, 0, star_debt, 'deduct', ?, ?
            FROM student_stars
            WHERE student_id = ?
              AND EXISTS (SELECT 1 FROM tuition_bills WHERE id = ? AND student_id = ? AND version = ? AND stars_deducted = ? AND (status = 'draft' OR ? = 1));
          `).bind(ledgerId, studentId, billId, billId, -netStarsToDebit, -netStarsToDebit, `Khấu trừ ${netStarsToDebit} sao cho phiếu học phí ${billId}`, `Khấu trừ ${netStarsToDebit} sao cho phiếu học phí ${billId}`, studentId, billId, studentId, existingVersion, previousDeducted, manager ? 1 : 0);

          const stmtBill = db.prepare(`
            UPDATE tuition_bills SET
              version = version + 1,
              student_name = ?,
              age = ?,
              grade_level = ?,
              program_name = ?,
              billing_period = ?,
              base_tuition_vnd = ?,
              attendance_total_sessions = ?,
              attendance_attended_sessions = ?,
              stars_available = (SELECT stars_balance FROM student_stars WHERE student_id = ?),
              stars_deducted = ?,
              discount_vnd = ?,
              final_amount_vnd = ?,
              vietqr_url = ?,
              bank_name = ?,
              bank_account = ?,
              account_holder = ?,
              growth_status = ?,
              growth_percentage = ?,
              growth_notes = ?,
              eval_listening = ?,
              eval_reading = ?,
              eval_writing = ?,
              eval_speaking = ?,
              eval_grammar = ?,
              test_score_15m = ?,
              test_score_45m = ?,
              template_id = ?,
              status = ?,
              superadmin_notes = ?,
              approved_by = ?,
              parent_name = ?,
              parent_phone = ?,
              parent_zalo_id = ?,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND version = ? AND stars_deducted = ? AND (status = 'draft' OR ? = 1);
          `).bind(
            billData.student_name, billData.age || 13, billData.grade_level || '',
            billData.program_name || 'Tiếng Anh K12', billData.billing_period || 'Tháng 10/2026',
            billData.base_tuition_vnd, billData.attendance_total_sessions || 12, billData.attendance_attended_sessions || 12,
            studentId, billData.stars_deducted, billData.discount_vnd,
            billData.final_amount_vnd, billData.vietqr_url || '', billData.bank_name || 'MBBank',
            billData.bank_account || '0901234567', billData.account_holder || 'NGUYEN MINH VU',
            billData.growth_status || 'normal', billData.growth_percentage || 0, billData.growth_notes || '',
            billData.eval_listening || 8.0, billData.eval_reading || 8.0, billData.eval_writing || 8.0,
            billData.eval_speaking || 8.0, billData.eval_grammar || 8.0, billData.test_score_15m || 8.0,
            billData.test_score_45m || 8.5, billData.template_id || 1, billData.status,
            billData.superadmin_notes || '', billData.approved_by,
            billData.parent_name || '', billData.parent_phone || '', billData.parent_zalo_id || '',
            billId, existingVersion, previousDeducted, manager ? 1 : 0
          );

          statements.push(stmtStars, stmtLedger, stmtBill);
        } else {
          // New bill creation debit
          const stmtStars = db.prepare(`
            UPDATE student_stars
            SET stars_balance = stars_balance - ?,
                stars_redeemed = stars_redeemed + ?,
                last_updated = CURRENT_TIMESTAMP
            WHERE student_id = ?;
          `).bind(netStarsToDebit, netStarsToDebit, studentId);

          const stmtLedger = db.prepare(`
            INSERT INTO student_star_ledger (id, student_id, bill_id, reference_id, delta_stars, amount, balance_after, debt_delta, debt_after, action_type, reason, note)
            VALUES (?, ?, ?, ?, ?, ?, (SELECT stars_balance FROM student_stars WHERE student_id = ?), 0, (SELECT star_debt FROM student_stars WHERE student_id = ?), 'deduct', ?, ?);
          `).bind(ledgerId, studentId, billId, billId, -netStarsToDebit, -netStarsToDebit, studentId, studentId, `Khấu trừ ${netStarsToDebit} sao cho phiếu học phí ${billId}`, `Khấu trừ ${netStarsToDebit} sao cho phiếu học phí ${billId}`);

          const stmtBill = db.prepare(`
            INSERT INTO tuition_bills (
              id, version, student_id, student_name, age, grade_level, program_name,
              billing_period, base_tuition_vnd, attendance_total_sessions,
              attendance_attended_sessions, stars_available, stars_deducted,
              discount_vnd, final_amount_vnd, vietqr_url, bank_name,
              bank_account, account_holder, growth_status, growth_percentage,
              growth_notes, eval_listening, eval_reading, eval_writing,
              eval_speaking, eval_grammar, test_score_15m, test_score_45m,
              template_id, status, superadmin_notes, approved_by,
              parent_name, parent_phone, parent_zalo_id,
              month_label, amount, total_amount
            ) VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT stars_balance FROM student_stars WHERE student_id = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
          `).bind(
            billData.id, billData.student_id, billData.student_name, billData.age || 13, billData.grade_level || '',
            billData.program_name || 'Tiếng Anh K12', billData.billing_period || 'Tháng 10/2026',
            billData.base_tuition_vnd, billData.attendance_total_sessions || 12, billData.attendance_attended_sessions || 12,
            studentId, billData.stars_deducted, billData.discount_vnd,
            billData.final_amount_vnd, billData.vietqr_url || '', billData.bank_name || 'MBBank',
            billData.bank_account || '0901234567', billData.account_holder || 'NGUYEN MINH VU',
            billData.growth_status || 'normal', billData.growth_percentage || 0, billData.growth_notes || '',
            billData.eval_listening || 8.0, billData.eval_reading || 8.0, billData.eval_writing || 8.0,
            billData.eval_speaking || 8.0, billData.eval_grammar || 8.0, billData.test_score_15m || 8.0,
            billData.test_score_45m || 8.5, billData.template_id || 1, billData.status,
            billData.superadmin_notes || '', billData.approved_by,
            billData.parent_name || '', billData.parent_phone || '', billData.parent_zalo_id || '',
            billData.billing_period || 'Tháng 10/2026',
            billData.final_amount_vnd || billData.base_tuition_vnd || 0,
            billData.final_amount_vnd || billData.base_tuition_vnd || 0
          );

          statements.push(stmtStars, stmtLedger, stmtBill);
        }
      } else if (netStarsToDebit < 0) {
        // Bill revised to deduct fewer stars: refund difference
        const refundAmount = -netStarsToDebit;
        const stmtStars = db.prepare(`
          UPDATE student_stars
          SET stars_balance = stars_balance + ?,
              stars_redeemed = MAX(0, stars_redeemed - ?),
              last_updated = CURRENT_TIMESTAMP
          WHERE student_id = ?
            AND EXISTS (SELECT 1 FROM tuition_bills WHERE id = ? AND student_id = ? AND version = ? AND stars_deducted = ? AND (status = 'draft' OR ? = 1));
        `).bind(refundAmount, refundAmount, studentId, billId, studentId, existingVersion, previousDeducted, manager ? 1 : 0);

        const stmtLedger = db.prepare(`
          INSERT INTO student_star_ledger (id, student_id, bill_id, reference_id, delta_stars, amount, balance_after, debt_delta, debt_after, action_type, reason, note)
          SELECT ?, ?, ?, ?, ?, ?, stars_balance, 0, star_debt, 'refund', ?, ?
          FROM student_stars
          WHERE student_id = ?
            AND EXISTS (SELECT 1 FROM tuition_bills WHERE id = ? AND student_id = ? AND version = ? AND stars_deducted = ? AND (status = 'draft' OR ? = 1));
        `).bind(ledgerId, studentId, billId, billId, refundAmount, refundAmount, `Hoàn ${refundAmount} sao do giảm khấu trừ trên phiếu học phí ${billId}`, `Hoàn ${refundAmount} sao do giảm khấu trừ trên phiếu học phí ${billId}`, studentId, billId, studentId, existingVersion, previousDeducted, manager ? 1 : 0);

        const stmtBill = db.prepare(`
          UPDATE tuition_bills SET
            version = version + 1,
            student_name = ?,
            age = ?,
            grade_level = ?,
            program_name = ?,
            billing_period = ?,
            base_tuition_vnd = ?,
            attendance_total_sessions = ?,
            attendance_attended_sessions = ?,
            stars_available = (SELECT stars_balance FROM student_stars WHERE student_id = ?),
            stars_deducted = ?,
            discount_vnd = ?,
            final_amount_vnd = ?,
            vietqr_url = ?,
            bank_name = ?,
            bank_account = ?,
            account_holder = ?,
            growth_status = ?,
            growth_percentage = ?,
            growth_notes = ?,
            eval_listening = ?,
            eval_reading = ?,
            eval_writing = ?,
            eval_speaking = ?,
            eval_grammar = ?,
            test_score_15m = ?,
            test_score_45m = ?,
            template_id = ?,
            status = ?,
            superadmin_notes = ?,
            approved_by = ?,
            parent_name = ?,
            parent_phone = ?,
            parent_zalo_id = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND version = ? AND stars_deducted = ? AND (status = 'draft' OR ? = 1);
        `).bind(
          billData.student_name, billData.age || 13, billData.grade_level || '',
          billData.program_name || 'Tiếng Anh K12', billData.billing_period || 'Tháng 10/2026',
          billData.base_tuition_vnd, billData.attendance_total_sessions || 12, billData.attendance_attended_sessions || 12,
          studentId, billData.stars_deducted, billData.discount_vnd,
          billData.final_amount_vnd, billData.vietqr_url || '', billData.bank_name || 'MBBank',
          billData.bank_account || '0901234567', billData.account_holder || 'NGUYEN MINH VU',
          billData.growth_status || 'normal', billData.growth_percentage || 0, billData.growth_notes || '',
          billData.eval_listening || 8.0, billData.eval_reading || 8.0, billData.eval_writing || 8.0,
          billData.eval_speaking || 8.0, billData.eval_grammar || 8.0, billData.test_score_15m || 8.0,
          billData.test_score_45m || 8.5, billData.template_id || 1, billData.status,
          billData.superadmin_notes || '', billData.approved_by,
          billData.parent_name || '', billData.parent_phone || '', billData.parent_zalo_id || '',
          billId, existingVersion, previousDeducted, manager ? 1 : 0
        );

        statements.push(stmtStars, stmtLedger, stmtBill);
      } else {
        // netStarsToDebit === 0: no star changes needed
        if (existing) {
          const stmtBill = db.prepare(`
            UPDATE tuition_bills SET
              version = version + 1,
              student_name = ?,
              age = ?,
              grade_level = ?,
              program_name = ?,
              billing_period = ?,
              base_tuition_vnd = ?,
              attendance_total_sessions = ?,
              attendance_attended_sessions = ?,
              stars_available = (SELECT stars_balance FROM student_stars WHERE student_id = ?),
              stars_deducted = ?,
              discount_vnd = ?,
              final_amount_vnd = ?,
              vietqr_url = ?,
              bank_name = ?,
              bank_account = ?,
              account_holder = ?,
              growth_status = ?,
              growth_percentage = ?,
              growth_notes = ?,
              eval_listening = ?,
              eval_reading = ?,
              eval_writing = ?,
              eval_speaking = ?,
              eval_grammar = ?,
              test_score_15m = ?,
              test_score_45m = ?,
              template_id = ?,
              status = ?,
              superadmin_notes = ?,
              approved_by = ?,
              parent_name = ?,
              parent_phone = ?,
              parent_zalo_id = ?,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND version = ? AND stars_deducted = ? AND (status = 'draft' OR ? = 1);
          `).bind(
            billData.student_name, billData.age || 13, billData.grade_level || '',
            billData.program_name || 'Tiếng Anh K12', billData.billing_period || 'Tháng 10/2026',
            billData.base_tuition_vnd, billData.attendance_total_sessions || 12, billData.attendance_attended_sessions || 12,
            studentId, billData.stars_deducted, billData.discount_vnd,
            billData.final_amount_vnd, billData.vietqr_url || '', billData.bank_name || 'MBBank',
            billData.bank_account || '0901234567', billData.account_holder || 'NGUYEN MINH VU',
            billData.growth_status || 'normal', billData.growth_percentage || 0, billData.growth_notes || '',
            billData.eval_listening || 8.0, billData.eval_reading || 8.0, billData.eval_writing || 8.0,
            billData.eval_speaking || 8.0, billData.eval_grammar || 8.0, billData.test_score_15m || 8.0,
            billData.test_score_45m || 8.5, billData.template_id || 1, billData.status,
            billData.superadmin_notes || '', billData.approved_by,
            billData.parent_name || '', billData.parent_phone || '', billData.parent_zalo_id || '',
            billId, existingVersion, previousDeducted, manager ? 1 : 0
          );
          statements.push(stmtBill);
        } else {
          const stmtBill = db.prepare(`
            INSERT INTO tuition_bills (
              id, version, student_id, student_name, age, grade_level, program_name,
              billing_period, base_tuition_vnd, attendance_total_sessions,
              attendance_attended_sessions, stars_available, stars_deducted,
              discount_vnd, final_amount_vnd, vietqr_url, bank_name,
              bank_account, account_holder, growth_status, growth_percentage,
              growth_notes, eval_listening, eval_reading, eval_writing,
              eval_speaking, eval_grammar, test_score_15m, test_score_45m,
              template_id, status, superadmin_notes, approved_by,
              parent_name, parent_phone, parent_zalo_id,
              month_label, amount, total_amount
            ) VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT stars_balance FROM student_stars WHERE student_id = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
          `).bind(
            billData.id, billData.student_id, billData.student_name, billData.age || 13, billData.grade_level || '',
            billData.program_name || 'Tiếng Anh K12', billData.billing_period || 'Tháng 10/2026',
            billData.base_tuition_vnd, billData.attendance_total_sessions || 12, billData.attendance_attended_sessions || 12,
            studentId, billData.stars_deducted, billData.discount_vnd,
            billData.final_amount_vnd, billData.vietqr_url || '', billData.bank_name || 'MBBank',
            billData.bank_account || '0901234567', billData.account_holder || 'NGUYEN MINH VU',
            billData.growth_status || 'normal', billData.growth_percentage || 0, billData.growth_notes || '',
            billData.eval_listening || 8.0, billData.eval_reading || 8.0, billData.eval_writing || 8.0,
            billData.eval_speaking || 8.0, billData.eval_grammar || 8.0, billData.test_score_15m || 8.0,
            billData.test_score_45m || 8.5, billData.template_id || 1, billData.status,
            billData.superadmin_notes || '', billData.approved_by,
            billData.parent_name || '', billData.parent_phone || '', billData.parent_zalo_id || '',
            billData.billing_period || 'Tháng 10/2026',
            billData.final_amount_vnd || billData.base_tuition_vnd || 0,
            billData.final_amount_vnd || billData.base_tuition_vnd || 0
          );
          statements.push(stmtBill);
        }
      }

      // Execute transaction batch (Fail-Closed if driver does not support atomic batch)
      if (typeof db.batch !== 'function') {
        return json({
          success: false,
          error: 'FailClosed: Database driver does not support atomic batch transactions'
        }, { status: 500 });
      }
      const batchResults = await db.batch(statements);

      // Check the bill statement result (always the last statement in the batch)
      const billRunRes = batchResults[batchResults.length - 1];
      if (existing && (!billRunRes || billRunRes.meta?.changes !== 1)) {
        return json({
          success: false,
          error: 'Forbidden: Hóa đơn đã được duyệt hoặc không còn ở trạng thái dự thảo (draft). Giáo viên không được phép ghi đè.'
        }, { status: 403 });
      }

      // If net stars changed, verify stars statement succeeded (always first statement)
      if (netStarsToDebit !== 0 && (!batchResults[0] || batchResults[0].meta?.changes !== 1)) {
        return json({
          success: false,
          error: 'Không thể khấu trừ/hoàn sao: Số dư sao không đủ hoặc thông tin học sinh không hợp lệ (changes = 0).'
        }, { status: 400 });
      }

      // Fetch authoritative updated balance from DB
      const finalStarRow = await db.prepare('SELECT stars_balance FROM student_stars WHERE student_id = ?').bind(studentId).first();
      billData.stars_available = finalStarRow ? Number(finalStarRow.stars_balance) : availableStars;
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
    if (err?.message && (err.message.includes('INSUFFICIENT_STARS') || err.message.includes('cannot be negative'))) {
      return json({
        success: false,
        error: 'Số dư sao của học sinh không đủ để áp dụng khấu trừ học phí'
      }, { status: 400 });
    }
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
    const bill = await db.prepare('SELECT id, student_id, stars_deducted, version FROM tuition_bills WHERE id = ?').bind(billId).first();
    if (!bill) {
      return json({ success: false, error: 'Không tìm thấy hóa đơn cần xóa' }, { status: 404 });
    }

    const studentId = bill.student_id;
    const starsDeducted = Number(bill.stars_deducted) || 0;
    const expectedVersion = Number(bill.version) || 1;

    try {
      if (starsDeducted > 0) {
        const stmtStars = db.prepare(`
          UPDATE student_stars
          SET stars_balance = stars_balance + ?,
              stars_redeemed = MAX(0, stars_redeemed - ?),
              last_updated = CURRENT_TIMESTAMP
          WHERE student_id = ?
            AND EXISTS (SELECT 1 FROM tuition_bills WHERE id = ? AND version = ? AND stars_deducted = ?);
        `).bind(starsDeducted, starsDeducted, studentId, billId, expectedVersion, starsDeducted);

        const stmtLedger = db.prepare(`
          INSERT INTO student_star_ledger (id, student_id, bill_id, reference_id, delta_stars, amount, balance_after, debt_delta, debt_after, action_type, reason, note)
          SELECT ?, ?, ?, ?, ?, ?, stars_balance, 0, star_debt, 'refund', ?, ?
          FROM student_stars
          WHERE student_id = ?
            AND EXISTS (SELECT 1 FROM tuition_bills WHERE id = ? AND version = ? AND stars_deducted = ?);
        `).bind(`stl_del_${Date.now()}_${crypto.randomUUID()}`, studentId, billId, billId, starsDeducted, starsDeducted, `Hoàn lại ${starsDeducted} sao do xóa hóa đơn ${billId}`, `Hoàn lại ${starsDeducted} sao do xóa hóa đơn ${billId}`, studentId, billId, expectedVersion, starsDeducted);

        const stmtDelete = db.prepare(`
          DELETE FROM tuition_bills WHERE id = ? AND version = ? AND stars_deducted = ?;
        `).bind(billId, expectedVersion, starsDeducted);

        if (typeof db.batch !== 'function') {
          return json({
            success: false,
            error: 'FailClosed: Database driver does not support atomic batch transactions'
          }, { status: 500 });
        }
        const batchRes = await db.batch([stmtStars, stmtLedger, stmtDelete]);

        const delResult = batchRes[2];
        if (!delResult || delResult.meta?.changes !== 1) {
          return json({
            success: false,
            error: 'Xung đột khi xóa hóa đơn: Hóa đơn đã bị xóa hoặc chỉnh sửa đồng thời bởi giao dịch khác (changes = 0).'
          }, { status: 409 });
        }
      } else {
        const stmtDelete = db.prepare('DELETE FROM tuition_bills WHERE id = ? AND version = ?;').bind(billId, expectedVersion);
        if (typeof db.batch !== 'function') {
          return json({
            success: false,
            error: 'FailClosed: Database driver does not support atomic batch transactions'
          }, { status: 500 });
        }
        const res = await db.batch([stmtDelete]);
        const delRes = res[0];
        if (!delRes || delRes.meta?.changes !== 1) {
          return json({
            success: false,
            error: 'Xung đột khi xóa hóa đơn: Hóa đơn đã bị xóa hoặc chỉnh sửa đồng thời (changes = 0).'
          }, { status: 409 });
        }
      }

      return json({
        success: true,
        message: `Đã xóa hóa đơn ${billId} và hoàn lại ${starsDeducted} sao cho học sinh.`
      });
    } catch (err) {
      console.error('Critical failure in DELETE tuition:', err);
      return json({
        success: false,
        error: `FailClosed: Lỗi xóa hóa đơn (${err.message})`
      }, { status: 500 });
    }
  }

  return json({ success: true, message: `Đã xóa hóa đơn ${billId} (local dev).` });
}
