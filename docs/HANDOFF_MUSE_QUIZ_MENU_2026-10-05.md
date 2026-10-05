# Bàn giao Muse: Quiz Menu, DOCX và bài tập về nhà D1

Ngày bàn giao: 2026-10-05
Nhánh đích: `main`
Commit tích hợp Phase 5: `3d377cc`

## Kết quả

Quiz Menu đã hoàn tất đủ năm phase và được merge qua PR #11–#15. Route chính là `/quiz-menu`.

Một file nguồn tạo thành một bundle thống nhất:

1. Google Doc/DOCX để giáo viên sửa và in.
2. Quiz tương tác dùng cùng nội dung.
3. Bài tập về nhà trong module `homework_assignments` hiện có của timbk.io.vn.

DOCX/Google Docs là nguồn nội dung chuẩn. Bundle lưu revision, checksum, Drive modified time và trạng thái đồng bộ. Nếu có thay đổi hai phía, giáo viên phải chọn `import_docs_to_quiz` hoặc `publish_quiz_to_docs`.

## Điểm tích hợp D1

- Migration core: `migrations/0012_quiz_menu.sql`.
- Migration Drive/homework: `migrations/0013_quiz_menu_drive.sql`.
- Homework dùng bảng sẵn có, bổ sung `source_quiz_id`, `source_google_doc_file_id`, `source_docx_file_id`, `source_content_revision`.
- Publish homework yêu cầu lớp, buổi học và hạn nộp; sau đó dùng `class_enrollments`, `parent_student_links`, `system_notifications` để báo cho học sinh và phụ huynh.
- Không tạo module homework song song.

## Hành vi cần giữ

- API công khai không trả đáp án trước khi nộp.
- Học sinh chọn “Không hiểu – để làm lại sau” thì câu được lưu trong `deferred_question_ids_json`, chưa bị tính sai.
- Câu tự luận ở `review_pending` cho đến khi giáo viên/leader chấm.
- Review lưu lịch sử bất biến; server tự kiểm tra tổng điểm.
- Service worker chỉ cache quiz công khai và không lưu auth token.

## Runtime cần cấu hình

- D1 binding: `DB` → `tienganh-pro-db` trong `wrangler.jsonc`.
- Áp dụng migration `0012` và `0013` vào đúng môi trường trước khi dùng production.
- Google Drive credential chỉ lấy từ secret runtime; không ghi private key vào D1 hoặc Git.
- Drive cần quyền tạo folder `Quiz Uploads`, tạo Google Doc và export DOCX.

## Kiểm tra đã chạy trên main

```text
node --test tests/quiz_menu_phase1.test.js tests/quiz_menu_phase2_drive.test.js tests/quiz_menu_phase4.test.js tests/quiz_menu_phase5.test.js
24 pass, 0 fail

npx svelte-check --threshold error
0 errors

npm run build
success
```

## Pull request

- #11: core schema/API
- #12: Drive, DOCX bundle và homework D1
- #13: mobile UI
- #14: review giáo viên/leader
- #15: PWA offline/sync

## Việc vận hành còn lại

Cloudflare Pages đã build thành công PR #15. Trước khi kiểm thử dữ liệu thật, người vận hành cần xác nhận migration `0012` và `0013` đã được áp dụng trên D1 production và secret Drive đang tồn tại trong Cloudflare.

