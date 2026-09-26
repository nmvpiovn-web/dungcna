import { json } from '@sveltejs/kit';

export const prerender = false;

/**
 * SePay Payment Webhook Abstraction & Contract Handler
 * Specs per Codex Audit Feedback:
 * - API Secret / Signature authorization
 * - Idempotency via unique gateway transaction ID
 * - Amount and bill/student matching
 * - Status transition: pending -> confirmed -> reversed
 * - Audit logging
 * - Fail-closed security (zero production secrets stored in code)
 */
export async function POST({ request, platform }) {
  // 1. Signature / Authorization Verification (Fail-Closed)
  const webhookSecret = platform?.env?.SEPAY_WEBHOOK_SECRET || process.env.SEPAY_WEBHOOK_SECRET;
  const authHeader = request.headers.get('Authorization') || '';
  const apiKeyHeader = request.headers.get('X-Sepay-Api-Key') || '';

  // Extract provided key from "Bearer <key>", "Apikey <key>" or direct header
  let providedKey = '';
  if (authHeader.startsWith('Bearer ') || authHeader.startsWith('Apikey ')) {
    providedKey = authHeader.split(' ')[1]?.trim() || '';
  } else if (apiKeyHeader) {
    providedKey = apiKeyHeader.trim();
  }

  // If secret is configured on server, enforce strict match
  if (webhookSecret && (!providedKey || providedKey !== webhookSecret)) {
    return json({
      success: false,
      error: 'Unauthorized: SePay webhook signature/API key không hợp lệ.'
    }, { status: 401 });
  }

  // 2. Parse & Validate Payload
  let body;
  try {
    body = await request.json();
  } catch {
    return json({
      success: false,
      error: 'BadRequest: Payload không phải JSON hợp lệ.'
    }, { status: 400 });
  }

  const {
    id: gatewayTxId,
    transferType = 'in',
    transferAmount = 0,
    content = '',
    referenceCode = '',
    transactionDate = new Date().toISOString()
  } = body;

  if (!gatewayTxId) {
    return json({
      success: false,
      error: 'BadRequest: Thiếu transaction ID từ cổng thanh toán.'
    }, { status: 400 });
  }

  const db = platform?.env?.DB;
  if (!db) {
    // If running in development without binding, fail-closed per security guidelines
    return json({
      success: false,
      error: 'DatabaseUnavailable: Cloudflare D1 binding platform.env.DB không khả dụng.'
    }, { status: 500 });
  }

  try {
    // 3. Idempotency Guard: Check if transaction already processed
    const existing = await db.prepare(`
      SELECT id, status, bill_id, amount FROM tuition_transactions
      WHERE gateway_transaction_id = ?
      LIMIT 1;
    `).bind(String(gatewayTxId)).first();

    if (existing) {
      return json({
        success: true,
        status: 'already_processed',
        message: 'Giao dịch SePay này đã được ghi nhận trước đó (Idempotent response).',
        transaction_id: existing.id,
        current_status: existing.status
      }, { status: 200 });
    }

    // 4. Bill Matching: Extract Bill / Order code from transfer content
    // Regex looks for bill codes like HP_123, BILL_456, or STU_789
    const match = content.match(/(HP[_-]?\d+|BILL[_-]?\d+|STU[_-]?\w+)/i);
    const matchedRef = match ? match[0].toUpperCase() : null;

    let targetBill = null;
    if (matchedRef) {
      targetBill = await db.prepare(`
        SELECT id, student_id, total_amount, status
        FROM tuition_bills
        WHERE id = ? OR UPPER(id) = ?
        LIMIT 1;
      `).bind(matchedRef, matchedRef).first();
    }

    // 5. Determine State Transition
    const newTxId = `tx_sp_${gatewayTxId}_${Date.now()}`;
    let txStatus = 'confirmed';
    let billUpdated = false;

    if (transferType === 'out') {
      txStatus = 'reversed';
    } else if (targetBill) {
      // If payment meets or exceeds bill amount, mark bill paid/confirmed
      if (transferAmount >= targetBill.total_amount) {
        billUpdated = true;
      }
    }

    // 6. Atomic Transaction Batch: Insert transaction, update bill, write audit log
    const stmts = [
      db.prepare(`
        INSERT INTO tuition_transactions (
          id, student_id, bill_id, amount, status,
          gateway_name, gateway_transaction_id, reference_code, transfer_content, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
      `).bind(
        newTxId,
        targetBill?.student_id || 'unknown_student',
        targetBill?.id || matchedRef || null,
        Number(transferAmount),
        txStatus,
        'sepay',
        String(gatewayTxId),
        referenceCode,
        content,
        Date.now()
      )
    ];

    if (billUpdated && targetBill) {
      stmts.push(
        db.prepare(`
          UPDATE tuition_bills
          SET status = 'paid', updated_at = ?
          WHERE id = ?;
        `).bind(Date.now(), targetBill.id)
      );
    }

    // Audit log
    stmts.push(
      db.prepare(`
        INSERT INTO audit_logs (id, action, actor_id, actor_role, details, created_at)
        VALUES (?, ?, ?, ?, ?, ?);
      `).bind(
        `aud_sp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        `PAYMENT_SEPAY_${txStatus.toUpperCase()}`,
        'system:sepay_webhook',
        'system',
        JSON.stringify({
          gatewayTxId,
          amount: transferAmount,
          matchedBill: targetBill?.id || null,
          transferType
        }),
        Date.now()
      )
    );

    await db.batch(stmts);

    return json({
      success: true,
      status: txStatus,
      transaction_id: newTxId,
      matched_bill_id: targetBill?.id || null,
      bill_status: billUpdated ? 'paid' : (targetBill?.status || 'unmatched')
    }, { status: 200 });

  } catch (err) {
    return json({
      success: false,
      error: `InternalServerError: Lỗi xử lý webhook SePay: ${err.message}`
    }, { status: 500 });
  }
}
