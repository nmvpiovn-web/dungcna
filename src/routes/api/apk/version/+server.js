import { json } from '@sveltejs/kit';

export async function GET() {
  const versionInfo = {
    app_name: 'Tiếng Anh Cô Dung',
    package_id: 'vn.edu.tienganhcodung.app',
    version_name: '2.2.0',
    version_code: 220,
    release_date: '2026-09-25T15:30:00Z',
    min_os_version: 'Android 8.0 (API 26)',
    target_sdk: 34,
    download_url: '/downloads/tienganhcodung-latest.apk',
    file_size_mb: 12.6,
    sha256: 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
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
