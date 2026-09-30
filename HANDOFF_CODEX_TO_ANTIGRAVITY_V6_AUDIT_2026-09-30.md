# CODEX AUDIT RETURN: V5 UI / EXAM / FLASHCARD / DEEP QA

**Ngày:** 30/09/2026  
**Working tree:** `C:\Users\admin\.gemini\antigravity\scratch\tienganh7-sveltekit`  
**Phạm vi loại trừ:** Không kiểm tra hoặc ghi lại Zalo bot token.

## Kết luận nghiệm thu

**Chưa nghiệm thu để deploy.** Hai bộ kiểm thử mới đều chạy xanh trên D1 trắng, nhưng còn lỗi ở auth session, tạo đề theo kỹ năng và SePay. Production hiện vẫn chạy build cũ nên chưa thể dùng làm bằng chứng cho bản bàn giao này.

## Kết quả Codex chạy độc lập

| Kiểm tra | Kết quả | Bằng chứng |
|---|---:|---|
| `npm run check` | PASS | 0 errors, 70 warnings / 13 files |
| `npm run test:v5-gate` | PASS | 24/24, `artifacts/v5-module-gate/2026-09-30T08-22-14-277Z` |
| `node scripts/run_deep_qa_audit.mjs` | PASS theo suite hiện tại | 64/64, `artifacts/deep-qa-audit/2026-09-30T08-25-16-358Z` |
| SePay contract suite | FAIL | 3 case SP-03, SP-04, SP-05 trả 500 thay vì 200 |
| Production smoke | FAIL | 1/4 nhóm pass, `artifacts/production-smoke/2026-09-30T08-33-15-545Z` |

## Lỗi phải sửa

### 1. P0 — Auth session đang fail-open

- `src/routes/api/auth/token/+server.js:79-91` vẫn phát token khi INSERT `auth_sessions` lỗi.
- `src/lib/server/auth.js:304-328` chỉ từ chối khi tìm thấy session có `revoked_at`; session không tồn tại, thiếu bảng hoặc lỗi truy vấn vẫn được xác thực.
- Codex đã tạo token có `sid=missing-session` và mock D1 trả `null`; `verifyServerAuth` trả `authenticated=true`, HTTP 200.

**Yêu cầu:** Login phải trả lỗi nếu không lưu được session. Token có `sid` phải bị 401 khi session không tồn tại, hết hạn, bị revoke hoặc truy vấn session lỗi. Thêm test cho cả bốn nhánh.

### 2. P0 — `/api/exams/random` bỏ qua `skill_category`

- UI gửi `skill_category` tại `src/routes/exam/+page.svelte:499-507`.
- Backend `src/routes/api/exams/random/+server.js:92-114` chỉ lọc `grade_level` và `cognitive_level`; không đọc hoặc bind `skill_category`.
- Sau khi API trả thành công, UI tự gắn `skill: randomSkill` lên mọi câu nên giao diện có thể ghi “grammar/reading” dù câu hỏi D1 bị trộn.

**Yêu cầu:** Validate allowlist `all|grammar|vocabulary|phonics|reading`; khi khác `all`, thêm điều kiện SQL theo cột kỹ năng thật. Trả 400 nếu ngân hàng không đủ quota cho đúng grade + skill + cognitive level. Thêm API test kiểm tra mọi question ID trả về thuộc nhóm yêu cầu.

### 3. P0 — SePay regression và nguy cơ đánh dấu đã thanh toán khi trả thiếu

- Thay đổi SePay có trong working tree dù không được liệt kê rõ trong phần UI bàn giao.
- `node --test tests/verify_sepay_webhook_contract.test.js tests/verify_v5_p0_containment.test.js` có 3 lỗi: SP-03 legitimate payment, SP-04 replay và SP-05 reversal đều trả 500.
- `src/routes/api/webhook/sepay/+server.js:91` dùng `COALESCE(final_amount_vnd, total_amount, amount, 0)`. Migration thêm hai cột đầu với `DEFAULT 0` tại `migrations/0004_v5_schema_alignment.sql:239` và `:260`. Với bill cũ, `COALESCE` chọn `0`, nên bất kỳ khoản tiền dương nào cũng có thể thỏa `amount >= total_amount` và chuyển bill sang `paid`.

**Yêu cầu:** Dùng giá trị dương đầu tiên, ví dụ `COALESCE(NULLIF(final_amount_vnd,0), NULLIF(total_amount,0), amount)`. Đồng bộ fixture/schema của contract test với migration, rồi bắt buộc SP-01..SP-05 pass. Thêm case underpayment không được chuyển bill sang `paid`.

### 4. P1 — GUEST-05 là false-positive

- `tests/qa/full_user_deep_audit.mjs:249-272` chỉ thao tác khi locator hiện hữu và luôn trả `{ examWorkflowExecuted: true }`.
- Case vẫn PASS khi không có nút bắt đầu, không có option, không có nút nộp. Tên case nói kiểm tra timer decrement nhưng không đọc timer trước/sau.

**Yêu cầu:** Assert nút bắt đầu tồn tại; assert vào Exam Hall; assert timer giảm; assert option đã được lưu; assert số câu đã trả lời đổi; submit và assert màn kết quả. Không dùng `if (isVisible())` cho bước bắt buộc.

### 5. P1 — Bộ 64 case không phải production QA

- Runner tự ghi `localOnly: true` tại `scripts/run_deep_qa_audit.mjs:27` và luôn dựng D1 trắng từ migration 0001-0004.
- Vì vậy 64/64 không kiểm tra database đang chạy, dữ liệu cũ hoặc đường nâng cấp schema.
- Production `/build_meta.json` hiện là commit `d3ec8d8`, build lúc `2026-09-29T09:13:00.891Z`. Bản local đang dựa trên `8390ea9` cộng working tree chưa commit.
- Smoke production: `/`, `/flashcards`, `/dictionary`, `/exam` trả 200; `/flashcards` tràn ngang 347px ở viewport 320px; cả hai tài khoản bàn giao trả 401.

**Yêu cầu:** Deploy preview đúng commit cần nghiệm thu, tạo hoặc xác nhận lại tài khoản QA trên môi trường đó, rồi chạy `scripts/audit_production_smoke.mjs`. Không ghi 64/64 local thành bằng chứng production.

### 6. P2 — Auto-scope từ điển theo lớp chưa bao phủ đúng

- `src/routes/dictionary/+page.svelte:69-72` chỉ map lớp 7, 10, 12; regex `[345]` map cả lớp 4 và 5 thành `Lớp 3`.
- Học sinh lớp 1, 2, 6, 8, 9, 11 không được scope; lớp 4/5 bị scope sai.

**Yêu cầu:** Chuẩn hóa grade bằng một hàm parse số lớp và gán đúng `Lớp N`. Thêm test cho 1..12 và metadata dạng số/string.

## Phần đã xác nhận tốt

- Năm file UI trong bàn giao đều compile và không có lỗi Svelte.
- Gate 24 case xác nhận persistence schedule/evaluation, logout ở happy path, flashcard flip/shuffle và local responsive 320/360/390/844.
- Deep QA local hiện chạy đủ 64 record và tạo evidence có thể tái lập.
- Dark/Sky tokens, giới hạn synonym/antonym, lưới lộ trình, Exam Hall 8/4 và sửa `Object.values(userAnswers)` đều có mặt trong source.

## Điều kiện nghiệm thu lại

1. Sửa mục 1-3 và thêm regression test tương ứng.
2. Sửa GUEST-05 để không thể pass khi bỏ qua workflow.
3. Chạy lại `npm run check`, `npm run test:v5-gate`, SePay contract suite và deep QA.
4. Deploy preview đúng source rồi chạy production smoke với tài khoản hợp lệ.
