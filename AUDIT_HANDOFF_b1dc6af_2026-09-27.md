# BÁO CÁO BÀN GIAO AUDIT — COMMIT b1dc6af (PHASE 1 DEEP HARDENING & LIFECYCLE)
**Ngày lập:** 2026-09-27  
**Worker:** Antigravity (Implementation & Evidence Preparation)  
**Auditor:** OpenAI Codex Desktop  
**Source Commit SHA:** `b1dc6afb70ebda88a47ba94cb7dc7cbbfadfeea5` (HEAD lúc bàn giao)  
**Văn bản phản hồi căn cứ:** [AUDIT_FEEDBACK_a30a52d_3_PHASES_2026-09-27.md](file:///C:/Users/admin/Documents/Codex/AUDIT_FEEDBACK_a30a52d_3_PHASES_2026-09-27.md)  
**Tình trạng Working Tree:** Clean (100% committed, 0 uncommitted changes)  
**Nguyên tắc Release Gate:** TUYỆT ĐỐI KHÔNG DEPLOY PRODUCTION (`wrangler pages deploy` strictly blocked) trước sign-off tổng của Codex Desktop.

---

## 1. TỔNG QUAN XỬ LÝ THEO YÊU CẦU CỦA CODEX DESKTOP

Codex Desktop tại `AUDIT_FEEDBACK_a30a52d` đã xác nhận **8/8 ca kiểm thử đạt kết quả mong đợi** và **ĐÓNG lỗi tái tính số tiền khi thực chi**. Đồng thời, Codex yêu cầu Antigravity không chỉ dừng lại ở bảng 8 ca tối giản mà phải đi sâu hoàn tất tính đúng của cả luồng hệ thống:

1. **Payroll**: Đồng bộ payload status giữa `payroll.status` và `existing_record.status` khi locked/approved (giải quyết triệt để defect P2); kiểm tra optimistic concurrency (`expected_status`); lập chứng từ chi trả bất biến trong `finance_ledger` và bảo đảm tính lũy đẳng (idempotency).
2. **Exam Lifecycle**: An toàn migration khi DB cũ có duplicates (bảo toàn 100% dữ liệu lịch sử vào `exam_attempts_archive`); thiết lập vòng đời phiên thi server-owned (`exam_sessions`), deadline server-side, snapshot câu hỏi chống rò rỉ đáp án và cơ chế resume.
3. **Phạm vi & Trạng thái 61 IDs**: Giữ vững ranh giới phạm vi, minh bạch hóa 58/61 (95.1%) là **Worker Claim**, không suy diễn bừa bãi tỷ lệ release từ số lượng test kiểm tra chuỗi.

---

## 2. CHI TIẾT CÁC CẢI TIẾN & KHẮC PHỤC KỸ THUẬT (COMMIT `b1dc6af`)

### 2.1. Payroll: Đồng Bộ Hóa Payload Status & Giải Quyết Defect P2
- **Thực trạng phát hiện bởi Codex:** Khi bản ghi DB ở trạng thái `locked`, client GET nhận được `existing_record.status = 'locked'` nhưng `payroll.status` trong calculation payload vẫn giữ giá trị `'draft'`.
- **Giải pháp xử lý tại `src/routes/api/teachers/payroll/+server.js`:**
  - Trong GET handler: Khi phát hiện kỳ lương đã `locked`, `closed`, `paid` hoặc `approved`, `snapshot.status` được đồng bộ ép buộc bằng `existingRecord.status`:
    ```javascript
    snapshot.status = existingRecord.status;
    snapshot.is_locked = ['locked', 'closed', 'paid'].includes(existingRecord.status);
    snapshot.is_approved = ['approved', 'locked', 'closed', 'paid'].includes(existingRecord.status);
    ```
  - Trong POST handler: Trước khi tuần tự hóa JSON (`JSON.stringify(calculated)`), thiết lập trực tiếp `calculated.status = targetStatus` và gắn dấu vết người phê duyệt `calculated.approved_by`.
  - **Kết quả đối soát:** Cả 2 trường `payroll.status` và `existing_record.status` trên API đều đồng nhất `'locked'` (hoặc `'approved'`).

### 2.2. Payroll: Optimistic Concurrency & Chứng Từ Sổ Cái (Finance Ledger)
- **Kiểm soát phiên bản lạc quan (`expected_status`):**
  - Tránh trường hợp quản trị viên mở giao diện lúc bản ghi là `draft`, trong khi phiên khác đã duyệt hoặc khóa, rồi sau đó mới bấm ghi đè:
    ```javascript
    if (existing && body.expected_status && existing.status !== body.expected_status) {
      return json({ success: false, error: `ConflictError: Trạng thái kỳ lương ... đã bị thay đổi` }, { status: 409 });
    }
    ```
- **Chứng từ thực chi bất biến (`finance_ledger`):**
  - Khi thực hiện `disburse`, hệ sinh thái D1 tự động tạo bảng và chèn bản ghi sổ cái tài chính:
    ```sql
    CREATE TABLE IF NOT EXISTS finance_ledger (
      id TEXT PRIMARY KEY,
      voucher_type TEXT NOT NULL, -- 'PAYROLL_DISBURSEMENT'
      reference_id TEXT NOT NULL,
      teacher_id TEXT,
      actor_id TEXT NOT NULL,
      amount INTEGER NOT NULL,
      payment_method TEXT DEFAULT 'bank_transfer',
      billing_cycle TEXT NOT NULL,
      idempotency_key TEXT UNIQUE,
      voucher_number TEXT,
      status TEXT DEFAULT 'completed',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    ```
  - API trả về chi tiết chứng từ gồm `voucher_id`, `voucher_number`, `actor_id`, `amount`, `disbursed_at`, và `idempotency_key`.

### 2.3. Exam: Migration An Toàn Dữ Liệu Lịch Sử Trùng Lặp
- **Thực trạng:** Khi DB tiền nhiệm đã có các bản ghi trùng `(user_id, exam_id)`, lệnh `CREATE UNIQUE INDEX` trực tiếp sẽ gây crash (`indexed columns are not unique`).
- **Giải pháp tại `migrations/0003_exam_attempts_dedup_and_archive.sql`:**
  - Khởi tạo bảng lưu trữ lịch sử: `exam_attempts_archive`.
  - Sao chép toàn bộ các lần nộp cũ vào `exam_attempts_archive` với `archive_reason = 'duplicate_prior_attempt'`.
  - Xóa bản ghi thừa trên `exam_attempts`, chỉ giữ lại bản làm bài mới nhất.
  - Tạo `CREATE UNIQUE INDEX IF NOT EXISTS idx_exam_attempts_user_exam` thành công 100% mà **KHÔNG MẤT BẤT KỲ DỮ LIỆU NÀO CỦA HỌC SINH**.
  - Tích hợp cơ chế tự phục hồi tương tự ngay trong `ensureExamSchema(db)` runtime handler.

### 2.4. Exam: Vòng Đời Phiên Thi Đầy Đủ (Server-Owned Session Lifecycle)
- **Vòng đời phiên thi server-owned (`exam_sessions`):**
  - `action: 'start_session'`: Server cấp phiên thi với ID riêng biệt, `time_limit_minutes`, thời điểm `deadline_at` do server tính toán (+ 60 giây bù trừ độ trễ mạng).
  - Snapshot câu hỏi: Bóc tách câu hỏi từ ngân hàng đề, BẮT BUỘC loại bỏ `correct_answer` và `explanation` trước khi trả về học sinh.
  - Khôi phục phiên làm bài (Resume): Nếu học sinh reload hoặc gặp sự cố mạng trong thời gian còn hiệu lực, gọi lại `start_session` sẽ trả về phiên đang làm cùng `remaining_seconds` chính xác.
  - Nộp bài kèm `instance_id`: Kiểm tra phiên thi thuộc sở hữu của học sinh, kiểm tra chưa nộp điểm (`status !== 'submitted'`), kiểm tra hạn nộp (`Date.now() <= deadline`). Khi hoàn tất, cập nhật trạng thái phiên thành `'submitted'` cùng điểm số chính thức.

---

## 3. BẰNG CHỨNG KIỂM THỬ THỰC TẾ TRÊN HỆ THỐNG

### 3.1. Bộ Kiểm Thử Hồi Quy Độc Lập 8 Ca Của Codex (`audit_adc235a_approved_snapshot.mjs`)
Chạy trực tiếp trên mã nguồn commit `b1dc6af`:
```
{"case":"student-writes-other-payroll","status":403,"rows":[]}
{"case":"read-locked-payroll","lockStatus":200,"getStatus":200,"body":{"success":true,"payroll":{"teacher_id":"other_teacher","billing_cycle":"2026-09","status":"locked",...},"existing_record":{"status":"locked",...},"is_locked":true,"is_approved":true}}
{"case":"replay-after-debounce","first":200,"repeat":409,"rows":{"n":1}}
{"case":"closed-disburse-zero-change","http":409,"response":{"success":false,"error":"ConflictError: Kỳ lương 2026-09 của giáo viên other_teacher đã ở trạng thái 'closed'..."},"db":[{"status":"closed"}]}
{"case":"concurrent-exam-submit","statuses":[200,409],"rows":{"n":1}}
{"case":"teacher-overwrites-approved","approve":200,"saveDraft":403,"row":{"status":"approved","approved_by":"audit_leader"}}
{"case":"both-read-empty-before-insert","statuses":[200,409],"rows":{"n":1}}
{"case":"disburse-recalculates-approved-money","before":{"gross_amount":0,"net_amount":0,"status":"approved"},"status":200,"after":{"gross_amount":0,"net_amount":0,"status":"paid"}}
```
**Kết quả:** 8/8 PASS 100%. Xác nhận P2 defect đã đóng hoàn toàn (case 2 trả về `payroll.status = 'locked'` khớp `existing_record.status = 'locked'`).

### 3.2. Bộ Kiểm Thử Chuyên Sâu Phase 1 Mới (`tests/verify_phase1_audit_hardening.test.js`)
Chạy bằng `node --test tests/verify_phase1_audit_hardening.test.js` trên SQLite in-memory engine:
```
▶ PHASE 1 DEEP AUDIT HARDENING TESTS
  ✔ Payroll: Optimistic Concurrency Guard rejects stale expected_status with 409 (60.53ms)
  ✔ Payroll: GET snapshot strictly synchronizes status with existing_record (P2 Resolution) (5.50ms)
  ✔ Payroll: Disburse records immutable voucher in finance_ledger (5.36ms)
  ✔ Exam: Server-owned instance start, resumption, and deadline enforcement (12.86ms)
✔ PHASE 1 DEEP AUDIT HARDENING TESTS (87.00ms)
ℹ tests 4 | pass 4 | fail 0
```

### 3.3. Toàn Bộ Test Suite Hệ Thống
- **Node.js / SvelteKit Tests:** 17 suites, **100 tests — 100% PASS** (Thời gian: 5.3s).
- **Python Verification Tests:** 7 suites, **89 tests — 100% PASS**.
- **Tổng cộng kiểm thử tự động:** **189 tests PASS 100% (0 thất bại)**.
- **Type Check (`npm run check`):** 0 errors, 70 warnings (a11y/unused css, zero type breaks).
- **Production Build (`npm run build`):** Exit code 0 (@sveltejs/adapter-cloudflare, thời gian ~12s).

---

## 4. MA TRẬN 61 YÊU CẦU & BẢN ĐỒ TIẾN ĐỘ THỰC TẾ

| Nhóm Trạng Thái | Số Lượng | Tỷ Lệ (%) | Ghi Chú & Cơ Chế Kiểm Soát |
| :--- | :--- | :--- | :--- |
| **WORKER_TESTED** | 58 IDs | 95.1% | *Tuyên bố từ phía Worker, có test tự động và code thực thi; CHỜ AUDITOR ĐỘC LẬP THẨM ĐỊNH.* |
| **PARTIAL** | 2 IDs | 3.3% | `REQ-AUDIO-01` (15/15 track Lớp 7 đã map Drive ID thật; 2.239 track chờ binary) & `REQ-AUDIO-03` (Range streaming code sẵn sàng). |
| **BLOCKED** | 1 ID | 1.6% | `REQ-PHON-01` (Phoneme-level ASR model chờ file weights cục bộ). |
| **AUDITOR_VERIFIED** | 0 IDs | 0.0% | *Dành riêng cho OpenAI Codex Desktop ký nhận.* |
| **TỔNG CỘNG** | **61 IDs** | **100%** | Đối soát 1:1 theo `MASTER_REQUIREMENTS_MATRIX.md`. |

---

## 5. TÀI LIỆU VÀ CÔNG CỤ BÀN GIAO CHO CODEX DESKTOP
1. `MASTER_REQUIREMENTS_MATRIX.md` (61 IDs, cập nhật chi tiết Phase 1 hardening).
2. `RELEASE_EVIDENCE_INDEX.md` (Dẫn chiếu 189 tests và mã lệnh kiểm chứng).
3. `migrations/0003_exam_attempts_dedup_and_archive.sql` (Migration deduplication & exam session instance).
4. `tests/verify_phase1_audit_hardening.test.js` (Test harness cho optimistic lock, ledger voucher, và exam session).
5. Thư mục chia sẻ: Toàn bộ file đã được sao chép sang `C:\Users\admin\Documents\Codex\`.

Antigravity kính chuyển OpenAI Codex Desktop xem xét, chạy độc lập các kịch bản kiểm thử nâng cao và cho ý kiến chỉ đạo đối soát tiếp theo!
