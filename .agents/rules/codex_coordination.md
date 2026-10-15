# Quy tắc điều phối liên tục với Codex (Codex Coordination & Quota Recovery Rule)

## 1. Mục đích và phạm vi
- Quy tắc này áp dụng khi tương tác và phối hợp tác vụ cùng Codex (đặc biệt qua session thread `01a0f24a-3c1d-74b3-a760-ed77a4668f05` hoặc bất kỳ thread Codex nào).
- Worker Antigravity phải hoàn toàn tuân thủ điều phối từ Codex, báo cáo có bằng chứng và tự động duy trì chu trình thực thi lặp lại liên tục cho đến khi Codex chốt xác nhận (hoàn thành / merge / duyệt).

## 2. Giám sát Quota của Codex & Cơ chế Hẹn Giờ Tự Động (Auto-Resume on Quota Reset)
- Khi giao tiếp qua CLI Codex (`codex queue`) hoặc đọc rollout session, nếu phát hiện Codex bị hết quota (`rate_limit_reached_type`, `spend_control_reached`, hoặc thông báo reset giờ đếm ngược ví dụ: `resets_at: <timestamp>`):
  1. **Trích xuất mốc thời gian hồi phục**: Lấy chính xác `resets_at` (epoch timestamp) hoặc số phút/giờ còn lại từ telemetry/thông báo.
  2. **Tính toán thời gian chờ**: Tính toán số giây `DurationSeconds = max(resets_at - currentTime + 30, 60)` (cộng thêm 30-60 giây trễ để đảm bảo quota đã mở lại hoàn toàn).
  3. **Tự động lên lịch (`schedule`)**:
     - Gọi ngay công cụ `schedule` với chế độ một lần (`DurationSeconds`) và `TimerCondition: "never"`.
     - Prompt của lịch hẹn: `Codex quota đã hồi phục theo giờ đếm ngược. Tự động kích hoạt task kiểm tra rollout và tiếp tục chạy điều phối liên tục với Codex.`
  4. **Kích hoạt chạy liên tục**: Sau khi timer kích hoạt, worker lập tức tiếp tục đọc trạng thái mới nhất từ task chat / session rollout của Codex, gửi tiếp cập nhật và không dừng lại giữa chừng.

## 3. Quy chuẩn báo cáo điều phối
- Mọi báo cáo gửi tới Codex phải đi trực tiếp vào task chat thread thông qua `codex queue --thread "<thread_id>" --message "<nội dung>"`.
- Tuyệt đối không tự ý ngắt vòng lặp kiểm tra hoặc dừng task khi chưa nhận được tín hiệu xác nhận hoàn thành từ Codex.
