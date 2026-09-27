# BÁO CÁO BÀN GIAO AUDIT 3 PHASE — COMMIT `adc235a`
**Dự án:** timbk.io.vn (Nền tảng Sư phạm & Khảo thí Tiếng Anh 7 Global Success)  
**Worker:** Antigravity (Implementation & Self-Audit)  
**Auditor:** OpenAI Codex Desktop (Formal Verification & Gate Sign-off)  
**Ngày bàn giao:** 2026-09-27  
**Source Commit SHA:** `adc235a1de15814bfbda1b4b1a41a457497ecae3` (Short: `adc235a`)  
**Documentation SHA:** `adc235a`  
**Trạng thái Working Tree:** Sạch (`working tree clean`), không có thay đổi chưa commit.

---

## 1. TỔNG QUAN XỬ LÝ 2 CA LỖI CONCURRENCY & PHÂN QUYỀN MỚI

Dựa trên script tái lập đồng thời chuyên sâu `audit_e4ec6e5_concurrency.mjs` từ Codex Desktop:
1. **Case `both-read-empty-before-insert` (Race Condition Exam Attempts):** Hai request cùng đọc "chưa nộp" qua barrier rồi cùng ghi tạo ra 2 attempt trong DB.
2. **Case `teacher-overwrites-approved` (State Machine Degradation):** Giáo viên lưu nháp (`save_draft`) đè lên bảng lương đã được duyệt (`approved`), khiến trạng thái bị hạ cấp về `draft` và mất `approved_by`.

Antigravity đã giải quyết dứt điểm cả hai trường hợp tại commit `adc235a`:

### 1.1. Case `both-read-empty-before-insert`: Ràng Buộc Độc Bản Concurrency (Unique Concurrency Guard)
- **Cơ chế xử lý:**
  1. Thêm chỉ mục duy nhất `CREATE UNIQUE INDEX IF NOT EXISTS idx_exam_attempts_user_exam ON exam_attempts (user_id, exam_id);` trên bảng `exam_attempts`.
  2. Tại thời điểm ghi, nếu hai request đồng thời cùng vượt qua bước đọc dữ liệu rỗng (race condition barrier), chỉ duy nhất 1 request đầu tiên được phép INSERT thành công (HTTP 200). Request thứ hai vi phạm ràng buộc UNIQUE của SQLite sẽ bị bắt tại catch block và trả về HTTP 409 Conflict: `DuplicateSubmissionError: Bài làm cho đề thi này đã được tiếp nhận trong một phiên đồng thời. Chống nộp lặp (Unique Concurrency Guard).`
- **Kết quả kiểm chứng trực tiếp:**
  - `both-read-empty-before-insert`: `statuses: [200, 409]`, `rows: { n: 1 }`.
  - Tuyệt đối không còn rò rỉ bản ghi nộp lặp dù xảy ra race condition.

### 1.2. Case `teacher-overwrites-approved`: Bảo Toàn Tính Bất Biến Của Bảng Lương Đã Duyệt
- **Cơ chế xử lý:**
  1. **Quyền hạn vai trò (RBAC Enforcement):** Trong hàm `POST /api/teachers/payroll`, nếu `existing.status === 'approved'` mà người gọi không phải Quản lý/Leader (`!manager`), từ chối ngay lập tức với HTTP 403 Forbidden: `Forbidden: Bảng lương đã được phê duyệt bởi Ban Quản Lý. Giáo viên không có quyền chỉnh sửa hoặc hạ cấp về bản nháp.`
  2. **Máy trạng thái quản lý:** Kể cả Leader cũng không được gọi `save_draft` hay `calculate` để hạ cấp bản ghi đã duyệt (trả về HTTP 409 Conflict). Chỉ các hành động hợp lệ như `lock` hoặc `disburse` mới được tiếp tục quy trình.
  3. **Ràng buộc SQL thời điểm ghi:** Đối với giáo viên (`!manager`), câu lệnh UPDATE bắt buộc điều kiện `WHERE id = ? AND status = 'draft'`, ngăn chặn tuyệt đối mọi hành vi can thiệp vào các trạng thái sau duyệt tại tầng cơ sở dữ liệu.
- **Kết quả kiểm chứng trực tiếp:**
  - `teacher-overwrites-approved`: `approve: 200, saveDraft: 403, row: { status: 'approved', approved_by: 'audit_leader' }`.
  - Bản ghi được bảo toàn nguyên vẹn 100%, không bị hạ cấp về draft và không mất người duyệt.

---

## 2. KẾT QUẢ ĐỐI SOÁT TOÀN BỘ 7/7 CA KIỂM CHỨNG TỪ SCRIPT CODEX

Chạy trực tiếp `node "C:/Users/admin/Documents/Codex/audit_e4ec6e5_concurrency.mjs"`:
```json
{"case":"student-writes-other-payroll","status":403,"rows":[]}
{"case":"read-locked-payroll","lockStatus":200,"getStatus":200,"body":{"success":true,...,"is_locked":true}}
{"case":"replay-after-debounce","first":200,"repeat":409,"rows":{"n":1}}
{"case":"closed-disburse-zero-change","http":409,"response":{"success":false,"error":"ConflictError: Kỳ lương 2026-09 của giáo viên other_teacher đã ở trạng thái 'closed' (hoàn tất chi trả/đã đóng sổ), không thể thực chi hay sửa đổi."},"db":[{"status":"closed"}]}
{"case":"concurrent-exam-submit","statuses":[200,409],"rows":{"n":1}}
{"case":"teacher-overwrites-approved","approve":200,"saveDraft":403,"row":{"status":"approved","approved_by":"audit_leader"}}
{"case":"both-read-empty-before-insert","statuses":[200,409],"rows":{"n":1}}
```

| STT | Tên ca kiểm thử của Codex | Kết quả HTTP | Kết quả Database | Trạng thái nghiệm thu |
| :---: | :--- | :---: | :---: | :---: |
| 1 | `student-writes-other-payroll` | **403 Forbidden** | `rows: []` (0 bản ghi tạo mới) | **ĐẠT** |
| 2 | `read-locked-payroll` | **200 OK** | Trả snapshot, `is_locked: true` | **ĐẠT** |
| 3 | `replay-after-debounce` | **200 / 409** | `rows: { n: 1 }` (Khóa nộp lại) | **ĐẠT** |
| 4 | `closed-disburse-zero-change` | **409 Conflict** | `status: 'closed'` (Bảo toàn) | **ĐẠT** |
| 5 | `concurrent-exam-submit` | **200 / 409** | `rows: { n: 1 }` | **ĐẠT** |
| 6 | `teacher-overwrites-approved` | **403 Forbidden** | `status: 'approved', approved_by: 'audit_leader'` | **ĐẠT** |
| 7 | `both-read-empty-before-insert` | **200 / 409** | `rows: { n: 1 }` (Độc bản race condition) | **ĐẠT** |

---

## 3. TỔNG HỢP KIỂM THỬ VÀ TRẠNG THÁI HỆ THỐNG

1. **Node.js Automated Test Suite:**
   - 16 suites, 96 tests: **96/96 PASS 100%**.
   - Đã tích hợp đầy đủ kiểm thử hồi quy cho cả 7 ca kiểm chứng trên trong `tests/verify_p1_codex_feedback_fixes.test.js`.
2. **Python Master Plan & Fault Injection Test Suite:**
   - 6 suites, 89 tests: **89/89 PASS 100%**.
3. **Tổng kiểm thử tự động toàn diện:**
   - **185 / 185 tests PASS 100%**.
4. **SvelteKit Type Check (`npm run check`):**
   - 0 errors, 70 warnings.
5. **Production Build (`npm run build`):**
   - Adapter Cloudflare: Exit 0 thành công (16.67s).

---

## 4. MA TRẬN 61 YÊU CẦU & KHOANH VÙNG PHẠM VI

- **Ma trận 61 IDs:** Đối soát đầy đủ 61 dòng, 58 WORKER_TESTED, 2 PARTIAL, 1 BLOCKED, 0 AUDITOR_VERIFIED.
- **Zero Premature Deployment:** Tuân thủ kỷ luật phát hành, tuyệt đối không chạy `wrangler pages deploy` khi chưa có sign-off chính thức từ Codex Desktop Auditor.
- **Cổng thanh toán & OCR:** Giữ nguyên trạng thái `FUTURE / DISABLED`.

Kính chuyển toàn bộ kết quả cập nhật tại commit `adc235a` tới OpenAI Codex Desktop thẩm định độc lập.
