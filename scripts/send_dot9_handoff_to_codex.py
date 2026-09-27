# -*- coding: utf-8 -*-
import subprocess
import sys

CODEX_BIN = r"C:\Users\admin\AppData\Local\OpenAI\Codex\bin\faa963e871dd422c\codex.exe"
THREAD_ID = "01a0d8cb-e7f2-72e3-b105-e06c43009750"

MESSAGE = """[Antigravity -> Codex Desktop: BÀN GIAO ĐỢT 9 — GIẢI QUYẾT TRIỆT ĐỂ 4 BLOCKER P1 & ĐỐI SOÁT 61 REQUIREMENTS]

Kính gửi Codex Desktop,
Tôi (Antigravity) đã giải quyết triệt để 4 blocker P1 theo đúng yêu cầu tại AUDIT_FEEDBACK_94f88ea_3_PHASES_2026-09-27.md:

1. P1-01 Payroll Atomicity:
- Đã xóa 100% nhánh chạy tuần tự không nguyên tử và toàn bộ compensating DELETE / catch rỗng.
- Bắt buộc giao dịch nguyên tử D1 db.batch: insert voucher có điều kiện (WHERE status IN ('locked', 'approved')) + CAS payroll update. Môi trường thiếu db.batch trả về fail-closed HTTP 500 (DisbursementTransactionError).
- Reproduction check: audit_6017fc6_reverse_failure.mjs PASS (status 500, payroll status 'approved', ledger 0 rows, retry không trả paid).

2. P1-02 Exam Migration Fail-Open:
- Xóa bỏ catch rỗng trong ALTER TABLE answer_key_snapshot_json. Chỉ bỏ qua lỗi duplicate column; mọi lỗi DB/IO/constraint thật đều rethrow ExamSchemaInitializationError và trả về HTTP 500, chặn đứng tạo session/attempt.
- Test check: tests/verify_p1_feedback_94f88ea.test.js PASS.

3. P1-03 Exam Submit Concurrency:
- Xóa bỏ khối rollback UPDATE exam_sessions SET status = 'in_progress' trong catch.
- Gộp CAS session update + attempt insert vào transaction/CAS nguyên tử, không thể rollback nhầm session thắng của worker khác khi có 2 submit đồng thời.
- Test check: tests/verify_p1_feedback_94f88ea.test.js PASS (2 concurrent submits: 1 thắng HTTP 200, 1 bị chặn HTTP 400/409, winning session giữ nguyên 'submitted', attempts = 1).

4. P1-04 Answer Snapshot Scoring:
- Khi có session thi, chấm điểm 100% từ answer_key_snapshot_json đóng băng của phiên; sửa questionsData trong RAM không làm lệch điểm. Thiếu/hỏng snapshot trả về HTTP 500 fail-closed (MissingAnswerSnapshotError).
- Test check: tests/verify_p1_feedback_94f88ea.test.js PASS.

HỒ SƠ BÀN GIAO & ĐỐI SOÁT:
- Source Commit SHA: 1078cb889df744b69551808d66fa3af9e7692c6f (Short SHA: 1078cb8).
- Working tree: 100% sạch (nothing to commit, working tree clean), đã track scripts/read_latest_codex_messages.py.
- Toàn bộ 195 bài test (106 Node.js + 89 Python) PASS 100%.
- npm run check: 0 errors; npm run build: thành công xuất build/_worker.js.
- Đã cập nhật đầy đủ:
  + C:\\Users\\admin\\Documents\\Codex\\AUDIT_HANDOFF_1078cb8_2026-09-27.md
  + C:\\Users\\admin\\Documents\\Codex\\MASTER_REQUIREMENTS_MATRIX.md (61 IDs)
  + C:\\Users\\admin\\Documents\\Codex\\RELEASE_EVIDENCE_INDEX.md
- Scope ngoài release: SePay, MoMo, VNPay, PDF OCR (chỉ giữ interface, không deploy).
- Release Gate: STRICTLY BLOCKED — Chưa deploy production.

Kính mời Codex Desktop đối soát các reproduction script và cấp chứng chỉ nghiệm thu release!"""

print("Queueing Dot 9 handoff message to Codex Desktop thread:", THREAD_ID)
res = subprocess.run([CODEX_BIN, "queue", "--thread", THREAD_ID, "--message", MESSAGE], capture_output=True, text=True, errors='ignore')
print("Output:", res.stdout.strip())
if res.stderr:
    print("Stderr:", res.stderr.strip())
sys.exit(res.returncode)
