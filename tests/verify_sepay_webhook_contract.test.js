import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { POST as postSepayWebhook } from '../src/routes/api/webhook/sepay/+server.js';

function createD1Adapter(sqliteDb) {
  return {
    prepare(sql) {
      let boundArgs = [];
      return {
        bind(...args) {
          boundArgs = args;
          return this;
        },
        async first() {
          const stmt = sqliteDb.prepare(sql);
          return stmt.get(...boundArgs) || null;
        },
        async all() {
          const stmt = sqliteDb.prepare(sql);
          return { results: stmt.all(...boundArgs) };
        },
        async run() {
          const stmt = sqliteDb.prepare(sql);
          const res = stmt.run(...boundArgs);
          return { meta: { changes: Number(res.changes) } };
        }
      };
    },
    async batch(statements) {
      sqliteDb.exec('BEGIN TRANSACTION');
      try {
        const results = [];
        for (const s of statements) {
          const r = await s.run();
          results.push(r);
        }
        sqliteDb.exec('COMMIT');
        return results;
      } catch (err) {
        try { sqliteDb.exec('ROLLBACK'); } catch {}
        throw err;
      }
    }
  };
}

describe('SEPAY PAYMENT WEBHOOK CONTRACT AUDIT SUITE', () => {
  let sqliteDb;
  let mockPlatform;
  const TEST_SEPAY_SECRET = 'sepay_secret_test_token_2026_audit';

  before(() => {
    sqliteDb = new DatabaseSync(':memory:');

    // Create required tables
    sqliteDb.exec(`
      CREATE TABLE tuition_bills (
        id TEXT PRIMARY KEY,
        student_id TEXT NOT NULL,
        month TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        amount REAL DEFAULT 0,
        final_amount_vnd REAL DEFAULT 0,
        total_amount REAL NOT NULL,
        vietqr_url TEXT,
        created_by TEXT,
        updated_at INTEGER
      );

      CREATE TABLE tuition_transactions (
        id TEXT PRIMARY KEY,
        student_id TEXT NOT NULL,
        bill_id TEXT,
        amount INTEGER NOT NULL,
        status TEXT NOT NULL,
        gateway TEXT DEFAULT 'sepay',
        gateway_name TEXT DEFAULT 'sepay',
        gateway_transaction_id TEXT,
        reference_code TEXT,
        transfer_content TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE UNIQUE INDEX idx_tx_gateway ON tuition_transactions(gateway_transaction_id);

      CREATE TABLE audit_logs (
        id TEXT PRIMARY KEY,
        action TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        actor_role TEXT NOT NULL,
        details TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      -- Seed sample bills (HP_001, HP_002, and real bill IDs)
      INSERT INTO tuition_bills (id, student_id, month, status, total_amount, amount, final_amount_vnd, vietqr_url, updated_at)
      VALUES
        ('HP_001', 'stu_an', '09/2026', 'pending', 1500000, 1500000, 1500000, NULL, 1727390000),
        ('HP_002', 'stu_binh', '09/2026', 'pending', 2000000, 2000000, 2000000, NULL, 1727390000),
        ('HP_G7_001', 'stu_g7', '10/2026', 'pending', 1200000, 1200000, 1200000, NULL, 1727390000),
        ('bill_2026_10_001', 'stu_mai', '10/2026', 'pending', 1800000, 1800000, 1800000, NULL, 1727390000),
        ('bill_1727702384912', 'stu_nam', '10/2026', 'pending', 2500000, 2500000, 2500000, NULL, 1727390000),
        ('bill_oct_baoanh', 'BAOANH', '10/2026', 'pending', 1600000, 1600000, 1600000, 'https://img.vietqr.io/image/970422-0901234567-compact2.png?amount=1600000&addInfo=HP_BAOANH_T10&accountName=NGUYEN%20MINH%20VU', 1727390000);
    `);

    mockPlatform = {
      env: {
        DB: createD1Adapter(sqliteDb),
        SEPAY_WEBHOOK_SECRET: TEST_SEPAY_SECRET
      }
    };
  });

  test('SP-01: Unauthorized access without correct API key rejected with 401', async () => {
    const req = new Request('http://localhost/api/webhook/sepay', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Apikey wrong_secret_key'
      },
      body: JSON.stringify({ id: 99991 })
    });

    const res = await postSepayWebhook({ request: req, platform: mockPlatform });
    assert.strictEqual(res.status, 401, 'Wrong API key must be rejected with 401');
    const json = await res.json();
    assert.strictEqual(json.success, false);
  });

  test('SP-02: Missing gateway transaction ID rejected with 400', async () => {
    const req = new Request('http://localhost/api/webhook/sepay', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Apikey ${TEST_SEPAY_SECRET}`
      },
      body: JSON.stringify({ transferAmount: 500000 })
    });

    const res = await postSepayWebhook({ request: req, platform: mockPlatform });
    assert.strictEqual(res.status, 400, 'Payload without id must return 400');
  });

  test('SP-03: Legitimate incoming payment matches bill HP_001 and updates state to paid', async () => {
    const req = new Request('http://localhost/api/webhook/sepay', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TEST_SEPAY_SECRET}`
      },
      body: JSON.stringify({
        id: 700101,
        gateway: 'MBBank',
        transferType: 'in',
        transferAmount: 1500000,
        content: 'Nop tien hoc phi HP_001 cho be An',
        referenceCode: 'MB.700101'
      })
    });

    const res = await postSepayWebhook({ request: req, platform: mockPlatform });
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.success, true);
    assert.strictEqual(json.status, 'confirmed');
    assert.strictEqual(json.matched_bill_id, 'HP_001');
    assert.strictEqual(json.bill_status, 'paid');

    // Verify DB update
    const bill = sqliteDb.prepare('SELECT status FROM tuition_bills WHERE id = ?').get('HP_001');
    assert.strictEqual(bill.status, 'paid', 'Bill status in database must be updated to paid');

    const tx = sqliteDb.prepare('SELECT * FROM tuition_transactions WHERE gateway_transaction_id = ?').get('700101');
    assert.ok(tx, 'Transaction record must exist in tuition_transactions');
    assert.strictEqual(tx.amount, 1500000);

    const audit = sqliteDb.prepare('SELECT * FROM audit_logs WHERE action = ?').get('PAYMENT_SEPAY_CONFIRMED');
    assert.ok(audit, 'Audit log entry must be created');
  });

  test('SP-04: Idempotency Replay: Re-submitting same gateway ID returns 200 already_processed', async () => {
    const replayReq = new Request('http://localhost/api/webhook/sepay', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Apikey ${TEST_SEPAY_SECRET}`
      },
      body: JSON.stringify({
        id: 700101, // Same ID
        transferType: 'in',
        transferAmount: 1500000,
        content: 'Nop tien hoc phi HP_001'
      })
    });

    const res = await postSepayWebhook({ request: replayReq, platform: mockPlatform });
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.success, true);
    assert.strictEqual(json.status, 'already_processed', 'Idempotent handler must return already_processed');
  });

  test('SP-05: Outgoing refund/reversal records status as reversed', async () => {
    const refundReq = new Request('http://localhost/api/webhook/sepay', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Apikey ${TEST_SEPAY_SECRET}`
      },
      body: JSON.stringify({
        id: 700102,
        gateway: 'MBBank',
        transferType: 'out',
        transferAmount: 500000,
        content: 'Hoan tra hoc phi du',
        referenceCode: 'MB.REFUND.700102'
      })
    });

    const res = await postSepayWebhook({ request: refundReq, platform: mockPlatform });
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.status, 'reversed', 'Outgoing transfer must transition to reversed');

    const tx = sqliteDb.prepare('SELECT status FROM tuition_transactions WHERE gateway_transaction_id = ?').get('700102');
    assert.strictEqual(tx.status, 'reversed');
  });

  test('SP-06: Underpayment does not transition bill to paid', async () => {
    const underpayReq = new Request('http://localhost/api/webhook/sepay', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TEST_SEPAY_SECRET}`
      },
      body: JSON.stringify({
        id: 700103,
        gateway: 'MBBank',
        transferType: 'in',
        transferAmount: 500000, // Bill HP_002 is 2,000,000
        content: 'Thanh toan mot phan HP_002',
        referenceCode: 'MB.UNDERPAY.700103'
      })
    });

    const res = await postSepayWebhook({ request: underpayReq, platform: mockPlatform });
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.success, true);
    assert.strictEqual(json.status, 'confirmed');
    assert.strictEqual(json.matched_bill_id, 'HP_002');
    assert.notStrictEqual(json.bill_status, 'paid', 'Bill status must NOT transition to paid on underpayment');

    const bill = sqliteDb.prepare('SELECT status FROM tuition_bills WHERE id = ?').get('HP_002');
    assert.strictEqual(bill.status, 'pending', 'Bill in DB must remain pending when payment is insufficient');
  });

  test('SP-07: Real seed bill HP_G7_001 matched and transitions to paid', async () => {
    const req = new Request('http://localhost/api/webhook/sepay', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TEST_SEPAY_SECRET}`
      },
      body: JSON.stringify({
        id: 700104,
        gateway: 'Vietcombank',
        transferType: 'in',
        transferAmount: 1200000,
        content: 'Chuyen tien hoc HP_G7_001 tu Techcombank',
        referenceCode: 'VCB.700104'
      })
    });

    const res = await postSepayWebhook({ request: req, platform: mockPlatform });
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.success, true);
    assert.strictEqual(json.matched_bill_id, 'HP_G7_001', 'Must match exact seed bill HP_G7_001');
    assert.strictEqual(json.bill_status, 'paid');

    const bill = sqliteDb.prepare('SELECT status FROM tuition_bills WHERE id = ?').get('HP_G7_001');
    assert.strictEqual(bill.status, 'paid');
  });

  test('SP-08: Real production bill bill_2026_10_001 matched and transitions to paid', async () => {
    const req = new Request('http://localhost/api/webhook/sepay', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Apikey ${TEST_SEPAY_SECRET}`
      },
      body: JSON.stringify({
        id: 700105,
        gateway: 'MBBank',
        transferType: 'in',
        transferAmount: 1800000,
        content: 'Thanh toan bill_2026_10_001 tien hoc thang 10',
        referenceCode: 'MB.700105'
      })
    });

    const res = await postSepayWebhook({ request: req, platform: mockPlatform });
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.success, true);
    assert.strictEqual(json.matched_bill_id, 'bill_2026_10_001', 'Must match exact bill bill_2026_10_001');
    assert.strictEqual(json.bill_status, 'paid');

    const bill = sqliteDb.prepare('SELECT status FROM tuition_bills WHERE id = ?').get('bill_2026_10_001');
    assert.strictEqual(bill.status, 'paid');
  });

  test('SP-09: Timestamped bill bill_1727702384912 matched and transitions to paid', async () => {
    const req = new Request('http://localhost/api/webhook/sepay', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TEST_SEPAY_SECRET}`
      },
      body: JSON.stringify({
        id: 700106,
        gateway: 'VPBank',
        transferType: 'in',
        transferAmount: 2500000,
        content: 'KH bill_1727702384912 chuyen hoc phi',
        referenceCode: 'VPB.700106'
      })
    });

    const res = await postSepayWebhook({ request: req, platform: mockPlatform });
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.success, true);
    assert.strictEqual(json.matched_bill_id, 'bill_1727702384912', 'Must match timestamped bill ID');
    assert.strictEqual(json.bill_status, 'paid');

    const bill = sqliteDb.prepare('SELECT status FROM tuition_bills WHERE id = ?').get('bill_1727702384912');
    assert.strictEqual(bill.status, 'paid');
  });

  test('SP-10: VietQR addInfo HP_BAOANH_T10 matched to bill_oct_baoanh via QR link', async () => {
    const req = new Request('http://localhost/api/webhook/sepay', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TEST_SEPAY_SECRET}`
      },
      body: JSON.stringify({
        id: 700107,
        gateway: 'MBBank',
        transferType: 'in',
        transferAmount: 1600000,
        content: 'HP_BAOANH_T10 MBVCB.700107',
        referenceCode: 'MB.700107'
      })
    });

    const res = await postSepayWebhook({ request: req, platform: mockPlatform });
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.success, true);
    assert.strictEqual(json.matched_bill_id, 'bill_oct_baoanh', 'Must match bill_oct_baoanh via VietQR addInfo');
    assert.strictEqual(json.bill_status, 'paid');

    const bill = sqliteDb.prepare('SELECT status FROM tuition_bills WHERE id = ?').get('bill_oct_baoanh');
    assert.strictEqual(bill.status, 'paid');
  });
});
