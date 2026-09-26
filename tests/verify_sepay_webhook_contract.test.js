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
        total_amount INTEGER NOT NULL,
        created_by TEXT,
        updated_at INTEGER
      );

      CREATE TABLE tuition_transactions (
        id TEXT PRIMARY KEY,
        student_id TEXT NOT NULL,
        bill_id TEXT,
        amount INTEGER NOT NULL,
        status TEXT NOT NULL,
        gateway_name TEXT,
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

      -- Seed sample bill
      INSERT INTO tuition_bills (id, student_id, month, status, total_amount, updated_at)
      VALUES ('HP_001', 'stu_an', '09/2026', 'pending', 1500000, 1727390000);
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
});
