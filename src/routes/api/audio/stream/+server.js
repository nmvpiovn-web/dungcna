import { json } from '@sveltejs/kit';
import audioManifest from '../../../../lib/data/audio_manifest.json' with { type: 'json' };

export const prerender = false;

export async function GET({ url, request, platform }) {
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

  // 1. In Cloudflare Workers environment, serve via ASSETS binding if available
  if (platform?.env?.ASSETS && track.status?.playable && track.file_path) {
    try {
      const assetUrl = new URL('/' + track.file_path, url);
      const res = await platform.env.ASSETS.fetch(new Request(assetUrl, request));
      if (res && res.status !== 404) {
        return res;
      }
    } catch {}
  }

  // 2. In Node.js environment (local dev & test runner), stream via fs with full Range 206 support
  if (typeof process !== 'undefined' && process.versions?.node) {
    try {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const rawPath = track.file_path;
      const filePath = rawPath ? (path.isAbsolute(rawPath) ? rawPath : path.resolve(process.cwd(), rawPath)) : null;
      const isPlayable = track.status?.playable && filePath && fs.existsSync(filePath);

      if (isPlayable) {
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
      }
    } catch {}
  }

  // 3. Fail-closed fallback: reported as pending download if not physically synced
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
