import { json } from '@sveltejs/kit';
import { verifyServiceSecret } from '../../../../lib/server/serviceAuth.js';

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
  const serviceAuth = verifyServiceSecret(request, platform, 'SEPAY_WEBHOOK_SECRET', 'x-sepay-api-key');
  if (!serviceAuth.ok) return json({ success: false, error: serviceAuth.error }, { status: serviceAuth.status });

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

  const normalizedGatewayId = typeof gatewayTxId === 'string' || typeof gatewayTxId === 'number' ? String(gatewayTxId).trim() : '';
  const amount = Number(transferAmount);
  if (!normalizedGatewayId || normalizedGatewayId.length > 128) {
    return json({
      success: false,
      error: 'BadRequest: Thiếu transaction ID từ cổng thanh toán.'
    }, { status: 400 });
  }
  if (!['in', 'out'].includes(transferType) || !Number.isSafeInteger(amount) || amount <= 0 || typeof content !== 'string' || content.length > 1000) {
    return json({ success: false, error: 'ValidationError: transferType, transferAmount hoặc content không hợp lệ.' }, { status: 400 });
  }

  const db = platform?.env?.DB;
  if (!db) {
    // If running in development without binding, fail-closed per security guidelines
    return json({
      success: false,
      error: 'DatabaseUnavailable: Cloudflare D1 binding platform.env.DB không khả dụng.'
    }, { status: 503 });
  }
  if (typeof db.batch !== 'function') {
    return json({ success: false, error: 'PaymentTransactionError: D1 db.batch là bắt buộc.' }, { status: 503 });
  }

  try {
    // 3. Idempotency Guard: Check if transaction already processed
    const existing = await db.prepare(`
      SELECT id, status, bill_id, amount FROM tuition_transactions
      WHERE gateway_transaction_id = ?
      LIMIT 1;
    `).bind(normalizedGatewayId).first();

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
    const newTxId = `tx_sp_${crypto.randomUUID()}`;
    let txStatus = 'confirmed';
    let billUpdated = false;

    if (transferType === 'out') {
      txStatus = 'reversed';
    } else if (targetBill) {
      // If payment meets or exceeds bill amount, mark bill paid/confirmed
      if (amount >= targetBill.total_amount) {
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
        amount,
        txStatus,
        'sepay',
        normalizedGatewayId,
        String(referenceCode || '').slice(0, 200),
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
        `aud_sp_${crypto.randomUUID()}`,
        `PAYMENT_SEPAY_${txStatus.toUpperCase()}`,
        'system:sepay_webhook',
        'system',
        JSON.stringify({
          gatewayTxId: normalizedGatewayId,
          amount,
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
      error: 'InternalServerError: Lỗi xử lý webhook SePay.'
    }, { status: 500 });
  }
}
