# Sổ Tay Kỹ Thuật: Hướng Dẫn Cài Đặt & Cập Nhật APK Trên DOOGEE R10 Bằng ADB

> **Tài liệu:** Sổ tay vận hành cài đặt và bảo mật ứng dụng Android (`scripts/install_r10.ps1`)
> **Áp dụng cho:** Máy tính bảng học tập DOOGEE R10 (Android 13 / API 33)
> **Gói ứng dụng:** `vn.edu.tienganhcodung.app`
> **Lưu ý bảo vệ môi trường:** Máy chủ kiểm thử/audit hiện có ADB 37.0.1 nhưng danh sách thiết bị không dây trống và các cổng không dây đóng. Không được tuyên bố trong PR rằng đã cài đặt lên tablet thực tế.

---

## 1. Hiện Trạng Hệ Thống & Phụ Thuộc Máy Chủ (Host Dependencies)

### 1.1 Các công cụ bắt buộc trên máy chủ (Fail-Closed Preflight Dependencies)
Để chạy `scripts/install_r10.ps1`, máy chủ bắt buộc phải có đầy đủ các công cụ sau trước khi bất kỳ lệnh `adb install` nào được phép thực thi:
* **ADB (`adb.exe`):** `Android Debug Bridge version 1.0.41 (Version 37.0.1-15733141)` (từ Android Platform-Tools).
* **Trình kiểm tra gói APK (`aapt2.exe` / `aapt.exe` / `apkanalyzer.bat`):** Thuộc gói Android SDK Build-Tools (ví dụ `build-tools/34.0.0/aapt2.exe`). Dùng để đọc trực tiếp `AndroidManifest.xml` nhị phân trong APK và đối chiếu `package_id` (`vn.edu.tienganhcodung.app`), `versionCode` (`220`), `versionName` (`2.2.0`).
* **Trình xác thực chữ ký số (`apksigner.bat` + Java 17+):** Thuộc gói Android SDK Build-Tools (`build-tools/34.0.0/apksigner.bat`). Dùng lệnh `apksigner verify --print-certs` để trích xuất mã băm SHA-256 của chứng chỉ X.509 ký APK (`d384b7e822118b1e239b6652de8d619e3fb29f01098aee157d3c94c922b88adb`) và so khớp với manifest gốc.
* **Mỏ neo bảo mật bất biến (`src/lib/apkIntegrityManifest.json`):** Chứa `package_id`, `version_code`, `version_name`, `bytes` (`2975961`), `sha256` (`075f297219f174c8ffa679fcee8a6ba230e9a347b883b97d2fcdbbe036f42c97`) và `signing_cert_sha256`. Tham số `-ExpectedSha256` từ người gọi **không được phép** ghi đè mỏ neo này (chỉ được phép trùng khớp).

---

## 2. Quy Trình Cài Đặt An Toàn Bằng Script `scripts/install_r10.ps1`

### 2.1 Cú pháp lệnh tiêu chuẩn

```powershell
# 1. Chạy thử nghiệm mô phỏng toàn bộ bước xác thực preflight & thiết bị (Khuyên dùng trước khi cài thật)
pwsh ./scripts/install_r10.ps1 -DryRun

# 2. Cài đặt trực tiếp lên thiết bị DOOGEE R10 kết nối qua USB
pwsh ./scripts/install_r10.ps1

# 3. Cài đặt lên thiết bị cụ thể qua mã Serial
pwsh ./scripts/install_r10.ps1 -Device "D2304029AZ00036#M101TBR200-TC67D"
```

### 2.2 Các chốt chặn an toàn (Fail-Closed Preflight & Postflight Gates)

Script thực thi tuần tự các cổng kiểm tra nghiêm ngặt **trước khi** chạm tới thiết bị:
1. **Đối chiếu mỏ neo `src/lib/apkIntegrityManifest.json` & kích thước/SHA-256 tệp APK:** Kiểm tra đúng `2975961` bytes và mã băm SHA-256 `075f297219f174c8ffa679fcee8a6ba230e9a347b883b97d2fcdbbe036f42c97`. Từ chối ngay nếu caller truyền `-ExpectedSha256` khác với manifest.
2. **Kiểm tra công cụ & Preflight Package (`aapt2 dump badging`):** Bắt buộc xác minh `package: name='vn.edu.tienganhcodung.app' versionCode='220' versionName='2.2.0'`. Nếu thiếu công cụ hoặc sai package/version, dừng ngay lập tức (không gọi `adb install`).
3. **Preflight Chữ ký số (`apksigner verify --print-certs`):** Bắt buộc xác minh `Signer #1 certificate SHA-256 digest` khớp với `d384b7e822118b1e239b6652de8d619e3fb29f01098aee157d3c94c922b88adb`. Nếu sai người ký hoặc chữ ký hỏng, dừng ngay lập tức.
4. **Kiểm tra trạng thái thiết bị ADB & Dòng máy (`DOOGEE R10`):** Chỉ chấp nhận thiết bị ở trạng thái `device` và có `ro.product.manufacturer = DOOGEE`, `ro.product.model = R10` (trừ khi truyền `-AllowModelOverride`).
5. **Cài đặt không phá hủy dữ liệu & Postflight Verification:**
   - Thực thi `adb -s <Device> install -r <ApkPath>` (không bao giờ gọi `uninstall` hay `pm clear`).
   - Sau khi cài xong, chạy hậu kiểm (postflight) bằng `adb shell pm path vn.edu.tienganhcodung.app` và `adb shell dumpsys package vn.edu.tienganhcodung.app` để xác nhận gói đã hiện diện với đúng `versionName=2.2.0` và `versionCode=220`.

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
