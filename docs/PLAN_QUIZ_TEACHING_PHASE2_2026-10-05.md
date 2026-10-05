# Quiz Phase 2 — giáo viên, lịch dạy và học sinh

Ngày: 05/10/2026. Chủ trì nghiệm thu: Codex. Dev phụ: Antigravity.

Đây là giai đoạn liên kết nghiệp vụ sau năm phase Quiz Menu đã merge ở PR #11–#15.

## Phạm vi hiện tại

Link quiz công khai cho phép guest nhập tên và lớp để làm bài. Đăng ký/đăng nhập được khuyến khích để giữ lịch sử cá nhân. Server ghi giờ bắt đầu, giờ nộp và mã attempt; giao diện báo cáo hiển thị giờ Việt Nam (Asia/Ho_Chi_Minh). Tên/lớp guest là thông tin tự khai, chưa phải xác nhận danh tính hay điểm danh.

DOCX/Google Docs tiếp tục là nguồn nội dung chuẩn. Homework nối module D1 hiện có. Không thay thế các bảng lớp, lịch dạy, ghi danh hoặc bài tập đã có.

## Liên kết dự kiến

- Quiz thuộc giáo viên qua `quizzes.created_by`.
- Một quiz được giao cho nhiều buổi qua bảng mới `quiz_session_assignments`: id, quiz_id, session_id, assigned_by, opens_at, closes_at, content_revision, created_at.
- `session_id` tham chiếu `class_sessions`; lớp và giáo viên được lấy từ server, kể cả giáo viên dạy thay.
- Attempt có `session_assignment_id` nullable. Guest vẫn làm được khi chưa gắn buổi.
- Học sinh đăng nhập nối bằng `user_id` và `class_enrollments`. Guest giữ nguyên tên/lớp tự khai.
- Việc gắn guest với học sinh phải được giáo viên xác nhận; lưu ai xác nhận, lúc nào và giá trị trước/sau. Không tự gộp theo tên trùng.
- Dùng giờ server UTC trong D1, đổi sang giờ Việt Nam khi hiển thị. Giờ gửi offline chỉ là thời điểm server nhận; không dùng giờ client để xác nhận đúng hạn.

## Gói Antigravity làm trước

1. Tạo PR riêng từ `origin/main` mới nhất: UI báo cáo bài làm theo tên, lớp, ngày/buổi và trạng thái chấm. Dùng dữ liệu attempt hiện có; không tạo dữ liệu giả khi API lỗi.
2. Bổ sung bộ lọc ngày và hiển thị giờ Việt Nam, trạng thái guest/học sinh đăng nhập, câu chưa hiểu, nút mở bài chấm.
3. Làm component chọn buổi dạy, nhận danh sách qua props và callback; kèm trạng thái đang tải, rỗng, lỗi, mobile. Chưa nối mutation production trước khi API liên kết được Codex duyệt.
4. Viết test hành vi bộ lọc, chuyển ngày, tên/lớp chứa ký tự đặc biệt, accessibility của các nút; bàn giao commit SHA, file đã sửa, lệnh test và ảnh desktop/mobile.

Antigravity chỉ mở PR và báo kết quả. Codex review, chạy hồi quy, merge, migration và deploy. Không sửa auth, quyền truy cập, điểm số, schema hoặc tự triển khai production trong gói UI.

## Gói Codex phụ trách

1. Audit schema production trước migration; tạo bookmark Time Travel và migration additive cho liên kết buổi.
2. API giao quiz vào buổi: xác thực giáo viên sở hữu/được phân công hoặc manager; kiểm tra lớp và khoảng thời gian server.
3. API nhận diện guest: kiểm tra quyền theo buổi, tránh nối sai học sinh, lưu lịch sử đối chiếu.
4. Quyền xem báo cáo: giáo viên chỉ thấy buổi được phân công; manager theo quyền hiện có; học sinh chỉ thấy bài của mình; phụ huynh chỉ thấy con đã xác minh.
5. Nối homework bằng ID và revision; không tự phát thông báo thật trong test.
6. Audit PR của Antigravity, test hồi quy, deploy preview rồi production và xác minh bản build.

## Tiêu chí nghiệm thu

- Guest mở link ở trình duyệt mới, nhập tên/lớp, làm và nộp thành công mà không cần tài khoản.
- Báo cáo lưu đủ tên/lớp, attempt ID, giờ bắt đầu và giờ nhận nộp từ server; không lộ token hoặc đáp án cho người khác.
- Một quiz giao được cho hai buổi khác nhau mà báo cáo không lẫn nhau.
- Giáo viên A không xem/sửa buổi của B bằng cách đổi ID; người dạy thay có quyền đúng buổi được phân công.
- Học sinh trùng tên không bị tự gộp. Nối guest thủ công có audit và không làm mất attempt gốc.
- Deadline, chấm tự động/tự luận, “Không hiểu”, DOCX revision, homework và offline retry tiếp tục hoạt động.
- Migration được thử trên database có dữ liệu; CI, Svelte check, build và test API đều đạt.

## Trình tự bàn giao

Antigravity làm UI báo cáo trước. Codex chốt hợp đồng API liên kết buổi trong PR riêng. Antigravity nối UI với API đã merge. Codex chạy test end-to-end và triển khai. Không ghi nhận phần Phase 2 là đã triển khai khi mới có plan/component.
