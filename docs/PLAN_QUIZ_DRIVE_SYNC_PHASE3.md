# Master Plan: Quiz Drive Sync Phase 3 — Safe Canonical Sync, Conflict Matrix & Observability
- **Ngày lập:** 2026-10-13
- **Branch:** `agy/quiz-drive-sync-phase3`
- **Base:** `agy/quiz-auto-builder-phase2` (commit `c1ff903`, PR #28, stacked trên PR #27)
- **Tác giả:** Antigravity CLI Developer
- **Auditor / Maintainer:** Codex

---

## 1. Bối Cảnh & Vấn Đề Kỹ Thuật (Audit Findings)

Hệ thống đồng bộ Quiz Menu ↔ Google Docs/DOCX ↔ Bài tập về nhà D1 hiện hữu (từ Phase 2) tồn tại 5 điểm yếu nghiêm trọng:
1. **Implicit Force:** `POST /api/quiz-menu/[id]/sync-bundle` mặc định truyền `{ force: direction === 'publish_quiz_to_docs' }`. Do UI luôn gửi hướng này, mọi lần đồng bộ Quiz → Docs đều bỏ qua kiểm tra xung đột và ghi đè thẳng lên Google Docs.
2. **Docs → Quiz ghi đè mù quáng:** Khi import từ Google Docs về Quiz, hệ thống thay thế toàn bộ danh sách câu hỏi mà không kiểm tra xem Quiz có đang bị chỉnh sửa dở hay có revision mới hơn không.
3. **GET Bundle không có Live Health:** Endpoint `GET /api/quiz-menu/[id]/bundle` chỉ SELECT row cũ từ D1 mà không truy vấn live modifiedTime từ Drive API hay so khớp checksum Quiz hiện tại; do đó xung đột không thể hiển thị kịp thời trên giao diện.
4. **Xóa Printable DOCX sớm gây mất dữ liệu:** Hàm `publishQuizBundle` và `importGoogleDocToQuizBundle` xóa printable DOCX cũ trên Google Drive *trước* khi upload file mới và commit DB hoàn tất. Nếu bước sau gặp lỗi, bản in giáo viên đang dùng sẽ bị xóa mất vĩnh viễn (hoặc tạo orphan file rác).
5. **Thiếu Khóa Đồng Thời (Concurrency Lock) & Lịch Sử Kiểm Toán (Audit Events):** Không có cơ chế lock chống 2 giáo viên cùng bấm sync đồng thời; không ghi nhận ai đã đồng bộ, chiều nào, từ revision nào sang revision nào, và mã lỗi là gì.

---

## 2. Mục Tiêu & Hợp Đồng Kỹ Thuật Phase 3

### RED-3.1 — Live Sync Inspector & Conflict Matrix
- Xây dựng helper `inspectBundleHealth(platform, db, quizId)`:
  1. Tính checksum Quiz hiện tại (`title`, `description`, `time_limit_minutes`, danh sách `questions` đã chuẩn hóa) và so sánh với `quiz_bundles.quiz_checksum`.
  2. Lấy `modifiedTime` live từ Google Drive API của `google_doc_file_id` và so sánh với `quiz_bundles.google_doc_modified_time`.
  3. Đọc `revision`, `sync_status`, `last_synced_at`.
- Truth table kết quả (Matrix):
  - `clean`: Không có thay đổi ở cả hai phía (checksum khớp, modifiedTime khớp).
  - `quiz_changed`: Chỉ Quiz thay đổi nội dung kể từ lần đồng bộ gần nhất.
  - `docs_changed`: Chỉ Google Docs thay đổi trên Drive kể từ lần đồng bộ gần nhất.
  - `both_changed`: Cả Quiz và Docs đều thay đổi độc lập -> **Xung Đột (Conflict)**.
  - `drive_unavailable`: Drive API trả về lỗi mạng, 503, 401, hoặc chưa cấu hình token. Fail-closed an toàn, không báo conflict giả.
  - `bundle_missing`: Quiz chưa từng được tạo bundle.
- Endpoint `GET /api/quiz-menu/[id]/bundle`:
  - Trả về bundle metadata, live health, và 5 sự kiện đồng bộ gần nhất.
  - Phân quyền nghiêm ngặt: chỉ chủ sở hữu quiz hoặc quản lý (leader/admin) mới được xem; không rò rỉ credential hay đáp án.

### RED-3.2 — Explicit Conflict Resolution & Expected Revision
- Loại bỏ hoàn toàn quy tắc `force = true` ngầm định.
- Mọi request đồng bộ (`POST /api/quiz-menu/[id]/sync-bundle`) cho bundle đã tồn tại **bắt buộc** phải gửi `expected_revision`.
  - Nếu thiếu `expected_revision` trên bundle hiện hữu: trả HTTP 409 `MissingExpectedRevision`.
  - Nếu `expected_revision !== bundle.revision`: trả HTTP 409 `BundleRevisionConflict` trước khi ghi bất kỳ byte nào lên Drive hoặc D1.
  - Cho phép request legacy thiếu `expected_revision` duy nhất trong trường hợp tạo bundle lần đầu.
- Quy tắc điều hướng theo ma trận xung đột:
  - Khi `quiz_changed`: Cho phép Quiz → Docs; chặn Docs → Quiz trừ khi có `resolution: 'keep_docs'`.
  - Khi `docs_changed`: Cho phép Docs → Quiz; chặn Quiz → Docs trừ khi có `resolution: 'keep_quiz'`.
  - Khi `both_changed`: Luôn trả HTTP 409 `BundleSyncConflict`, yêu cầu giáo viên xác nhận rõ qua modal `keep_quiz` hoặc `keep_docs`. Tuyệt đối không tự ý chọn.

### RED-3.3 — Distributed Lock & Lịch Sử Đồng Bộ (Migration 0022)
- Tạo bảng `quiz_bundle_sync_locks`:
  - Khóa theo `quiz_id` với `lock_token`, `locked_by`, `expires_at` (lease 60 giây).
  - Ngăn chặn triệt để 2 tiến trình đồng bộ đồng thời. Request thứ hai nhận HTTP 409 `BundleSyncBusy`.
  - Hỗ trợ takeover an toàn nếu lock trước đó đã hết hạn (`expires_at <= now`).
  - Giải phóng lock trong khối `finally` và chỉ giải phóng nếu đúng `lock_token`.
- Tạo bảng `quiz_bundle_sync_events`:
  - Ghi nhận đầy đủ lifecycle: `started`, `succeeded`, `conflict`, `failed`, `cleanup_warning`.
  - Lưu trữ: `quiz_id`, `actor_id`, `direction`, `resolution`, `from_revision`, `to_revision`, `error_code`, `error_message` đã sanitize, `created_at`.
  - Tuyệt đối không lưu token, private key, byte nội dung, đáp án hay bí mật.

### RED-3.4 — Compensating Transactions (Đảm Bảo Tính Toàn Vẹn Drive/D1)
- **Thứ tự dọn dẹp file:**
  1. Upload printable DOCX mới lên Drive thành công.
  2. Ghi nhận giao dịch D1 (cập nhật `quiz_bundles` và `homework_assignments`).
  3. Chỉ sau khi D1 commit thành công mới tiến hành xóa printable DOCX cũ trên Drive.
  4. Nếu xóa file cũ thất bại: ghi event `cleanup_warning`, không rollback bundle đã thành công.
- **Bù trừ khi thất bại (Rollback on failure):**
  - Nếu upload file mới xong nhưng D1 thất bại: xóa ngay file printable mới trên Drive; giữ nguyên file cũ và bản ghi D1 cũ.
  - Nếu tạo Google Doc mới cho bundle lần đầu mà D1 thất bại: xóa cả Google Doc mới và printable mới.
  - Nếu cập nhật nội dung Google Doc cũ thành công nhưng D1 thất bại (không thể rollback binary): đánh dấu `sync_status = 'error'`, ghi event lỗi. Lần inspect sau sẽ phát hiện đúng trạng thái `docs_changed`, tuyệt đối không báo đồng bộ giả.
- **Docs → Quiz:**
  - Parse và validate toàn bộ câu hỏi trước.
  - Cập nhật câu hỏi + bundle + homework trong một D1 batch duy nhất, đảm bảo tính nguyên tử.

### RED-3.5 — Homework Đồng Bộ Revision & Bảo Toàn Trạng Thái
- Sau khi đồng bộ thành công:
  `quiz_bundles.revision === homework_assignments.source_content_revision`
- **Bảo toàn trạng thái bài tập đã giao:**
  - Nếu `homework_assignments` đang ở trạng thái `published`: không được tự ý reset về `draft`, không xóa `class_id`, `session_id`, `deadline_date`, `deadline_time`. Chỉ cập nhật `title`, `description`, `total_points`, `max_score`, `source_content_revision`.
  - Nếu bài tập đang là `draft` thì tiếp tục giữ `draft`.
- `publish_homework` yêu cầu `expected_revision`. Chặn giao bài nếu bundle đang ở trạng thái `conflict`, `error` hoặc `stale`.
- Tính lũy đẳng (Idempotent): Giao lại bài cùng revision không gửi thông báo trùng cho học sinh/phụ huynh và không tự tăng revision nếu nội dung không đổi.

### RED-3.6 — UX Dialog Trạng Thái & Modal Xử Lý Xung Đột
- Nâng cấp bundle dialog trong `src/routes/quiz-menu/+page.svelte`:
  - Hiển thị badge trạng thái chuẩn (`Đã đồng bộ`, `Quiz đã sửa`, `Google Docs đã sửa`, `Xung đột`, `Đang xử lý`, `Lỗi đồng bộ`).
  - Hiển thị số revision hiện tại, thời gian đồng bộ gần nhất, độ trễ đồng bộ (sync lag).
  - Bảng lịch sử 5 sự kiện gần nhất (ai thực hiện, chiều nào, kết quả ra sao).
  - Nút đồng bộ gửi kèm `expected_revision`.
  - Modal giải quyết xung đột khi gặp `both_changed`: hiển thị 2 lựa chọn rõ ràng:
    * **"Giữ bản Quiz"**: Ghi đè Google Docs bằng câu hỏi trong Quiz hiện tại.
    * **"Giữ bản Google Docs"**: Tải câu hỏi từ Google Docs về thay thế Quiz hiện tại.
    * Giải thích rõ dữ liệu nào sẽ bị thay thế, bắt buộc giáo viên xác nhận.
- Vô hiệu hóa nút bấm khi bundle đang bận hoặc Drive unavailable.
- Sau khi đồng bộ, fetch lại live health từ server, không ghép state giả lập.
- Đáp ứng chuẩn mobile 320px/360px: bố cục 1 cột, không tràn ngang, touch target >= 44px, `role="dialog"`, `aria-modal="true"`.
- Bảng màu Warm Ivory, Neutral Stone, Emerald, Coral; không có màu xanh đen cấm.

### RED-3.7 — Observability API & Quản Lý Scope
- Endpoint `GET /api/quiz-menu/bundle-observability`:
  - Dành cho staff (teacher, leader, admin).
  - Phân quyền: Giáo viên chỉ xem danh sách bundle của các quiz do mình tạo; Quản lý/Admin có thể xem toàn bộ và lọc theo `status=conflict`, `status=error`, `status=stale`.
  - Hỗ trợ phân trang an toàn (`limit`, `offset`), parameterized queries, không rò rỉ đáp án bài thi.

---

## 3. Kế Hoạch Triển Khai Chi Tiết

1. **Tài liệu:**
   - Lập `docs/PLAN_QUIZ_DRIVE_SYNC_PHASE3.md` (tài liệu này).
   - Lập `docs/RUNBOOK_0022_QUIZ_DRIVE_SYNC_PHASE3.md`.
2. **Cơ sở dữ liệu:**
   - Tạo migration `migrations/0022_quiz_bundle_sync_phase3.sql` (bảng `quiz_bundle_sync_locks` và `quiz_bundle_sync_events`).
3. **Core Server Services (`src/lib/server/quizDrive.js`):**
   - Triển khai `acquireBundleLock`, `releaseBundleLock`.
   - Triển khai `logBundleSyncEvent`, `getBundleSyncEvents`.
   - Triển khai `inspectBundleHealth`.
   - Tái cấu trúc `publishQuizBundle` và `importGoogleDocToQuizBundle` theo mô hình Compensating Transaction, xóa file cũ sau khi D1 commit, và xử lý bù trừ khi lỗi.
   - Cập nhật `publishBundleHomework` kiểm tra `expected_revision`, trạng thái bundle, và tính lũy đẳng.
4. **API Endpoints:**
   - Cập nhật `GET /api/quiz-menu/[id]/bundle`: bổ sung `health` và `events`.
   - Cập nhật `POST /api/quiz-menu/[id]/sync-bundle`: xử lý `expected_revision`, acquire lock, kiểm tra ma trận xung đột, gọi compensating transaction, log events.
   - Tạo endpoint mới `GET /api/quiz-menu/bundle-observability` cho staff và quản lý.
5. **Giao diện Người dùng (`src/routes/quiz-menu/+page.svelte`):**
   - Thêm modal giải quyết xung đột rõ ràng, thân thiện.
   - Hiển thị health badge, revision, sync lag, và danh sách 5 sự kiện gần nhất.
   - Đảm bảo chuẩn a11y, mobile 320/360px và theme warm stone.
6. **Kiểm thử Toàn Diện (`tests/quiz_drive_sync_phase3.test.js`):**
   - Bộ test suite bao quát toàn bộ 8 tiêu chí RED-3.1 đến RED-3.8.
   - Chạy toàn bộ 22 test suites hiện tại + suite Phase 3 mới.
   - Kiểm tra `npm run check`, `npm run build`, `git diff --check`.
