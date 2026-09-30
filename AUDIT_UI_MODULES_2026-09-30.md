# Báo cáo audit UI/module tuần tự — 30/09/2026

## Kết luận

G1 chưa đạt. Đã kiểm tra render 21 route và thực hiện các thao tác chính bằng Chrome thật chạy headless. Những lỗi ưu tiên nhất là: UI lưu lịch/đánh giá chỉ trong trình duyệt; đăng xuất không thu hồi token; schema migrations không dựng được đầy đủ backend; flashcard không đổi mặt và xáo thẻ làm mất bộ từ đang học.

Đợt này chỉ audit và tạo bằng chứng, không sửa thêm source sản phẩm, không deploy. Các bản sửa campuses/actor từ lượt trước vẫn nằm trong working tree. Không đọc hoặc cấu hình Zalo bot token. SePay được chạy cuối.

## Môi trường và cách kiểm tra

- Source HEAD: `8390ea946338288e5e916c4c705ee9b4043d8be0`, có ba file API sửa ở lượt trước, không phải clean release.
- Build local Cloudflare Pages tại `http://127.0.0.1:4173`, dùng build thành công ở lượt trước. Không kiểm tra production trong lượt này.
- D1 riêng: `audit-only`, UUID `00000000-0000-0000-0000-000000000001`; không dùng DB thật. Áp dụng migrations 0001, 0002, 0003 trong repo. Sau đó gọi lại API để xác nhận lỗi schema vẫn còn.
- Fixture đăng nhập là tài khoản seed trong DB local; đăng ký mới cũng chỉ ghi local.
- Chạy tuần tự: 21 route guest → tương tác học tập → login và cpanel → lưu lịch/đánh giá/logout → student/parent/guest exam/registration → xác minh CSS/schema → regression backend → SePay.
- Desktop 1366×900; toàn bộ route thử thêm 360×800. Flashcard thử thêm 320×740, 390×844 và landscape 844×390.
- `outcome: completed` trong JSON chỉ có nghĩa kịch bản chạy hết. Một kịch bản chạy hết vẫn có thể chứng minh lỗi; không phải tất cả đều PASS.

## Lỗi hiện hữu đã tái hiện

### P1 — UI báo lưu lịch/đánh giá thành công nhưng không lưu server

**Lịch học:** đăng nhập admin local → `/schedule` → thêm `AUDIT_LOCAL_SESSION_0930` → bấm lưu. Lịch xuất hiện trên UI; không có POST API. GET `/api/schedule` không chứa lịch vừa thêm.

**Đánh giá:** `/evaluations` → Sửa → nhập `AUDIT_LOCAL_FEEDBACK_0930` → lưu. Hiện thông báo thành công, có dữ liệu trong localStorage `tienganh_student_evals_v2`, không có POST API.

Nguyên nhân xác nhận trong code: `SessionEditModal.svelte:109` gọi `saveClassSession()` trực tiếp; `evaluations/+page.svelte:175` gọi `saveEvaluation()` trực tiếp. API đã được siết bảo mật nhưng giao diện này chưa dùng đường ghi API. Chưa thể coi dữ liệu trên UI là dữ liệu D1 hoặc dùng chung giữa thiết bị.

Bằng chứng: `modules.json`, mục 13 và 14. Cần chuyển UI qua canonical API, rồi kiểm tra đọc lại ở một browser context khác và fault injection trước khi nghiệm thu.

### P1 — Token vẫn dùng được sau logout

Đăng nhập qua form → giữ token trong bộ nhớ script audit → bấm “Đăng Xuất Khỏi Thiết Bị” → UI trở lại khách → dùng token cũ gọi `/api/auth/verify`.

Kết quả: HTTP 200, `authenticated: true`. Token không được ghi vào báo cáo. Đây là bằng chứng logout phía client chưa thực hiện revoke server; không chứng minh token đã bị lấy cắp.

Bằng chứng: `modules.json`, mục 15. Cần session registry/revoke và test logout thiết bị/logout-all.

### P1 — Migrations trong repo chưa đủ để dựng backend mới

Sau khi áp dụng đủ 0001–0003 vào D1 sạch:

| API | Kết quả |
|---|---|
| `/api/homework` | 503 cho admin/teacher/parent |
| `/api/teachers/workflows?type=all` | 500 |
| `/api/evaluations` | 503 |
| `/api/students` | 503 |
| `/api/parents/children` | 503 với parent có liên kết seed |
| `/api/teachers/payroll` | 200, dữ liệu local fixture hạn chế |
| `/api/campuses` | 200 với staff |
| `/api/notifications` | 200 với admin |

Đã đọc schema SQLite local: `users` thiếu `profile_version`; không có bảng `student_evaluations`, `teacher_salary_advances`, `salary_transactions`; homework tables vẫn mang schema cũ. `CREATE TABLE IF NOT EXISTS` trong handler không nâng cấp cột của bảng đã tồn tại. Đính chính sau đối chiếu handler: lỗi `verification_status` trên màn hồ sơ bài thi phụ huynh đến từ truy vấn `parent_student_links` của `/api/parents/tests`, không phải cột của `exam_attempts`.

Có script migration rời trong `scripts/`, nên kết luận chính xác là **quy trình migrations tiêu chuẩn trong repo chưa đủ**. Chưa kiểm tra schema production và không khẳng định production thiếu các bảng/cột này.

Bằng chứng: `modules.json` mục 12; `final-verification.json` phần schema và authenticatedEndpoints; ảnh parent ban đầu đã được thay bằng ảnh recheck cpanel, lỗi cột được đối chiếu schema.

### P1 — Flashcard không lật mặt thực sự

Click “Lật thẻ” đổi class sang `flipped` nhưng computed CSS của thẻ và cả hai mặt vẫn `transform: none`, `position: static`, `visibility: visible`. Hai mặt xếp nối nhau, cách nhau 480px. Container chỉ cao 480px nên mặt sau chồng khu vực nút/tiến độ bên dưới. Lỗi xảy ra cả desktop, không chỉ mobile.

Ở mobile: mặt sau cao 480px nhưng scrollHeight là 694px ở 320px, 670px ở 360px, 614px ở 390px. Nội dung có vùng cuộn nhưng bố cục hai mặt vẫn không được đặt đúng. Nút “Đọc câu” cao 22px, nhiều select/nút cao khoảng 36px, dưới tiêu chí 44px của handoff.

Code: `flashcards/+page.svelte:530–544` chỉ đặt chiều cao; không có rule hiển thị/lật cho `.flipped` và hai mặt. Kiểm tra class thay đổi đơn thuần từng qua nhưng không đủ chứng minh lật mặt; lần này đã kiểm tra computed CSS và ảnh.

Bằng chứng: `final-verification.json`, `flashcard-desktop-flipped.png`, `flashcard-back-360x800.png`, mục 04 trong `interactions.json`.

### P1 — Xáo thẻ trong một unit làm mất các unit khác trong phiên

`/flashcards`: tổng 52 từ → chọn Unit 1 còn 8 → Xáo thẻ → chọn Tất cả vẫn chỉ 8 → chọn Unit 2 hiển thị rỗng. Reload khôi phục bộ từ.

Nguyên nhân: `shuffleCards()` gán `words = [...displayWords]` sau khi displayWords đã được lọc. Bằng chứng: `interactions.json`, mục 05. Cần giữ bộ từ gốc và chỉ thay thứ tự danh sách đang hiển thị.

### P2 — Tràn ngang mobile và quyền campuses chưa khớp UI cpanel

- Phần lớn route ở 360px có document width 367px, exam 369px. Footer “Cập Nhật APK (Wi-Fi)” có cạnh phải khoảng 366.5px; không gom mọi phần tử nằm ngoài viewport trong thanh cuộn thành lỗi riêng.
- Flashcard ở 320px có document width 347px.
- Cpanel student/parent vẫn có nhu cầu tải campuses nhưng API hiện containment staff-only → 403 ngay cả khi có token hợp lệ. Đây là giới hạn đã biết của bản vá, cần quyết định quyền đọc tối thiểu hoặc điều chỉnh UI. Chưa mở lại quyền trong lượt audit.
- Parent cpanel hiện thông báo tải dữ liệu thất bại trong DB mới, cả tab bài tập và học phí; đối chiếu `/api/parents/children` và homework đều 503. Không quy lỗi này cho SePay.

## Những thao tác đã chạy được

- Tìm `hobby` trong từ điển ra đúng từ; query không khớp trả rỗng.
- Chọn đáp án ngữ pháp không gây pageerror; chưa nghiệm thu toàn bộ đáp án/nội dung học thuật.
- Flashcard next/prev, đổi trạng thái đã thuộc và reload giữ tiến độ. Autoplay đổi state sau khoảng 3.8 giây; pause giữ state. Điều này không khắc phục lỗi CSS lật mặt. Chưa instrument timer sau SPA unmount.
- Quiz typing 5 câu: nhập sai, kiểm tra, chuyển câu, kết quả 0/5 đúng. Chưa chạy hết MCQ/context.
- Login admin qua UI, reload giữ phiên; đăng ký học sinh Lớp 2 qua UI và reload còn đăng nhập.
- Student truy cập cpanel teacher được chuyển về cpanel student trong kịch bản đã chạy.
- Guest exam Lớp 7/Global Success bắt đầu thật; hiển thị câu hỏi, thời gian giảm 04:59 → 04:57. Chưa nghiệm thu nộp bài/chấm bài/replay cả vòng.
- Recruitment nhập draft kích hoạt `dirty_form_recruitment`; chưa gửi hồ sơ tuyển dụng.

## Phạm vi 21 route

| Nhóm | Route đã mở tuần tự | Độ sâu |
|---|---|---|
| Trang chính/học liệu | `/`, `/courses`, `/dictionary`, `/grammar` | Render desktop/mobile; search từ điển và chọn đáp án grammar |
| Học tương tác | `/flashcards`, `/quiz`, `/games`, `/exam` | Flashcard nhiều thao tác, quiz 5 câu, guest exam bắt đầu; games đang khóa, chưa chơi 7 game |
| Công cụ/nội dung | `/tools`, `/pedagogy`, `/second-brain` | Render; chưa test mọi công cụ/link/file/Drive |
| Tuyển dụng | `/recruitment` | Render và draft busy state |
| Cpanel | `/cpanel/student`, `/cpanel/parent`, `/cpanel/teacher`, `/cpanel/leader`, `/cpanel/notifications` | Guest/admin route, student routing, parent tabs, API backend liên quan; chưa nghiệm thu mọi workflow ghi |
| Quản trị | `/schedule`, `/evaluations`, `/admin`, `/admincp` | Render; admin login, lưu lịch và sửa evaluation, quan sát API |

21/21 route trả 200, không ghi nhận uncaught pageerror trong lượt render guest. Đây là smoke test, **không phải 21 module đã nghiệm thu đầy đủ**. HTTP 401 khi guest gọi API bảo vệ là hành vi đúng.

## Regression và SePay cuối cùng

- `node --test --test-concurrency=1 tests/verify_v5_priority_fixes.test.js tests/verify_real_handlers_security.test.js tests/verify_profile_metadata_atomic.test.js tests/verify_payroll_engine.test.js`: exit 0, runner báo 17/17. File real-handlers tự chạy thêm 17 kiểm tra nội bộ; không cộng lẫn hai cách đếm.
- Chạy SePay sau các bước trên: `node --test tests/verify_sepay_webhook_contract.test.js`: 5/5 PASS.
- SePay cùng key nhưng khác payload từng được tái hiện ở audit trước vẫn là finding mở; 5 test contract hiện tại không bao phủ tình huống đó. Không triển khai SePay trong lượt này.
- Check/build không chạy lại vì lượt này không thay code sản phẩm; kết quả lượt trước là check 0 lỗi/70 warnings và build exit 0.

## Bằng chứng và cách đọc

Thư mục `artifacts/audit-ui-20260930/` chứa JSON, ảnh và log. `modules-recheck.json` thay kết quả cũ của mục 17: lỗi selector hai thẻ `main` đã sửa trong script kiểm tra, không tính là lỗi sản phẩm. Các lỗi selector quiz/login/registration và thiếu lựa chọn grade khi chạy thử script đã được sửa và chạy lại; không đưa vào findings.

Scripts tái chạy: `scripts/audit_ui_sequential_20260930.mjs`, `audit_ui_interactions_20260930.mjs`, `audit_ui_modules_20260930.mjs`, `audit_ui_finalize_20260930.mjs`. Các script audit dùng base local cố định, không chạy production. File finalize đọc schema tại đường dẫn DB local của lượt này.

## Thứ tự xử lý đề xuất

1. Chuẩn hóa migrations/schema để backend có thể dựng lại và test tích hợp đầy đủ.
2. Chuyển ghi lịch/đánh giá/discussions từ helper trình duyệt sang API D1, kiểm tra quyền và đọc lại ở context mới.
3. Session registry/revoke logout; tiếp tục containment schedule/notify.
4. Flashcard CSS và shuffle; kiểm tra lại cả desktop/mobile bằng hành vi.
5. Cpanel quyền campuses, lỗi UI và tràn footer.
6. SePay cuối cùng như yêu cầu.

Antigravity chưa có `ANTIGRAVITY_LIGHT_V5_RESULT.md` hoặc ACK trong repo. Chưa có kết quả bên đó để review/nhận gate.
