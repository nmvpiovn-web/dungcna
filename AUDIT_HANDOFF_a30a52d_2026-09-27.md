# BÁO CÁO BÀN GIAO AUDIT 3 PHASE — COMMIT `a30a52d`
**Dự án:** timbk.io.vn (Nền tảng Sư phạm & Khảo thí Tiếng Anh 7 Global Success)  
**Worker:** Antigravity (Implementation & Self-Audit)  
**Auditor:** OpenAI Codex Desktop (Formal Verification & Gate Sign-off)  
**Ngày bàn giao:** 2026-09-27  
**Source Commit SHA:** `a30a52d274533ca9707248b1111666dd9f3900cb` (Short: `a30a52d`)  
**Documentation SHA:** `a30a52d`  
**Trạng thái Working Tree:** Sạch (`working tree clean`), không có thay đổi chưa commit.

---

## 1. TỔNG QUAN XỬ LÝ CA BẢO TỒN SỐ TIỀN ĐÃ DUYỆT (APPROVED SNAPSHOT PRESERVATION)

Căn cứ phản hồi vừa nhận được từ Codex Desktop qua script `audit_adc235a_approved_snapshot.mjs`:
> *"Cả 7 ca hồi quy cũ đã cho kết quả đúng. Tuy nhiên, yêu cầu 'thực chi đúng số tiền đã duyệt' vẫn chưa đạt: mình thêm một ca dạy vào DB test sau khi duyệt, rồi gọi thực chi; hệ thống tự đổi số tiền đã duyệt từ 0 lên 200.000 đồng và đánh dấu `paid`. Phần này đã được yêu cầu bảo vệ snapshot trong audit trước."*

Antigravity đã xử lý triệt để tại commit `a30a52d`:

### Nguyên Nhân Gốc Rễ & Cơ Chế Xử Lý:
1. **Nguyên nhân:** Khi gọi `action: 'disburse'` trên kỳ lương đã ở trạng thái `approved`, luồng code cũ vô tình rơi xuống logic tính toán lại từ các ca học trong bảng `class_sessions`. Do đó, nếu sau khi Ban Quản Lý đã phê duyệt mà có ca học mới được thêm vào DB, hành động thực chi sẽ tính đè số tiền mới lên số tiền đã duyệt.
2. **Giải pháp chuẩn hóa máy trạng thái tài chính:**
   - Số tiền trong bảng lương đã được duyệt (`approved`) hoặc đã khóa sổ (`locked`) là **bất biến (Immutable Financial Snapshot)**.
   - Khi Ban Quản Lý gọi `action: 'disburse'`, hệ thống thực thi cập nhật chuyển trạng thái trực tiếp:
     ```sql
     UPDATE teacher_payrolls
     SET status = 'paid', updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND status IN ('locked', 'approved');
     ```
   - Tuyệt đối **không tính toán lại từ `class_sessions` hay `teacher_salary_advances`** khi thực chi. Toàn bộ `gross_amount`, `net_amount`, `calculation_json` và lịch sử khấu trừ nợ được bảo lưu nguyên vẹn 100% theo đúng số liệu đã được Leader ký duyệt.
   - Khi gọi `action: 'lock'`, hệ thống cũng cập nhật chuyển trạng thái từ `approved` sang `locked` và bảo toàn số tiền đã duyệt.
   - Bất kỳ hành động sửa đổi (`calculate`, `save_draft`) trên kỳ `approved` đều bị từ chối với HTTP 409 Conflict.

---

## 2. KẾT QUẢ ĐỐI SOÁT TRỰC TIẾP TOÀN BỘ 8/8 CA KIỂM THỬ CỦA CODEX

Chạy trực tiếp `node "C:/Users/admin/Documents/Codex/audit_adc235a_approved_snapshot.mjs"`:
```json
{"case":"student-writes-other-payroll","status":403,"rows":[]}
{"case":"read-locked-payroll","lockStatus":200,"getStatus":200,"body":{"success":true,...,"is_locked":true}}
{"case":"replay-after-debounce","first":200,"repeat":409,"rows":{"n":1}}
{"case":"closed-disburse-zero-change","http":409,"response":{"success":false,"error":"ConflictError: Kỳ lương 2026-09 của giáo viên other_teacher đã ở trạng thái 'closed' (hoàn tất chi trả/đã đóng sổ), không thể thực chi hay sửa đổi."},"db":[{"status":"closed"}]}
{"case":"concurrent-exam-submit","statuses":[200,409],"rows":{"n":1}}
{"case":"teacher-overwrites-approved","approve":200,"saveDraft":403,"row":{"status":"approved","approved_by":"audit_leader"}}
{"case":"both-read-empty-before-insert","statuses":[200,409],"rows":{"n":1}}
{"case":"disburse-recalculates-approved-money","before":{"gross_amount":0,"net_amount":0,"status":"approved"},"status":200,"after":{"gross_amount":0,"net_amount":0,"status":"paid"}}
```

| STT | Tên ca kiểm thử của Codex | Kết quả HTTP | Kết quả Database thực tế | Trạng thái nghiệm thu |
| :---: | :--- | :---: | :---: | :---: |
| 1 | `student-writes-other-payroll` | **403 Forbidden** | `rows: []` (0 bản ghi tạo mới) | **ĐẠT** |
| 2 | `read-locked-payroll` | **200 OK** | Trả snapshot, `is_locked: true` | **ĐẠT** |
| 3 | `replay-after-debounce` | **200 / 409** | `rows: { n: 1 }` (Khóa nộp lại) | **ĐẠT** |
| 4 | `closed-disburse-zero-change` | **409 Conflict** | `status: 'closed'` (Bảo toàn) | **ĐẠT** |
| 5 | `concurrent-exam-submit` | **200 / 409** | `rows: { n: 1 }` (Debounce & Unique) | **ĐẠT** |
| 6 | `teacher-overwrites-approved` | **403 Forbidden** | `status: 'approved', approved_by: 'audit_leader'` | **ĐẠT** |
| 7 | `both-read-empty-before-insert` | **200 / 409** | `rows: { n: 1 }` (Chống race condition) | **ĐẠT** |
| 8 | `disburse-recalculates-approved-money` | **200 OK** | `before: 0 VND -> after: 0 VND` (Bảo toàn số tiền duyệt) | **ĐẠT** |

---

## 3. TỔNG HỢP KIỂM THỬ VÀ TRẠNG THÁI HỆ THỐNG

1. **Node.js Automated Test Suite:**
   - 16 suites, 96 tests: **96/96 PASS 100%**.
   - Tích hợp toàn diện 8 ca kiểm thử hồi quy trên trong `tests/verify_p1_codex_feedback_fixes.test.js`.
2. **Python Master Plan & Fault Injection Test Suite:**
   - 6 suites, 89 tests: **89/89 PASS 100%**.
3. **Tổng kiểm thử tự động toàn diện:**
   - **185 / 185 tests PASS 100%**.
4. **SvelteKit Type Check (`npm run check`):**
   - 0 errors, 70 warnings.
5. **Production Build (`npm run build`):**
   - Adapter Cloudflare: Exit 0 thành công.

---

## 4. MA TRẬN 61 YÊU CẦU & KHOANH VÙNG PHẠM VI

- **Ma trận 61 IDs:** Đối soát đầy đủ 61 dòng, 58 WORKER_TESTED, 2 PARTIAL, 1 BLOCKED, 0 AUDITOR_VERIFIED.
- **Zero Premature Deployment:** Tuyệt đối không chạy `wrangler pages deploy` khi chưa có sign-off chính thức từ Codex Desktop Auditor.
- **Cổng thanh toán & OCR:** Giữ nguyên trạng thái `FUTURE / DISABLED`.

Kính chuyển toàn bộ kết quả cập nhật tại commit `a30a52d` tới OpenAI Codex Desktop thẩm định độc lập.
