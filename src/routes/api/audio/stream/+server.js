import { json } from '@sveltejs/kit';
import fs from 'node:fs';
import audioManifest from '../../../../lib/data/audio_manifest.json' with { type: 'json' };

export const prerender = false;

export async function GET({ url, request }) {
  const trackId = url.searchParams.get('id');
  const infoOnly = url.searchParams.get('info') === '1' || request.headers.get('accept')?.includes('application/json');

  if (!trackId) {
    return json({ success: false, error: 'Thiếu tham số track id (?id=...)' }, { status: 400 });
  }

  const track = audioManifest.tracks.find(t => t.id === trackId);
  if (!track) {
    return json({ success: false, error: `Không tìm thấy file audio với id: ${trackId}` }, { status: 404 });
  }

  // Return track provenance metadata if requested
  if (infoOnly) {
    return json({
      success: true,
      track
    });
  }

  // Check physical availability of original source audio file
  // STRICT RULE: No synthetic audio generation. If file is not yet downloaded from Drive, report pending.
  const filePath = track.file_path;
  const isPlayable = track.status?.playable && filePath && fs.existsSync(filePath);

  if (!isPlayable) {
    return json({
      success: false,
      status: 'source_pending_download',
      error: 'Tệp audio gốc từ kho Google Drive (2.254 tracks) chưa được đồng bộ về máy chủ.',
      track_id: track.id,
      title: track.title,
      drive_path: track.drive_path,
      transcript: track.transcript
    }, { status: 503 });
  }

  // If physical file exists on disk, stream real audio bytes with HTTP 206 Range support
  try {
    const stats = fs.statSync(filePath);
    const totalSize = stats.size;
    const rangeHeader = request.headers.get('range');

    if (rangeHeader && rangeHeader.startsWith('bytes=')) {
      const parts = rangeHeader.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;

      if (isNaN(start) || start >= totalSize || (parts[1] && end < start)) {
        return new Response('Requested Range Not Satisfiable', {
          status: 416,
          headers: {
            'Content-Range': `bytes */${totalSize}`
          }
        });
      }

      const effectiveEnd = Math.min(end, totalSize - 1);
      const chunkLength = effectiveEnd - start + 1;
      const fileBuffer = fs.readFileSync(filePath);
      const chunk = fileBuffer.subarray(start, effectiveEnd + 1);

      return new Response(chunk, {
        status: 206,
        headers: {
          'Content-Type': 'audio/mpeg',
          'Content-Range': `bytes ${start}-${effectiveEnd}/${totalSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': String(chunkLength),
          'Cache-Control': 'public, max-age=86400',
          'X-Audio-Track-Id': track.id,
          'X-Audio-Duration': String(track.duration_seconds)
        }
      });
    }

    const fullBuffer = fs.readFileSync(filePath);
    return new Response(fullBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(totalSize),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=86400',
        'X-Audio-Track-Id': track.id,
        'X-Audio-Duration': String(track.duration_seconds)
      }
    });
  } catch (err) {
    return json({ success: false, error: `Lỗi đọc file âm thanh: ${err.message}` }, { status: 500 });
  }
}
