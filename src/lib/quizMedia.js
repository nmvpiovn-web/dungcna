/**
 * Shared media & image security helpers for Quiz module.
 * Protects student privacy by restricting images to approved CDNs and local endpoints.
 */

export const ALLOWED_IMAGE_HOSTS = new Set([
  'drive.google.com',
  'docs.google.com',
  'lh3.googleusercontent.com',
  'lh4.googleusercontent.com',
  'lh5.googleusercontent.com',
  'lh6.googleusercontent.com',
  'timbk.io.vn',
  'upload.wikimedia.org',
  'commons.wikimedia.org',
  'images.unsplash.com',
  'cdn.pixabay.com'
]);

export function isAllowedImageUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return false;
  const trimmed = urlStr.trim();
  if (!trimmed) return false;

  // Disallow control characters
  if (/[\x00-\x1F\x7F]/.test(trimmed)) return false;

  // Disallow raw or percent-encoded backslashes
  if (trimmed.includes('\\') || /%5c/i.test(trimmed)) return false;

  // Handle local relative paths safely
  if (trimmed.startsWith('/')) {
    // Disallow protocol-relative URLs (//) or malformed leading characters (/\)
    if (trimmed.startsWith('//') || trimmed.startsWith('/\\')) return false;
    try {
      const u = new URL(trimmed, 'https://dummy.local');
      if (u.origin !== 'https://dummy.local') return false;
      const pathname = u.pathname;
      // Allow exact quiz asset proxy: /api/quiz-menu/{id}/assets/{assetId}
      if (/^\/api\/quiz-menu\/[a-zA-Z0-9_-]+\/assets\/[a-zA-Z0-9_-]+$/i.test(pathname)) {
        return true;
      }
      // Allow drive file proxy
      if (/^\/api\/drive\/files\/[a-zA-Z0-9_-]+(\.[a-zA-Z0-9]+)?$/i.test(pathname)) {
        return true;
      }
      // Allow known static assets with image extensions
      if (/^\/(static\/)?(images|icons|fonts|pwa-)/i.test(pathname) || /^\/favicon\./i.test(pathname)) {
        if (/\.(jpe?g|png|webp|gif|svg|ico)$/i.test(pathname)) {
          return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  // Handle absolute HTTPS URLs against allowlist
  try {
    const u = new URL(trimmed);
    if (u.protocol !== 'https:') return false;
    const hostname = u.hostname.toLowerCase();
    if (ALLOWED_IMAGE_HOSTS.has(hostname)) return true;
    for (const h of ALLOWED_IMAGE_HOSTS) {
      if (hostname.endsWith('.' + h)) return true;
    }
    return false;
  } catch {
    return false;
  }
}
