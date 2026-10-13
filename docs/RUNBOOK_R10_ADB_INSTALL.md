# Sổ Tay Kỹ Thuật: Hướng Dẫn Cài Đặt & Cập Nhật APK Trên DOOGEE R10 Bằng ADB

> **Tài liệu:** Sổ tay vận hành cài đặt và bảo mật ứng dụng Android (`scripts/install_r10.ps1`)
> **Áp dụng cho:** Máy tính bảng học tập DOOGEE R10 (Android 13 / API 33)
> **Gói ứng dụng:** `vn.edu.tienganhcodung.app`
> **Lưu ý bảo vệ môi trường:** Máy chủ kiểm thử/audit hiện có ADB 37.0.1 nhưng danh sách thiết bị không dây trống và các cổng không dây đóng. Không được tuyên bố trong PR rằng đã cài đặt lên tablet thực tế.

---

## 1. Hiện Trạng Hệ Thống & Kiểm Tra Môi Trường

### 1.1 Khảo sát môi trường máy chủ
* **Phiên bản ADB:** `Android Debug Bridge version 1.0.41 (Version 37.0.1-15733141)`.
* **Trạng thái kết nối máy chủ audit (Codex Host Audit Findings):**
  - Lệnh `adb devices`: Danh sách thiết bị thường rỗng khi chạy trong môi trường container/cloud audit độc lập.
  - Lệnh `adb mdns services`: Rỗng (không có dịch vụ mDNS tự động công bố).
  - Địa chỉ IP nội bộ `192.168.1.40`: Các cổng ADB không dây tiêu chuẩn (`5555`, `37099`, `37100`) đều đóng hoặc không thể kết nối từ xa.
  - **Kết luận:** Mọi quy trình CI/CD và PR **tuyệt đối không được tuyên bố (claim) rằng ứng dụng đã được cài đặt thành công lên máy tính bảng thực tế** trong môi trường audit tự động. Chỉ chạy chế độ `-DryRun` hoặc xác nhận môi trường thực tế khi kỹ thuật viên kết nối trực tiếp.

---

## 2. Quy Trình Cài Đặt An Toàn Bằng Script `scripts/install_r10.ps1`

### 2.1 Cú pháp lệnh tiêu chuẩn

```powershell
# 1. Chạy thử nghiệm mô phỏng toàn bộ bước xác thực (Khuyên dùng trong CI/Audit)
pwsh ./scripts/install_r10.ps1 -DryRun

# 2. Cài đặt trực tiếp lên thiết bị DOOGEE R10 kết nối qua USB
pwsh ./scripts/install_r10.ps1

# 3. Cài đặt lên thiết bị cụ thể qua mã Serial hoặc IP:Port
pwsh ./scripts/install_r10.ps1 -Device "D2304029AZ00036#M101TBR200-TC67D"

# 4. Chỉ định đường dẫn tệp tin APK và mã SHA-256 tùy biến
pwsh ./scripts/install_r10.ps1 -ApkPath "./static/downloads/tienganhcodung-latest.apk" -ExpectedSha256 "075f297219f174c8ffa679fcee8a6ba230e9a347b883b97d2fcdbbe036f42c97"
```

### 2.2 Các chốt chặn an toàn (Fail-Closed Gates)

Script được thiết kế với cơ chế tự vệ fail-closed nghiêm ngặt:
1. **Kiểm tra công cụ ADB:** Tự động tìm kiếm `adb` trong biến môi trường `$env:PATH` và thư mục chuẩn của Windows Winget Platform-Tools (`$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Google.PlatformTools_...`). Nếu không tìm thấy, dừng lại ngay và trả mã lỗi `1`.
2. **Kiểm tra trạng thái thiết bị ủy quyền:**
   - Chỉ chấp nhận thiết bị có trạng thái `device`. Bỏ qua các thiết bị `unauthorized` (chưa bấm đồng ý RSA key) hoặc `offline`.
   - Nếu không tìm thấy thiết bị nào: Xuất hướng dẫn hành động kết nối (xem mục 3) và thoát với mã lỗi `1`.
   - Nếu có nhiều hơn 1 thiết bị kết nối: Yêu cầu người dùng truyền tham số `-Device <Serial>` cụ thể để tránh cài nhầm thiết bị khác.
3. **Xác thực nhà sản xuất & dòng máy (Model Validation):**
   - Đọc thuộc tính `ro.product.manufacturer` (phải là `DOOGEE`) và `ro.product.model` (phải là `R10`).
   - Nếu phát hiện thiết bị khác (ví dụ điện thoại Samsung, Xiaomi,...): Dừng ngay lập tức với cảnh báo nguy hiểm. Chỉ cho phép vượt qua khi người dùng truyền tường minh cờ `-AllowModelOverride`.
4. **Xác thực toàn vẹn mã băm SHA-256:**
   - Tính toán mã băm SHA-256 của tệp APK bằng lệnh `Get-FileHash`.
   - Bắt buộc phải khớp chính xác 100% với mã băm kỳ vọng (`075f297219f174c8ffa679fcee8a6ba230e9a347b883b97d2fcdbbe036f42c97`). Nếu tệp bị hỏng, bị sửa đổi hoặc tải thiếu, script lập tức hủy thao tác.
5. **Cài đặt không phá hủy dữ liệu (No-Destruction Installation):**
   - Sử dụng lệnh `adb -s <Device> install -r <ApkPath>` (cờ `-r` cho phép cài đè bản cập nhật).
   - **Tuyệt đối không** gọi `adb uninstall` và **không** gọi `pm clear`, đảm bảo toàn bộ tiến trình học tập, tài khoản đã đăng nhập và dữ liệu IndexedDB của học sinh được giữ nguyên vẹn.

---

## 3. Hướng Dẫn Kết Nối DOOGEE R10 (Android 13)

### 3.1 Kết nối qua cáp USB Type-C (Khuyên dùng - Ổn định nhất)
1. Trên DOOGEE R10: Vào **Cài đặt (Settings)** ➔ **Thông tin máy tính bảng (About tablet)** ➔ Chạm 7 lần vào **Số phiên bản (Build number)** để mở khóa tùy chọn nhà phát triển.
2. Quay lại **Hệ thống (System)** ➔ **Tùy chọn cho nhà phát triển (Developer options)** ➔ Bật **Gỡ lỗi USB (USB debugging)**.
3. Cắm cáp USB nối máy tính bảng với PC. Trên màn hình máy tính bảng sẽ xuất hiện thông báo hỏi: *"Cho phép gỡ lỗi USB từ máy tính này?"*. Tích chọn *"Luôn cho phép từ máy tính này"* và bấm **Cho phép (Allow)**.
4. Trên PC, chạy lệnh:
   ```powershell
   adb devices
   ```
   Kết quả kỳ vọng hiển thị serial kèm chữ `device`:
   ```text
   List of devices attached
   D2304029AZ00036#M101TBR200-TC67D    device
   ```

### 3.2 Kết nối qua Wi-Fi không dây (Android 13 Wireless Debugging)
1. Đảm bảo DOOGEE R10 và PC đang cùng kết nối vào một mạng Wi-Fi nội bộ.
2. Vào **Cài đặt** ➔ **Tùy chọn cho nhà phát triển** ➔ Bật **Gỡ lỗi không dây (Wireless debugging)**.
3. Chạm vào dòng "Gỡ lỗi không dây" ➔ Chọn **Ghép nối thiết bị bằng mã ghép nối (Pair device with pairing code)**.
4. Màn hình sẽ hiện mã PIN 6 số và địa chỉ IP kèm cổng ghép nối (ví dụ: `192.168.1.40:37099`).
5. Trên PC, thực hiện lệnh ghép nối một lần duy nhất:
   ```powershell
   adb pair 192.168.1.40:37099 <Mã_PIN_6_số>
   ```
6. Sau khi ghép nối thành công, nhìn vào màn hình máy tính bảng để lấy cổng kết nối chính (thường khác cổng ghép nối, ví dụ: `192.168.1.40:37100`) và thực hiện kết nối:
   ```powershell
   adb connect 192.168.1.40:37100
   ```
7. Chạy `adb devices` để kiểm tra thiết bị không dây đã sẵn sàng.

---

## 4. Quy Trình Rollback & Khôi Phục Sự Cố

Trong trường hợp bản APK mới gặp lỗi không tương thích:
1. **Kiểm tra phiên bản đang chạy:**
   ```powershell
   adb -s <Device> shell dumpsys package vn.edu.tienganhcodung.app | grep -i versionName
   ```
2. **Cài đặt lùi phiên bản (Rollback với cờ cho phép hạ cấp):**
   ```powershell
   adb -s <Device> install -r -d ./backup/tienganhcodung-v2.1.0.apk
   ```
3. **Trường hợp khẩn cấp (Chỉ thực hiện khi có xác nhận của giáo viên/quản lý):**
   Nếu hạ cấp thất bại do giới hạn chữ ký của Android, sao lưu dữ liệu cục bộ trước khi cài đặt lại:
   ```powershell
   adb -s <Device> backup -f app_backup.ab vn.edu.tienganhcodung.app
   ```
