import { json } from '@sveltejs/kit';
import audioCatalog from '../../../../lib/data/audio_catalog.json' with { type: 'json' };

export const prerender = false;

// Generate a valid, compact MP3 binary buffer (MPEG-1 Layer 3 silence frames)
function generateSyntheticMp3Buffer(durationSeconds = 60) {
  // MPEG-1 Layer 3 frame: 128 kbps, 44.1 kHz, stereo, no padding
  // Header: 0xFF 0xFB 0x90 0x64
  // Frame length = Math.floor(144 * 128000 / 44100) = 417 bytes
  const FRAME_LEN = 417;
  const FRAMES_PER_SEC = Math.round(44100 / 1152); // ~38.28 frames per second
  const totalFrames = Math.max(10, Math.min(100, Math.round(durationSeconds * 2))); // keep lightweight
  const totalBytes = totalFrames * FRAME_LEN;
  const buffer = new Uint8Array(totalBytes);

  for (let f = 0; f < totalFrames; f++) {
    const offset = f * FRAME_LEN;
    buffer[offset] = 0xFF;     // Sync byte 1
    buffer[offset + 1] = 0xFB; // Sync byte 2 (MPEG-1, Layer 3, no CRC)
    buffer[offset + 2] = 0x90; // Bitrate: 128 kbps (1001), 44.1kHz (00), padding 0, private 0
    buffer[offset + 3] = 0x64; // Channel: stereo (01), mode ext (10), copyright 0, original 1, emphasis 00
    // Remaining bytes in frame are 0 (silent audio payload)
  }

  return buffer;
}

export async function GET({ url, request }) {
  const trackId = url.searchParams.get('id');
  const infoOnly = url.searchParams.get('info') === '1' || request.headers.get('accept')?.includes('application/json');

  if (!trackId) {
    return json({ success: false, error: 'Thiếu tham số track id (?id=...)' }, { status: 400 });
  }

  const track = audioCatalog.find(t => t.id === trackId);
  if (!track) {
    return json({ success: false, error: `Không tìm thấy file audio với id: ${trackId}` }, { status: 404 });
  }

  // Return JSON metadata if requested
  if (infoOnly) {
    return json({
      success: true,
      track
    });
  }

  // Prepare binary audio stream with HTTP 206 Partial Content / Range support
  const fullBuffer = generateSyntheticMp3Buffer(track.duration_seconds || 120);
  const totalSize = fullBuffer.byteLength;
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
    const chunk = fullBuffer.slice(start, effectiveEnd + 1);

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

  // Full audio stream (200 OK)
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
