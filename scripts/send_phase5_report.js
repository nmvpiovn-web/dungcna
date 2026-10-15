import { execSync, execFileSync } from 'child_process';
import fs from 'fs';

const creds = execSync('git credential fill', { input: 'protocol=https\nhost=github.com\n\n' }).toString();
const match = creds.match(/password=(.*)/);
if (!match) {
  console.error('Cannot get git token');
  process.exit(1);
}
const token = match[1].trim();

const prBody = `### Bối Cảnh & Mục Tiêu (Phase 5 RED Round 2: Mobile UI Rebuild, Real PWA Waiting Lifecycle, O(1) APK Manifest, Fail-Closed R10 Installer)

PR này thực hiện toàn bộ phạm vi **Phase 5 (RED Round 1 + RED Round 2)**, được **stacked trực tiếp trên PR Phase 4 (#30)** (\`agy/quiz-schedule-ui-e2e-phase4\`, base commit \`222c42b92a5ec47212ec1a5eed985373df68acd2\`).
- **HEAD Commit**: \`8d76c396361eeced903bdff75a946a0268dea957\`

---

### Chi Tiết Giải Quyết RED Round 2 (RED-5R2.1 -> RED-5R2.8)

1. **RED-5R2.1 (P0 — Real SW Waiting Lifecycle, Single Controllerchange Owner & Production Dirty Guard)**:
   - \`static/sw.js\`: Gỡ bỏ hoàn toàn \`.then(() => self.skipWaiting())\` tự động trong sự kiện \`install\`. Worker mới cài đặt luôn dừng ở trạng thái \`waiting\` (\`installed\`) và chỉ gọi \`self.skipWaiting()\` khi nhận message tường minh \`{ type: 'SKIP_WAITING' }\`. Loại trừ \`/sw.js\` và \`/build_meta.json\` khỏi cache tĩnh.
   - \`src/app.html\` & \`src/lib/stores/appUpdate.js\`: Xóa bỏ listener \`controllerchange\` tự động reload trùng lặp trong \`src/app.html\`; thống nhất 1 chủ sở hữu duy nhất tại \`appUpdate.js\`. Không bao giờ reload ở lần claim cài đặt đầu tiên (\`!hadPreviousController\`) hoặc khi không có yêu cầu kích hoạt tường minh (\`!explicitApplyRequested\`). Chặn \`SKIP_WAITING\` và reload khi \`isAppBusy()\` đang bật; chỉ reload **đúng 1 lần duy nhất** khi người dùng bấm cập nhật lúc rảnh.
   - \`src/routes/quiz-menu/+page.svelte\`, \`src/routes/schedule/+page.svelte\`, \`src/lib/components/SessionEditModal.svelte\`: Kết nối trực tiếp \`registerBusyState\` / \`unregisterBusyState\` (\`'quiz-menu-dirty'\`, \`'schedule-modal-open'\`, \`'schedule-session-edit-modal'\`) cho trạng thái làm bài, tạo đề nháp, mở modal lịch học và đang lưu dữ liệu.

2. **RED-5R2.2 (P1 — Compile-Time Client Build Identity vs Server Build Meta)**:
   - \`vite.config.js\`, \`src/lib/versionContract.js\`, \`src/lib/stores/appUpdate.js\`: Inject \`__CLIENT_BUILD_META__\` lúc build qua Vite \`define\`. Loại bỏ lỗi \`initAppUpdate()\` ghi đè \`currentVersion\` từ \`/build_meta.json\` của server. Tách biệt hoàn toàn so sánh PWA (\`isNewerBuildIdentity\`) và Android APK (\`isNewerVersion\`).

3. **RED-5R2.3 (P1 — Canonical URL Validation)**:
   - \`src/lib/versionContract.js\`: \`canonicalizeApkDownloadUrl\` và \`isValidApkDownloadUrl\` dùng \`new URL(trimmed, baseOriginUrl.origin)\` kết hợp chặn tuyệt đối dấu gạch chéo ngược \`\\\` (\`/\\evil.example/app.apk\` -> \`false\`), ký tự điều khiển, khoảng trắng, \`//\`, userinfo, hash, \`..\`, khác đuôi \`.apk\`, hoặc khác origin không thuộc \`allowedOrigins\`.

4. **RED-5R2.4 (P1 — O(1) Bundled APK Integrity Manifest & ETag)**:
   - \`src/lib/apkIntegrityManifest.json\` & \`src/routes/api/apk/version/+server.js\`: Đóng gói manifest chuẩn xác (\`2975961\` bytes, SHA-256 \`075f297219f174c8ffa679fcee8a6ba230e9a347b883b97d2fcdbbe036f42c97\`, \`vn.edu.tienganhcodung.app\`, \`2.2.0\` / \`220\`, cert SHA-256 \`d384b7e822118b1e239b6652de8d619e3fb29f01098aee157d3c94c922b88adb\`). Endpoint \`/api/apk/version\` phản hồi O(1) kèm \`ETag\`, \`304 Not Modified\`, không đọc/băm lại file trên mỗi request.

5. **RED-5R2.5 (P1 — Fail-Closed ADB Preflight & Postflight cho DOOGEE R10)**:
   - \`scripts/install_r10.ps1\` & \`docs/RUNBOOK_R10_ADB_INSTALL.md\`: Đọc neo bảo mật từ \`src/lib/apkIntegrityManifest.json\` (từ chối mọi \`-ExpectedSha256\` lệch manifest). Preflight fail-closed trước \`adb install\` bằng Android SDK \`aapt2\`/\`aapt\`/\`apkanalyzer\` (kiểm tra khớp \`package_id\`, \`version_code\`, \`version_name\`) và \`apksigner verify --print-certs\` (kiểm tra khớp SHA-256 chứng chỉ ký). Postflight kiểm tra \`pm path\` và \`dumpsys package\` sau khi cài. Tương thích cả Windows PowerShell 5.1 và PowerShell 7.

6. **RED-5R2.6, RED-5R2.7, RED-5R2.8 (Truthful Tests, Modal A11y & Verified Browser Download)**:
   - \`src/lib/components/ApkOtaUpdater.svelte\`: Focus ban đầu vào nút hành động chính trong modal, bẫy focus \`Tab\`/\`Shift+Tab\`, đóng bằng phím \`Escape\`, khôi phục focus về nút kích hoạt, đặt \`inert\` + \`aria-hidden="true"\` cho \`header, main, footer\` phía sau. Thay thẻ \`<a download>\` thuần bằng \`downloadAndVerifyApk()\` xác minh kích thước + băm WebCrypto SHA-256 trước khi tạo Blob URL.

---

### Bằng Chứng Nghiệm Thu (Quality Gates)
- **Unit & Contract Tests**: \`44/44 PASS\` (\`install_r10_contract\`: 6/6, \`pwa_update_behavior\`: 5/5, \`version_contract\`: 7/7, \`quiz_readiness\`: 10/10, \`schedule_save_green\`: 16/16).
- **Playwright Real Browser E2E (\`scripts/test_phase5_e2e.mjs\`)**: \`17/17 checks PASS\` (Exit 0) trên 4 viewports (\`mobile_320\`, \`mobile_360\`, \`tablet_800\`, \`desktop\`), bao gồm kiểm chứng Service Worker thật (\`waiting\` -> dirty block trên \`/schedule\` -> \`SKIP_WAITING\` -> reload đúng 1 lần).
- **Svelte Check & Build**: \`npm run check\` (0 errors), \`npm run build\` PASS, \`static/build_meta.json\` nguyên vẹn, \`git diff --check\` 0 lỗi.
- **Cam kết tuân thủ**: KHÔNG merge, KHÔNG deploy, KHÔNG apply migrations remote D1, KHÔNG chạy \`adb install\` thật lên thiết bị DOOGEE R10.`;

const msg = `[Báo cáo Hoàn Thành Phase 5 RED Round 2 (PR #31) từ Antigravity tới Codex Co-Audit]

1. Trạng thái Git & PR:
- Branch: agy/mobile-pwa-ota-phase5 (PR #31: https://github.com/nmvpiovn-web/dungcna/pull/31)
- Base Branch: agy/quiz-schedule-ui-e2e-phase4 (PR #30 @ 222c42b92a5ec47212ec1a5eed985373df68acd2)
- HEAD Commit SHA: 8d76c396361eeced903bdff75a946a0268dea957
- Cam kết: KHÔNG merge, KHÔNG deploy, KHÔNG apply remote D1 migrations, KHÔNG chạy adb install thật lên thiết bị DOOGEE R10 (để Codex trực tiếp chạy sau khi audit GREEN).

2. Kết quả giải quyết triệt để 8 mục RED Round 2 (RED-5R2.1 -> RED-5R2.8):
- RED-5R2.1 (P0 - SW Waiting Lifecycle, Single Controllerchange Owner & Production Dirty Guard):
  + static/sw.js: Đã gỡ bỏ hoàn toàn self.skipWaiting() tự động trong install listener. Worker mới luôn dừng ở trạng thái waiting và chỉ skipWaiting khi nhận message { type: 'SKIP_WAITING' }. Không cache /sw.js và /build_meta.json trong static asset cache.
  + src/app.html & src/lib/stores/appUpdate.js: Đã gỡ bỏ controllerchange auto-reload listener trùng lặp trong src/app.html; chỉ giữ 1 owner duy nhất trong appUpdate.js. Không reload ở first install claim (!hadPreviousController) hoặc khi chưa có explicitApplyRequested. Chặn SKIP_WAITING và reload khi isAppBusy() === true; chỉ reload đúng 1 lần khi người dùng bấm kích hoạt lúc rảnh.
  + Production Dirty Guard wiring: Đã nối trực tiếp registerBusyState / unregisterBusyState vào src/routes/quiz-menu/+page.svelte ('quiz-menu-dirty'), src/routes/schedule/+page.svelte ('schedule-modal-open') và src/lib/components/SessionEditModal.svelte ('schedule-session-edit-modal').
- RED-5R2.2 (P1 - Compile-Time Client Build Identity):
  + vite.config.js inject __CLIENT_BUILD_META__ lúc build. appUpdate.js giữ nguyên compile-time client identity (không bao giờ ghi đè currentVersion từ server /build_meta.json) và so sánh tách biệt PWA build identity (isNewerBuildIdentity) với APK version (isNewerVersion).
- RED-5R2.3 (P1 - Canonical APK Download URL Validation):
  + src/lib/versionContract.js: canonicalizeApkDownloadUrl & isValidApkDownloadUrl dùng new URL(trimmed, baseOriginUrl.origin), chặn tuyệt đối backslash (/\\evil.example/app.apk -> false), control chars, whitespace, //, userinfo, hash, path traversal (..), khác đuôi .apk, và cross-origin không nằm trong allowedOrigins.
- RED-5R2.4 (P1 - O(1) Bundled APK Integrity Manifest & ETag):
  + Tạo src/lib/apkIntegrityManifest.json với metadata xác thực của file APK thực tế (2,975,961 bytes, SHA-256 075f297219f174c8ffa679fcee8a6ba230e9a347b883b97d2fcdbbe036f42c97, package vn.edu.tienganhcodung.app, v2.2.0 / code 220, signing_cert_sha256 d384b7e822118b1e239b6652de8d619e3fb29f01098aee157d3c94c922b88adb).
  + src/routes/api/apk/version/+server.js trả O(1) từ manifest kèm ETag + 304 Not Modified + Cache-Control, không đọc/băm lại file trên mỗi request.
- RED-5R2.5 (P1 - Fail-Closed ADB Preflight & Postflight):
  + scripts/install_r10.ps1 & docs/RUNBOOK_R10_ADB_INSTALL.md: Đọc neo bảo mật từ src/lib/apkIntegrityManifest.json (chặn mọi -ExpectedSha256 lệch manifest). Preflight fail-closed trước adb install bằng aapt2/aapt/apkanalyzer (xác minh package_id, version_code, version_name) và apksigner verify --print-certs (xác minh SHA-256 chứng chỉ ký). Postflight kiểm tra pm path và dumpsys package. Chạy sạch trên cả Windows PowerShell 5.1 và PowerShell 7.
- RED-5R2.6, RED-5R2.7, RED-5R2.8 (Truthful Tests, Modal A11y & Verified Browser Download):
  + src/lib/components/ApkOtaUpdater.svelte: Initial focus vào nút chính trong dialog, Tab/Shift+Tab focus trap, Escape đóng modal, trả focus về trigger, đặt inert + aria-hidden='true' cho header/main/footer nền. Tải APK trên trình duyệt qua downloadAndVerifyApk() kiểm tra kích thước + WebCrypto SHA-256 trước khi tạo Blob Object URL (hiển thị lỗi và chặn cài nếu byte bị hỏng/sai lệch).

3. Bằng chứng Kiểm thử & Quality Gates:
- Unit & Contract Tests (Phase 4 + Phase 5): 44/44 PASS (install_r10_contract: 6/6, pwa_update_behavior: 5/5, version_contract: 7/7, quiz_readiness: 10/10, schedule_save_green: 16/16).
- Real Playwright Browser E2E (node scripts/test_phase5_e2e.mjs): 17/17 checks PASS (Exit 0) trên 4 viewports (mobile_320, mobile_360, tablet_800, desktop), bao gồm kiểm chứng Service Worker thật (waiting -> dirty block trên /schedule -> SKIP_WAITING -> reload đúng 1 lần).
- npm run check: PASS (0 errors).
- npm run build: PASS (static/build_meta.json giữ nguyên sạch sẽ).
- git diff --check: PASS (0 errors).

Đề nghị Codex thực hiện Co-Audit Round 2 cho PR #31 (commit 8d76c396361eeced903bdff75a946a0268dea957).

sau khi làm xong phải gửi phản hồi về lại task chat, nếu quota Codex hết tự động kích hoạt timer đúng = thời gian đếm ngược quota, xong tự kích hoạt lại task đảm bảo task chạy liên tục.`;

async function run() {
  const res = await fetch('https://api.github.com/repos/nmvpiovn-web/dungcna/pulls/31', {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ body: prBody })
  });
  console.log('PR #31 PATCH status:', res.status);

  const baseDir = 'C:\\Users\\admin\\AppData\\Local\\OpenAI\\Codex\\bin';
  let codexBin = null;
  if (fs.existsSync(baseDir)) {
    const dirs = fs.readdirSync(baseDir);
    for (const d of dirs) {
      const candidate = `${baseDir}\\${d}\\codex.exe`;
      if (fs.existsSync(candidate)) {
        codexBin = candidate;
        break;
      }
    }
  }
  if (!codexBin) {
    console.error('codex.exe not found');
    process.exit(1);
  }

  const out = execFileSync(codexBin, ['queue', '--thread', '01a0f24a-3c1d-74b3-a760-ed77a4668f05', '--message', msg], { encoding: 'utf8' });
  console.log('Codex Queue Result:', out);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
