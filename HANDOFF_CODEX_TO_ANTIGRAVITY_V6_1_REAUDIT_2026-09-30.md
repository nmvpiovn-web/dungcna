# CODEX RE-AUDIT V6.1

**Ngày:** 30/09/2026  
**Working tree:** `C:\Users\admin\.gemini\antigravity\scratch\tienganh7-sveltekit`  
**Kết luận:** Chưa nghiệm thu deploy. Bốn nhóm sửa đã xác nhận đúng, nhưng luồng Random Exam và SePay vẫn còn lỗi tích hợp không nằm trong các test mới.

## Kết quả chạy độc lập

| Gate | Kết quả |
|---|---:|
| `npm run check` | PASS — 0 errors, 70 warnings |
| 4 contract suites V6.1 | PASS — 20/20 |
| `npm run test:v5-gate` | PASS — 24/24 |
| `node scripts/run_deep_qa_audit.mjs` | PASS — 64/64; GUEST-05 chạy đủ timer/answer/submit |
| `npm run build` | PASS — 9.27s |

Evidence độc lập:

- `artifacts/v5-module-gate/2026-09-30T08-59-35-146Z`
- `artifacts/deep-qa-audit/2026-09-30T09-01-51-221Z`

## Các phần V6.1 đã xác nhận đúng

1. Auth session có `sid` đã từ chối session thiếu, revoked, expired và lỗi query. Codex cũng fault-inject trực tiếp lỗi INSERT session; `/api/auth/token` trả 500.
2. `/api/exams/random` đã validate allowlist và SQL có điều kiện `skill_category`.
3. SePay underpayment không còn chuyển bill sang `paid` trong fixture SP-06.
4. GUEST-05 không còn nhánh tùy chọn; có assert timer giảm, chọn đáp án, tiến độ và màn kết quả.
5. `parseStudentGrade` trong source map đúng 1..12; dropdown đã đủ 12 lớp.

## Blocker còn lại

### 1. P0 — Random Exam chỉ pass ở API test giả lập, luồng UI thật bị vỡ

- Fresh migrations tạo `question_bank` nhưng không seed hoặc migrate câu hỏi. Codex query database sau gate: `question_bank_count = 0`. Các câu hỏi chỉ được INSERT trong `tests/verify_random_exam_skill_api.test.js`, nên endpoint thật luôn thiếu quota trên D1 trắng.
- API test dùng `options_json` là mảng chuỗi như `['A. a', 'B. b']`. UI tại `src/routes/exam/+page.svelte:536` lại coi từng phần tử là object và tạo ``${o.id}. ${o.text}``, kết quả hiển thị `undefined. undefined`.
- `/api/exams/random` tạo `exam_instances` và có handler submit riêng tại `src/routes/api/exams/random/+server.js:241`. UI chỉ gọi endpoint random khi tạo đề; lúc bắt đầu và nộp lại gọi `/api/exams` tại `src/routes/exam/+page.svelte:360` và `:726`.
- `/api/exams` không biết snapshot từ `question_bank`; với ID đề động, nó tạo `answer_key_snapshot_json = {}` và khi nộp sẽ trả `EmptyAnswerSnapshotError`.

**Yêu cầu sửa:**

1. Chọn một lifecycle duy nhất cho đề random. Khuyến nghị dùng `/api/exams/random` cho cả create và submit, giữ nguyên `instance_id` do create trả về.
2. Chuẩn hóa `options` ở biên API thành một shape duy nhất hoặc cho UI hỗ trợ cả string và object.
3. Thêm migration/seed/import chuyển dữ liệu thật từ `questions` sang `question_bank`, bao gồm grade, cognitive level và skill chính xác. Không gán mặc định toàn bộ thành grammar.
4. Thêm E2E đăng nhập học sinh: tạo đề grammar → kiểm tra text option → trả lời → submit qua server → kiểm tra score và D1 snapshot.

### 2. P0 — SePay không match được ID bill thực của hệ thống

Regex hiện tại tại `src/routes/api/webhook/sepay/+server.js:85` chỉ nhận `HP_` hoặc `BILL_` theo sau trực tiếp bởi chữ số.

Kết quả thực tế:

| Nội dung chuyển khoản | Regex trích ra |
|---|---|
| `HP_G7_001` — seed migration | `null` |
| `bill_2026_10_001` — dữ liệu thật | `bill_2026` |
| `HP_BAOANH_T10` — VietQR addInfo | `null` |
| `HP_001` — fixture test | `HP_001` |

`tests/verify_sepay_webhook_contract.test.js` chỉ dùng ID nhân tạo `HP_001/HP_002`, nên 6/6 không chứng minh webhook match được bill do `/api/tuition` tạo (`bill_${Date.now()}`) hoặc bill hiện có.

**Yêu cầu sửa:**

1. Không suy đoán ID bằng regex hẹp. Dùng payment reference/code được phát hành và lưu cùng bill, hoặc match chính xác một token allowlisted rồi query nguyên chuỗi.
2. Thêm contract cases cho `HP_G7_001`, `bill_2026_10_001`, `bill_<timestamp>` và VietQR `addInfo` thực tế.
3. Case bắt buộc xác nhận đúng `matched_bill_id`, không chỉ HTTP 200.

### 3. P1 — Test Random Exam chưa kiểm tra hợp đồng client

Ba test mới chỉ gọi create API với database tự seed. Chúng không chạy `src/routes/exam/+page.svelte`, không start/submit instance và không kiểm tra persistence sau submit. Vì vậy 20/20 và 64/64 vẫn xanh dù hai lỗi Random Exam ở trên tồn tại.

## Điều kiện nghiệm thu tiếp

1. Sửa hai blocker P0.
2. Bổ sung E2E Random Exam đầy đủ và SePay tests dùng ID thật.
3. Chạy lại 20 contract tests, gate 24, deep QA 64 và build.
