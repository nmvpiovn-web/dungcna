import { json } from '@sveltejs/kit';
import { verifyServerAuth } from '../../../../lib/server/auth.js';
import audioManifest from '../../../../lib/data/audio_manifest.json' with { type: 'json' };

export const prerender = false;

// Fields stripped for guests (unauthenticated): answer-key-ish content and
// internal Drive provenance.
const GUEST_STRIPPED_FIELDS = ['transcript', 'drive_file_id', 'drive_path', 'key_vocabulary', 'file_hash_sha256'];

function sanitizeTrackForGuest(track) {
  const clean = { ...track };
  for (const f of GUEST_STRIPPED_FIELDS) delete clean[f];
  return clean;
}

async function optionalAuth(request, platform) {
  if (!request.headers.get('authorization') && !request.headers.get('cookie')?.includes('session_token=')) return null;
  try {
    const auth = await verifyServerAuth(request, platform);
    return auth.authenticated ? auth : null;
  } catch { return null; }
}

export async function GET({ url, request, platform }) {
  const trackId = url.searchParams.get('id');
  const infoOnly = url.searchParams.get('info') === '1' || request.headers.get('accept')?.includes('application/json');

  if (!trackId) {
    return json({ success: false, error: 'Thiếu tham số track id (?id=...)' }, { status: 400 });
  }

  const isLocalOrTest = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || (typeof process !== 'undefined' && (process.env?.NODE_ENV === 'test' || process.env?.VITEST));
  let track = audioManifest.tracks.find(t => t.id === trackId);
  if (!track && trackId === 'test_range_fixture' && isLocalOrTest) {
    track = {
      id: 'test_range_fixture',
      title: 'Isolated Unit Test Range Fixture (Non-Release)',
      file_path: 'fixtures/audio/test_range_fixture.mp3',
      duration_seconds: 12,
      status: { playable: true, downloaded: true }
    };
  }
  if (!track) {
    return json({ success: false, error: `Không tìm thấy file audio với id: ${trackId}` }, { status: 404 });
  }

  // Return track provenance metadata if requested
  // (guests get a sanitized view: no transcript / drive_file_id)
  if (infoOnly) {
    const auth = await optionalAuth(request, platform);
    return json({
      success: true,
      track: auth ? track : sanitizeTrackForGuest(track)
    });
  }

  // 1. In Cloudflare Workers environment, serve via ASSETS binding if available
  if (platform?.env?.ASSETS && track.status?.playable && track.file_path) {
    try {
      const assetPath = '/' + track.file_path.replace(/^static\//, '');
      const assetUrl = new URL(assetPath, url);
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
      let filePath = null;
      if (rawPath) {
        if (path.isAbsolute(rawPath)) {
          filePath = rawPath;
        } else {
          const direct = path.resolve(process.cwd(), rawPath);
          const inStatic = path.resolve(process.cwd(), 'static', rawPath);
          filePath = fs.existsSync(direct) ? direct : (fs.existsSync(inStatic) ? inStatic : null);
        }
      }
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
  // (guests get a sanitized view: no transcript / drive_file_id)
  const fallbackAuth = await optionalAuth(request, platform);
  const fallbackTrack = fallbackAuth ? track : sanitizeTrackForGuest(track);
  return json({
    success: false,
    status: 'source_pending_download',
    error: 'Tệp audio gốc từ kho Google Drive (2.254 tracks) chưa được đồng bộ về máy chủ.',
    track_id: fallbackTrack.id,
    title: fallbackTrack.title,
    drive_path: fallbackTrack.drive_path,
    transcript: fallbackTrack.transcript
  }, { status: 503 });
}
