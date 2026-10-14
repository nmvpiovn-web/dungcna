import { json } from '@sveltejs/kit';
import apkManifest from '../../../../lib/apkIntegrityManifest.json' with { type: 'json' };

const MANIFEST_ETAG = `"apk-${apkManifest.version_code}-${apkManifest.sha256.slice(0, 16)}"`;

const VERSION_PAYLOAD = Object.freeze({
  app_name: apkManifest.app_name || 'Tiếng Anh Cô Dung',
  filename: apkManifest.filename || 'tienganhcodung-latest.apk',
  package_id: apkManifest.package_id || 'vn.edu.tienganhcodung.app',
  version: apkManifest.version || apkManifest.version_name || '2.2.0',
  version_name: apkManifest.version_name || '2.2.0',
  version_code: apkManifest.version_code || 220,
  release_date: apkManifest.release_date || '2026-09-25T15:30:00Z',
  min_sdk: apkManifest.min_sdk || 24,
  min_os_version: apkManifest.min_os_version || 'Android 8.0 (API 26)',
  target_sdk: apkManifest.target_sdk || 34,
  download_url: apkManifest.download_url || '/downloads/tienganhcodung-latest.apk',
  bytes: apkManifest.bytes,
  file_size_bytes: apkManifest.file_size_bytes,
  file_size_mb: apkManifest.file_size_mb,
  sha256: apkManifest.sha256,
  signing_cert_sha256: apkManifest.signing_cert_sha256,
  signing_cert_subject: apkManifest.signing_cert_subject,
  wifi_only: true,
  force_update: false,
  changelog: [
    '⚡ Đồng bộ toàn diện PWA & APK với cơ chế tự động cập nhật qua mạng nội bộ / Internet (HTTP OTA)',
    '🎮 Bổ sung 4 trò chơi tiếng Anh mới: Xây dựng câu (Sentence Builder), Bậc thầy thì (Grammar Tense Master), Lật thẻ trí nhớ 3D (Memory Flip) và Đấu thẻ bài Flashcards',
    '👨‍🏫 Tích hợp Cổng Kiểm Soát Trò Chơi (Teacher Gatekeeper): Mặc định khóa với học sinh, chỉ mở khi Giáo viên/Cô Dung bật công tắc',
    '📚 Phân tầng hiển thị khóa học chính khóa (Lớp 7 cho Bảo Khiêm), khóa 18 lớp còn lại chống xao nhãng',
    '⭐ Tối ưu hóa hệ thống tích lũy sao thưởng và khấu trừ học phí'
  ]
});

export async function GET({ request } = {}) {
  const ifNoneMatch = request?.headers?.get?.('if-none-match');
  if (ifNoneMatch && ifNoneMatch.trim() === MANIFEST_ETAG) {
    return new Response(null, {
      status: 304,
      headers: {
        ETag: MANIFEST_ETAG,
        'Cache-Control': 'public, max-age=60, must-revalidate'
      }
    });
  }

  return json(VERSION_PAYLOAD, {
    headers: {
      ETag: MANIFEST_ETAG,
      'Cache-Control': 'public, max-age=60, must-revalidate',
      'Content-Type': 'application/json'
    }
  });
}
