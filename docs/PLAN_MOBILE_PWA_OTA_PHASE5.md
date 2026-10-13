# Kế Hoạch Triển Khai Phase 5: Mobile UI Audit, Real PWA Update, APK OTA & ADB DOOGEE R10 Installer

> **Scope:** Mobile UI Hardening, Real PWA Service Worker Update, Network APK OTA, Safe ADB R10 Installer (`agy/mobile-pwa-ota-phase5`)
> **Base Branch:** `agy/quiz-schedule-ui-e2e-phase4` (Commit `1fdc8a1`)
> **Target PR:** Stacked Draft PR trên `agy/quiz-schedule-ui-e2e-phase4`
> **Kỷ Luật An Toàn:** KHÔNG merge, KHÔNG deploy, KHÔNG apply remote D1 migrations, KHÔNG claim đã cài tablet trong PR.

---

## 1. Mục Tiêu & Bối Cảnh

Phase 5 tiếp tục lộ trình nâng cấp hệ thống Tiếng Anh Cô Dung, tập trung vào trải nghiệm di động thực tế và cơ chế phân phối/cập nhật ứng dụng qua mạng (OTA):
1. **Mobile UI Rebuild & Audit:** Tối ưu hóa toàn bộ shell điều hướng và các màn hình Quiz/Schedule/Updater trên các kích thước màn hình nhỏ và máy tính bảng: Mobile 320px, Mobile 360px, Tablet 800px.
2. **Loại Bỏ Hoàn Toàn Bảng Màu Tối (Navy/Dark Blue/Slate):** Thay thế đồng bộ bằng bảng màu Warm Ivory, Neutral Stone, Emerald và Coral theo chuẩn thương hiệu giáo dục của Cô Dung.
3. **Cơ Chế PWA Update Thật:** Loại bỏ hoàn toàn version hardcoded (`2.2.0` / `version_code > 220`). Cập nhật dựa trên `ServiceWorkerRegistration.update()`, xử lý vòng đời worker (`installing`, `waiting`, `controllerchange`), gửi thông điệp `SKIP_WAITING`, và tích hợp chặt chẽ với Global Busy/Dirty Registry để không làm mất bài thi hoặc dữ liệu nhập dở của học sinh/giáo viên.
4. **Cơ Chế Phân Phối APK OTA Qua Mạng:** Endpoint `/api/apk/version` trả SHA-256 thực tế (64 ký tự hex) và kích thước file chính xác. Giao diện phân biệt rõ giữa cập nhật tức thì (PWA) và tải tệp tin cài đặt APK (yêu cầu Android Package Installer xác nhận).
5. **Bộ Cài ADB DOOGEE R10 An Toàn (`scripts/install_r10.ps1`):** Script PowerShell kiểm tra thiết bị nghiêm ngặt (chỉ cài lên máy tính bảng DOOGEE R10 Android 13 được ủy quyền), xác thực SHA-256 APK trước khi cài, không uninstall làm mất dữ liệu, hỗ trợ dry-run và fail-closed khi không có thiết bị phù hợp.
6. **Kiểm Thử Thực Nghiệm & Runbook Đầy Đủ:** Bộ kiểm thử đơn vị, kiểm thử hợp đồng hành vi, và kiểm thử trình duyệt thực tế Playwright trên 4 viewports (320px, 360px, 800px, 1280px).

---

## 2. Chi Tiết Kiến Trúc Kỹ Thuật

### 2.1 RED-5.1: Mobile UI Audit & Rebuild
* **Viewports mục tiêu:**
  - `mobile_320`: 320px × 600px (màn hình nhỏ nhất).
  - `mobile_360`: 360px × 640px (chuẩn điện thoại phổ biến).
  - `tablet_800`: 800px × 1024px (chuẩn máy tính bảng học tập DOOGEE R10).
* **Quy tắc bố cục & Không che khuất:**
  - Không che khuất `BottomNav` (đã bổ sung khoảng đệm an toàn `bottom-[calc(env(safe-area-inset-bottom,0px)+4.5rem)]` cho các thông báo nổi).
  - Không có tràn ngang (`overflow-x: hidden` trên viewport body và container chính).
  - Điểm chạm cảm ứng (touch targets) tối thiểu 44×44px cho tất cả các nút bấm trên giao diện di động.
  - Ngữ nghĩa trợ năng (a11y): Các hộp thoại cập nhật sử dụng `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, nút đóng có `aria-label="Đóng"`.
* **Trạng thái nút Cập Nhật Ứng Dụng:**
  Nút cập nhật được tích hợp trực tiếp vào ngăn kéo menu di động (`#mobile-drawer`) và thanh chân trang (`footer`), phản ánh 6 trạng thái rõ ràng:
  1. `idle`: "Kiểm tra bản cập nhật mới" (kèm số hiệu phiên bản hiện tại).
  2. `checking`: "Đang kiểm tra cập nhật..." (kèm hiệu ứng spinner).
  3. `latest`: "Ứng dụng đã ở bản mới nhất" (biểu tượng tích xanh).
  4. `available`: "Có bản cập nhật mới!" (nổi bật với huy hiệu cập nhật).
  5. `offline`: "Ngoại tuyến (không thể kiểm tra)" (biểu tượng ngắt kết nối và nút thử lại).
  6. `updating`: "Đang tải bản cập nhật..." (tiến trình tải ngầm).
  7. `restart_needed`: "Cần mở lại ứng dụng để hoàn tất" (kèm nút kích hoạt làm mới trang an toàn).

### 2.2 RED-5.2: Cơ Chế Cập Nhật PWA Thật (Real Service Worker Lifecycle)
* **Loại bỏ Hardcode:**
  - Xóa bỏ `currentAppVersion = '2.2.0'` và `version_code > 220`.
  - Tạo module hợp đồng phiên bản dùng chung: `src/lib/versionContract.js`.
  - So sánh phiên bản bằng thuật toán Semantic Versioning (`compareSemver`) và mã số bản build (`version_code`).
* **Vòng đời Service Worker:**
  1. Khi người dùng hoặc hệ thống kích hoạt `checkForUpdate()`:
     - Gọi `navigator.serviceWorker.getRegistration()`.
     - Gọi `registration.update()` để trình duyệt gửi yêu cầu HTTP byte-check tới `static/sw.js`.
     - Nếu phát hiện `registration.waiting`: Gửi thông điệp `reg.waiting.postMessage({ type: 'SKIP_WAITING' })`.
     - Nếu phát hiện `registration.installing`: Lắng nghe sự kiện `onstatechange` cho đến khi chuyển sang `installed`.
  2. Tại `static/sw.js`:
     - Bổ sung bộ lắng nghe sự kiện `message`:
       ```javascript
       self.addEventListener('message', (event) => {
         if (event.data === 'SKIP_WAITING' || event.data?.type === 'SKIP_WAITING') {
           self.skipWaiting();
         }
       });
       ```
  3. Xử lý sự kiện `controllerchange` an toàn:
     - Kiểm tra trạng thái làm việc qua `window.isAppBusy()` (đã có trong `src/app.html`):
       - Nếu người dùng đang làm bài thi (`__isExamActive`), ghi âm, hoặc có biểu mẫu bẩn (`document.querySelector('form.dirty, input.dirty, textarea.dirty')`):
         **TUYỆT ĐỐI KHÔNG RELOAD TRÌNH DUYỆT**. Chuyển sang trạng thái `restart_needed`, hiển thị banner thông báo lịch sự yêu cầu người dùng lưu bài trước khi cập nhật.
       - Nếu hệ thống đang rảnh rỗi (`!isAppBusy()`):
         Thực hiện reload một lần duy nhất (`window.location.reload()`) có gắn cờ bảo vệ chống vòng lặp reload (`__swReloading`).

### 2.3 RED-5.3: Cơ Chế Phân Phối Tệp Tin APK OTA Qua Mạng
* **Endpoint `/api/apk/version`:**
  - Tính toán động mã băm SHA-256 thực tế (64 ký tự hex viết thường) và kích thước tệp tin thực tế bằng byte và MB từ tệp tin static `static/downloads/tienganhcodung-latest.apk`.
  - Header HTTP nghiêm ngặt: `Cache-Control: no-cache, no-store, must-revalidate`.
  - Xóa bỏ hoàn toàn cụm từ gây hiểu nhầm "WiFi Direct" (thực chất là truyền tệp tin qua giao thức HTTP chuẩn).
* **Giao diện phân định minh bạch:**
  - **PWA Update:** Cập nhật ngay trong trình duyệt (In-place) không cần tải tệp APK.
  - **APK Download:** Tải tệp tin cài đặt `.apk`. Chỉ hiển thị nút bấm tải tệp khi và chỉ khi:
    - URL tải về là cùng nguồn gốc (same-origin) hoặc sử dụng HTTPS.
    - Mã băm SHA-256 hợp lệ chuẩn 64 ký tự hex.
    - Kích thước tệp tin lớn hơn 0.
  - Không tự ý tải ngầm APK khi chưa có tương tác của người dùng. Không lưu trữ thông tin đăng nhập, không can thiệp trái phép quy trình xác nhận bảo mật của Android Package Installer.

### 2.4 RED-5.4: Script Cài Đặt ADB DOOGEE R10 An Toàn (`scripts/install_r10.ps1`)
* **Tham số script:**
  - `-Device <string>`: Mã serial của thiết bị mục tiêu (tùy chọn; tự động nhận diện nếu chỉ có duy nhất 1 thiết bị DOOGEE R10 hợp lệ).
  - `-ApkPath <string>`: Đường dẫn tệp tin APK (mặc định: `static/downloads/tienganhcodung-latest.apk`).
  - `-ExpectedSha256 <string>`: Mã băm SHA-256 kỳ vọng (mặc định: `075f297219f174c8ffa679fcee8a6ba230e9a347b883b97d2fcdbbe036f42c97`).
  - `-DryRun`: Chế độ chạy thử mô phỏng toàn bộ kiểm tra bảo mật mà không thực hiện lệnh `adb install`.
  - `-AllowModelOverride`: Cờ ghi đè mô hình (mặc định tắt; bắt buộc kiểm tra `ro.product.manufacturer=DOOGEE` và `ro.product.model=R10`).
* **Quy trình kiểm tra an toàn (Fail-Closed):**
  1. Kiểm tra sự tồn tại của `adb` trên máy tính; báo lỗi kèm hướng dẫn nếu thiếu.
  2. Lấy danh sách thiết bị từ `adb devices`. Nếu không có thiết bị, hướng dẫn kết nối USB/Wi-Fi và thoát với mã lỗi khác 0. Nếu có nhiều thiết bị, yêu cầu truyền rõ `-Device`.
  3. Đọc thuộc tính thiết bị bằng lệnh `getprop ro.product.manufacturer` và `getprop ro.product.model`. Nếu không đúng DOOGEE R10, dừng lại ngay lập tức.
  4. Tính toán mã SHA-256 của tệp APK cục bộ bằng `Get-FileHash`. Nếu không khớp `-ExpectedSha256`, dừng lại ngay lập tức.
  5. Kiểm tra thông tin gói `vn.edu.tienganhcodung.app` trước khi cài đặt.
  6. Cài đặt bằng lệnh `adb install -r` (reinstall giữ nguyên dữ liệu người dùng, không uninstall, không clear-data).
  7. Kiểm tra thông tin phiên bản sau khi cài đặt để đảm bảo thành công.
* **Tuyên bố bảo vệ:** Runbook nêu rõ trạng thái môi trường máy chủ audit và không tuyên bố trong PR rằng đã cài đặt lên tablet.

---

## 3. Danh Sách Tệp Tin & Hành Động Kỹ Thuật

| STT | Tệp tin | Hành động | Mục đích |
|---|---|---|---|
| 1 | `docs/PLAN_MOBILE_PWA_OTA_PHASE5.md` | Tạo mới | Bản kế hoạch chi tiết toàn diện Phase 5 |
| 2 | `docs/RUNBOOK_R10_ADB_INSTALL.md` | Tạo mới | Sổ tay hướng dẫn cài đặt DOOGEE R10 qua ADB, bảo mật, xác thực SHA-256 và rollback |
| 3 | `src/lib/versionContract.js` | Tạo mới | Module chuẩn hóa so sánh phiên bản semver, build metadata, sha256 và url validation |
| 4 | `src/routes/api/apk/version/+server.js` | Cập nhật | Tính toán sha256/size thực tế, xóa cụm từ WiFi Direct, header no-store |
| 5 | `static/sw.js` | Cập nhật | Thêm handler `SKIP_WAITING` trong sự kiện `message` |
| 6 | `src/lib/components/ApkOtaUpdater.svelte` | Rebuild | Giao diện chuẩn Warm Ivory/Stone/Emerald/Coral, tích hợp `versionContract`, safe-area insets, a11y dialog, touch target 44px |
| 7 | `src/routes/+layout.svelte` | Cập nhật | Tích hợp nút Cập nhật ứng dụng vào mobile drawer và footer với đầy đủ 6 trạng thái |
| 8 | `scripts/install_r10.ps1` | Tạo mới | PowerShell script cài đặt DOOGEE R10 an toàn với đầy đủ tham số và cơ chế fail-closed |
| 9 | `tests/version_contract.test.js` | Tạo mới | Unit tests cho logic phân tích, so sánh phiên bản, kiểm tra mã băm và URL |
| 10 | `tests/install_r10_contract.test.js` | Tạo mới | Unit & contract tests cho script PowerShell (dry-run, model check, hash mismatch) |
| 11 | `tests/pwa_update_behavior.test.js` | Tạo mới | Kiểm thử hành vi PWA update thật, mocked ServiceWorkerRegistration, controllerchange, busy registry |
| 12 | `scripts/test_phase5_e2e.mjs` | Tạo mới | Playwright E2E browser UI contract trên 4 viewports (320px, 360px, 800px, 1280px) |

---

## 4. Kế Hoạch Kiểm Thử & Tiêu Chí Chấp Nhận (Acceptance Criteria)

1. **Unit & Contract Tests:**
   * `node --test tests/version_contract.test.js`: 100% PASS.
   * `node --test tests/install_r10_contract.test.js`: 100% PASS.
   * `node --test tests/pwa_update_behavior.test.js`: 100% PASS.
   * Toàn bộ các bài test liên quan tới Quiz, Schedule, Update: 100% PASS.
2. **Playwright Real Browser UI Contract:**
   * Chạy `node scripts/test_phase5_e2e.mjs` trên 4 viewports:
     - Nút "Cập nhật ứng dụng" hiển thị đầy đủ trên mobile drawer (320, 360) và tablet (800).
     - Không có hiện tượng tràn ngang (horizontal overflow).
     - Hộp thoại cập nhật có a11y đầy đủ (`role="dialog"`, `aria-modal="true"`, focus target >= 44×44px).
     - Chặn reload khi form bẩn hoặc hệ thống bận (`window.registerBusyState`).
     - Chuyển đổi trạng thái chính xác (checking, latest, update available, offline retry).
     - Thoát sạch mã lỗi `0`.
3. **Quality Gates:**
   * `npm run check`: 0 errors.
   * `npm run build`: Thành công 100%.
   * Phục hồi `static/build_meta.json` về trạng thái ban đầu.
   * `git diff --check origin/agy/quiz-schedule-ui-e2e-phase4...HEAD`: 0 whitespace errors.
4. **Git & Stacked PR:**
   * Commit các tệp tin có chủ đích.
   * Push branch `agy/mobile-pwa-ota-phase5`.
   * Mở stacked Draft PR trên base `agy/quiz-schedule-ui-e2e-phase4`.
   * Báo cáo đầy đủ với câu kết thúc nguyên văn bắt buộc.
