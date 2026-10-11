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
  if (trimmed.startsWith('/')) return true;
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
