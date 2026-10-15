import { execSync } from 'child_process';

const creds = execSync('git credential fill', { input: 'protocol=https\nhost=github.com\n\n' }).toString();
const match = creds.match(/password=(.*)/);
if (!match) {
  console.error('Cannot get git token');
  process.exit(1);
}

const token = match[1].trim();
const title = 'feat(mobile-pwa): Phase 5 - Mobile UI Rebuild, Real PWA Update, APK OTA & ADB R10 Installer';
const body = `### Bối Cảnh & Mục Tiêu (Phase 5: Mobile UI Rebuild & PWA / APK OTA)

PR này thực hiện toàn bộ phạm vi **Phase 5**, được **stacked trực tiếp trên PR Phase 4** (\`agy/quiz-schedule-ui-e2e-phase4\`, base commit \`1fdc8a1\`).

Mục tiêu kỹ thuật:
1. **Rebuild giao diện Mobile / Tablet** chuẩn Academic Warmth (Warm Ivory / Neutral Stone / Emerald / Coral, loại bỏ triệt để navy / dark blue trong Updater và Shell).
2. **Nút "Cập Nhật Ứng Dụng (Mạng)"** hiển thị rõ ràng trên Mobile Navigation Drawer và Footer, phản ánh 7 trạng thái phản ứng: Đang kiểm tra, Đã mới nhất, Có bản mới, Ngoại tuyến / Lỗi, Đang tải, Cần mở lại, và Chặn khởi động lại khi đang bận.
3. **Cơ chế cập nhật PWA Service Worker thực tế**: Xử lý \`SKIP_WAITING\`, \`controllerchange\` an toàn, tích hợp Global Busy Registry chặn reload mất dữ liệu làm bài thi / form nháp.
4. **Hệ thống phân phối APK OTA qua mạng**: Endpoint \`GET /api/apk/version\` cung cấp SHA-256 thực tế, kích thước file chuẩn xác, kiểm soát bảo mật URL download.
5. **Bộ cài đặt an toàn DOOGEE R10 qua ADB** (\`scripts/install_r10.ps1\`): Kiểm tra đúng dòng máy \`DOOGEE R10\` (Android 13), xác thực SHA-256 trước cài, cài đặt nâng cấp bảo toàn dữ liệu (\`adb install -r\`), chế độ \`DryRun\` an toàn, kèm sổ tay vận hành \`docs/RUNBOOK_R10_ADB_INSTALL.md\`.

---

### Dependency Chain (Stacked PRs)
1. **PR #27**: Phase 1 — Data Integrity, Question Bank Bridge, Seed Public Catalog (\`agy/quiz-library-sync-phase1\`)
2. **PR #28**: Phase 2 — Auto Quiz Builder, Camera Capture & Multi-Source (\`agy/quiz-auto-builder-phase2\`)
3. **PR #29**: Phase 3 — Safe Drive Sync, Conflict Matrix, Concurrency Locks & Observability (\`agy/quiz-drive-sync-phase3\`)
4. **PR #30**: Phase 4 — Quiz / Schedule Dual Schema & UI E2E Contract (\`agy/quiz-schedule-ui-e2e-phase4\`)
5. **PR hiện tại (Phase 5)**: Mobile UI Rebuild, Real PWA Update, APK OTA & ADB R10 Installer (\`agy/mobile-pwa-ota-phase5\`) -> **Base:** \`agy/quiz-schedule-ui-e2e-phase4\`

---

### Chi Tiết Cải Tiến Kỹ Thuật (RED-5.1 -> RED-5.4)

#### 1. RED-5.1: Mobile UI Audit & Rebuild
- Chuẩn hóa toàn bộ bảng màu sang Warm Ivory / Neutral Stone / Emerald / Coral.
- Thiết lập \`BottomNav\` với khoảng cách an toàn (\`safe-area-inset-bottom\` + 4.75rem) chống che khuất nội dung.
- Đảm bảo toàn bộ touch targets trên mobile/tablet >= 44x44px.
- Hộp thoại cập nhật tuân thủ chuẩn a11y: \`role="dialog"\`, \`aria-modal="true"\`, \`aria-labelledby\`, nút đóng có \`aria-label="Đóng"\`.
- Tách biệt rõ ràng 2 luồng: Cập nhật PWA tức thì (In-place Service Worker) và Tải file APK cho thiết bị Android chuyên dụng.

#### 2. RED-5.2: Real PWA Service Worker Update
- Loại bỏ so sánh cứng \`currentAppVersion = '2.2.0'\` và \`version_code > 220\`.
- Xây dựng module hợp đồng phiên bản \`src/lib/versionContract.js\` hỗ trợ phân tích và so sánh ngữ nghĩa SemVer lẫn numeric build code.
- Kích hoạt \`navigator.serviceWorker.getRegistration().update()\` khi người dùng bấm kiểm tra hoặc định kỳ.
- Bổ sung sự kiện lắng nghe \`SKIP_WAITING\` trong \`static/sw.js\` (\`self.skipWaiting()\`).
- Bảo vệ tác vụ chưa lưu: Khi người dùng đang làm bài thi (\`isAppBusy() === true\`), hệ thống chặn khởi động lại đột ngột, hiển thị cảnh báo hướng dẫn lưu bài trước khi kích hoạt.
- Ngăn ngừa vòng lặp reload (\`window.__swReloading\`), chỉ reload một lần duy nhất khi controller thay đổi ở trạng thái an toàn (idle).

#### 3. RED-5.3: Network APK OTA
- Kiểm tra tính toán SHA-256 thực tế của file APK tĩnh (\`075f297219f174c8ffa679fcee8a6ba230e9a347b883b97d2fcdbbe036f42c97\`) và kích thước chuẩn (\`2,975,961\` bytes / 2.8 MB).
- Loại bỏ chuỗi gây hiểu nhầm "WiFi Direct" trong changelog và phản hồi API; khẳng định phân phối qua mạng HTTP(S) tiêu chuẩn.
- Kiểm định URL tải file APK: Chặn các URL protocol-relative (\`//\`) và chỉ cho phép cùng nguồn gốc (same-origin) hoặc HTTPS an toàn.

#### 4. RED-5.4: Bộ Cài Đặt Tự Động & An Toàn DOOGEE R10 (\`scripts/install_r10.ps1\`)
- Tự động nhận diện thiết bị DOOGEE R10 qua ADB, kiểm tra chặt chẽ \`ro.product.manufacturer=DOOGEE\` và \`ro.product.model=R10\`.
- Xác minh tính toàn vẹn SHA-256 trước khi đẩy sang thiết bị.
- Cài đặt không xóa dữ liệu người dùng (\`adb install -r\`).
- Hỗ trợ tham số an toàn: \`-DryRun\`, \`-Device\`, \`-ApkPath\`, \`-ExpectedSha256\`, \`-AllowModelOverride\`.
- Cung cấp tài liệu vận hành chi tiết tại \`docs/RUNBOOK_R10_ADB_INSTALL.md\`.

---

### Bằng Chứng Nghiệm Thu (Quality & Verification Gates)

1. **Unit & Contract Tests**: **37/37 PASS (100%)**
   - \`tests/version_contract.test.js\`: 6/6 PASS
   - \`tests/install_r10_contract.test.js\`: 4/4 PASS
   - \`tests/pwa_update_behavior.test.js\`: 4/4 PASS
   - \`tests/quiz_readiness.test.js\`: 9/9 PASS
   - \`tests/schedule_save_green.test.js\`: 14/14 PASS

2. **Quiz & Schedule Regression Tests**: **207/207 PASS (100%)**
   - 23 test suites bao quát toàn bộ Question Bank Bridge, Auto Quiz Builder, Drive Sync, Dual Schedule Schema, Schedule Scope, PWA Navigation.

3. **Playwright Real Browser UI Contract E2E** (\`scripts/test_phase5_e2e.mjs\`):
   - **19/19 checks PASS (Exit 0)** across 4 viewports:
     - \`mobile_320\` (320x600): Pass (No overflow, touch target 304x44px, Toast, Modal a11y, Busy block, Offline retry)
     - \`mobile_360\` (360x640): Pass (No overflow, touch target 344x44px, Toast, Modal a11y, Busy block, Offline retry)
     - \`tablet_800\` (800x1024): Pass (No overflow, touch target 752x44px, Toast, Modal a11y, Busy block, Offline retry)
     - \`desktop\` (1280x800): Pass (No overflow, footer update button, Modal a11y, Busy block, Offline retry)
   - Lưu 19 ảnh chụp màn hình kiểm chứng tại \`C:\\Users\\admin\\.gemini\\antigravity\\scratch\\phase5_e2e_screenshots\\\`.

4. **Svelte Check & Build Gates**:
   - \`npm run check\`: **0 errors**, 247 warnings
   - \`npm run build\`: **PASS** (Adapter Cloudflare build hoàn tất trong 7.5s)
   - \`static/build_meta.json\`: Đã revert nguyên trạng.
   - \`git diff --check origin/agy/quiz-schedule-ui-e2e-phase4...HEAD\`: **0 whitespace errors**.

---

### Operational Note & Non-Claim Notice
- **Máy tính bảng DOOGEE R10**: Đã thực hiện kiểm định dry-run và kiểm tra phần cứng thiết bị vật lý qua ADB (\`scripts/install_r10.ps1 -DryRun\`).
- **PR này TUYỆT ĐỐI KHÔNG tuyên bố máy tính bảng DOOGEE R10 đã được cài đặt hoàn tất ngoài đời thực**; toàn bộ quy trình kết nối và bàn giao thực tế được hướng dẫn theo đúng sổ tay vận hành tại \`docs/RUNBOOK_R10_ADB_INSTALL.md\`.
- **KHÔNG** merge, **KHÔNG** deploy, **KHÔNG** apply migrations remote D1.`;

async function main() {
  const res = await fetch('https://api.github.com/repos/nmvpiovn-web/dungcna/pulls', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'Antigravity-Agent'
    },
    body: JSON.stringify({
      title,
      head: 'agy/mobile-pwa-ota-phase5',
      base: 'agy/quiz-schedule-ui-e2e-phase4',
      body,
      draft: true
    })
  });

  const json = await res.json();
  if (!res.ok) {
    console.error('Failed to create PR:', json);
    process.exit(1);
  }

  console.log('PR created successfully!');
  console.log('PR Number:', json.number);
  console.log('PR URL:', json.html_url);
}

main();
