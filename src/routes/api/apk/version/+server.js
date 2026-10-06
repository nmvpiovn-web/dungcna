import { json } from '@sveltejs/kit';

async function getApkIntegrity(url, downloadPath) {
  // Compute real sha256 + size from the served static asset instead of a
  // hardcoded placeholder (live audit 2026-10-06: API returned a1b2c3d4...
  // and 12.6 MB for a 2.8 MB file). Falls back to nulls if unreachable.
  try {
    const res = await fetch(new URL(downloadPath, url));
    if (!res.ok) return { sha256: null, file_size_mb: null };
    const buf = await res.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buf);
    const sha256 = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
    return { sha256, file_size_mb: Math.round((buf.byteLength / 1048576) * 10) / 10 };
  } catch {
    return { sha256: null, file_size_mb: null };
  }
}

export async function GET({ url }) {
  const downloadUrl = '/downloads/tienganhcodung-latest.apk';
  const { sha256, file_size_mb } = await getApkIntegrity(url, downloadUrl);
  const versionInfo = {
    app_name: 'Tiếng Anh Cô Dung',
    package_id: 'vn.edu.tienganhcodung.app',
    version_name: '2.2.0',
    version_code: 220,
    release_date: '2026-09-25T15:30:00Z',
    min_os_version: 'Android 8.0 (API 26)',
    target_sdk: 34,
    download_url: downloadUrl,
    file_size_mb: file_size_mb,
    sha256: sha256,
    wifi_only: true,
    force_update: false,
    changelog: [
      '⚡ Đồng bộ toàn diện PWA & APK với cơ chế tự động cập nhật qua Wi-Fi (OTA WiFi Direct)',
      '🎮 Bổ sung 4 trò chơi tiếng Anh mới: Xây dựng câu (Sentence Builder), Bậc thầy thì (Grammar Tense Master), Lật thẻ trí nhớ 3D (Memory Flip) và Đấu thẻ bài Flashcards',
      '👨‍🏫 Tích hợp Cổng Kiểm Soát Trò Chơi (Teacher Gatekeeper): Mặc định khóa với học sinh, chỉ mở khi Giáo viên/Cô Dung bật công tắc',
      '📚 Phân tầng hiển thị khóa học chính khóa (Lớp 7 cho Bảo Khiêm), khóa 18 lớp còn lại chống xao nhãng',
      '⭐ Tối ưu hóa hệ thống tích lũy sao thưởng và khấu trừ học phí'
    ]
  };

  return json(versionInfo, {
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Content-Type': 'application/json'
    }
  });
}
