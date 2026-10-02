# Audit layout và endpoint — 02/10/2026

## Phạm vi

- Nhánh gốc: `origin/main` tại commit `4b89aa9`.
- Giao diện: Cpanel học sinh, phụ huynh, giáo viên, leader, AdminCP và lịch học.
- Backend: 38 route API SvelteKit, Cloudflare Pages, D1 `tienganh-pro-db`, signed session và phân quyền theo vai trò.

## Kết luận

Các endpoint nghiệp vụ chính đã tồn tại và có thể nối từ giao diện thật: đăng nhập/phiên, hồ sơ, lịch học, điểm danh, liên kết phụ huynh–học sinh, bài tập, thông báo, học phí, nghiệp vụ giáo viên, âm thanh và AI. Bản audit sửa phần còn thiếu quan trọng nhất: `GET /api/schedule` giờ giới hạn dữ liệu theo người dùng ở server, và màn lịch có ma trận tuần để phụ huynh xem ngày tiếp theo.

## Thay đổi trong nhánh audit

1. **Phân quyền lịch học tại server**
   - Học sinh chỉ thấy lớp đang ghi danh hoặc buổi có tên trong danh sách học sinh.
   - Phụ huynh chỉ thấy lịch của con có liên kết `verified`.
   - Giáo viên chỉ thấy ca đứng lớp, trợ giảng hoặc dạy thay.
   - Leader/Admin vẫn có lịch vận hành toàn hệ thống.
   - Khi thiếu D1, lịch phụ huynh đóng quyền thay vì trả dữ liệu mẫu.

2. **Ma trận lịch tuần**
   - Có cột T2–CN, hàng theo giờ, nút tuần trước/tuần sau và chọn ngày.
   - Chọn ngày sẽ lọc danh sách chi tiết bên dưới.
   - Ma trận cuộn ngang an toàn trên mobile.

3. **Đồng nhất giao diện**
   - AdminCP và `/schedule` dùng cùng bán kính `rounded-lg`, viền slate, bóng nhẹ và chữ đậm vừa với Cpanel.
   - Loại bỏ gradient, bóng lớn và bo góc quá lớn ở hai màn lệch chuẩn nhất.

4. **Cloudflare types**
   - Sinh lại `worker-configuration.d.ts` từ `wrangler.jsonc`.
   - Bổ sung `@types/node` theo yêu cầu của Wrangler khi bật `nodejs_compat`.

## Ma trận endpoint

| Nhóm | Endpoint chính | Trạng thái |
|---|---|---|
| Auth/session | `/api/auth/token`, `/verify`, `/logout`, `/register` | Sẵn sàng, token ký HMAC và kiểm tra `auth_sessions` |
| Lịch/điểm danh | `/api/schedule`, `/api/schedule/notify`, `/api/attendance` | Sẵn sàng sau sửa scope |
| Phụ huynh | `/api/parents/children`, `/api/parents/tests` | Sẵn sàng, dữ liệu trẻ chỉ mở sau xác minh |
| Học tập | `/api/homework`, `/api/exams`, `/api/vocabulary`, `/api/grammar` | Sẵn sàng |
| Giáo viên | `/api/teachers/staff`, `/workflows`, `/payroll` | Sẵn sàng về route và RBAC |
| Tài chính/thông báo | `/api/tuition`, `/api/notifications`, webhook SePay | Sẵn sàng; cần secret production đúng môi trường |
| Nội dung/AI | `/api/audio/*`, `/api/ai/deepseek`, `/api/second-brain/*` | Sẵn sàng; phụ thuộc asset/key/binding production |

## Kiểm tra

- `npm run check`: đạt, 0 lỗi; còn 89 cảnh báo Svelte hiện hữu ở 19 file.
- `npm run build`: đạt với adapter Cloudflare.
- `tests/schedule_scope.test.js`: 4/4 đạt.
- Full suite hiện chưa xanh trên `origin/main`: nhiều test cũ tạo token có `sid` nhưng fixture không tạo dòng `auth_sessions`; nhóm kiểm thử HTTP cũng giả định dev server ở cổng 5173 đang chạy. Đây là nợ kiểm thử có sẵn trước nhánh audit, cần tách thành PR tiếp theo để không làm yếu kiểm tra session production.

## Việc cần cấu hình khi tích hợp production

- `AUTH_SECRET`, `DEEPSEEK_API_KEY` và secret webhook phải đặt trong Cloudflare, không commit vào Git.
- D1 binding `DB` đã trỏ tới `tienganh-pro-db` trong `wrangler.jsonc`.
- Chạy đủ migration production trước khi triển khai, đặc biệt `auth_sessions`, `class_enrollments` và `parent_student_links.verification_status`.
- Smoke test sau deploy bằng một tài khoản mỗi vai trò và một cặp phụ huynh–học sinh đã xác minh.
