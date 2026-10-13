/**
 * Version and Update Contract Module (Phase 5)
 * Standardizes semantic versioning, build metadata comparison,
 * SHA-256 integrity checks, and secure APK download URL verification.
 */

export function parseSemver(vStr) {
  if (!vStr || typeof vStr !== 'string') {
    return { valid: false, major: 0, minor: 0, patch: 0, raw: '' };
  }
  const clean = vStr.trim().replace(/^v/i, '');
  const match = clean.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?/);
  if (!match) {
    return { valid: false, major: 0, minor: 0, patch: 0, raw: vStr };
  }
  return {
    valid: true,
    major: parseInt(match[1] || '0', 10),
    minor: parseInt(match[2] || '0', 10),
    patch: parseInt(match[3] || '0', 10),
    prerelease: match[4] || null,
    raw: vStr
  };
}

export function compareSemver(vA, vB) {
  const pA = parseSemver(vA);
  const pB = parseSemver(vB);

  if (!pA.valid && !pB.valid) return 0;
  if (!pA.valid) return -1;
  if (!pB.valid) return 1;

  if (pA.major !== pB.major) return pA.major > pB.major ? 1 : -1;
  if (pA.minor !== pB.minor) return pA.minor > pB.minor ? 1 : -1;
  if (pA.patch !== pB.patch) return pA.patch > pB.patch ? 1 : -1;

  // Prerelease handling: release > prerelease
  if (pA.prerelease && !pB.prerelease) return -1;
  if (!pA.prerelease && pB.prerelease) return 1;

  return 0;
}

export function isNewerVersion(serverMeta, currentMeta) {
  if (!serverMeta) return false;

  // Normalize server meta
  const sCode = typeof serverMeta.version_code === 'number' ? serverMeta.version_code : parseInt(serverMeta.version_code, 10);
  const sVer = serverMeta.version_name || serverMeta.version || '';

  // Normalize current meta
  let cCode = null;
  let cVer = '';
  if (typeof currentMeta === 'string') {
    cVer = currentMeta;
  } else if (currentMeta && typeof currentMeta === 'object') {
    cCode = typeof currentMeta.version_code === 'number' ? currentMeta.version_code : parseInt(currentMeta.version_code, 10);
    cVer = currentMeta.version_name || currentMeta.version || '';
  }

  // 1. If both have valid numeric version_code, compare version_code first
  if (!Number.isNaN(sCode) && sCode !== null && !Number.isNaN(cCode) && cCode !== null) {
    if (sCode > cCode) return true;
    if (sCode < cCode) return false;
  }

  // 2. Compare semantic version strings
  if (sVer && cVer) {
    const semCmp = compareSemver(sVer, cVer);
    if (semCmp > 0) return true;
    if (semCmp < 0) return false;
  }

  // 3. Fallback to build_timestamp if versions are identical
  if (serverMeta.build_timestamp && currentMeta && typeof currentMeta === 'object' && currentMeta.build_timestamp) {
    const sTime = new Date(serverMeta.build_timestamp).getTime();
    const cTime = new Date(currentMeta.build_timestamp).getTime();
    if (!Number.isNaN(sTime) && !Number.isNaN(cTime) && sTime > cTime) {
      return true;
    }
  }

  return false;
}

export function isValidSha256(hash) {
  if (!hash || typeof hash !== 'string') return false;
  return /^[a-f0-9]{64}$/i.test(hash.trim());
}

export function isValidApkDownloadUrl(urlStr, currentOrigin = '') {
  if (!urlStr || typeof urlStr !== 'string') return false;
  const trimmed = urlStr.trim();

  // Reject protocol-relative URLs
  if (trimmed.startsWith('//')) {
    return false;
  }

  // Relative path: must start with single /
  if (trimmed.startsWith('/')) {
    return true;
  }

  // Absolute URL: must explicitly have https:// or http:// (localhost only)
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:') return true;
    if (parsed.protocol === 'http:' && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function fetchServerApkVersion(fetchFn = globalThis.fetch) {
  try {
    const res = await fetchFn(`/api/apk/version?_cb=${Date.now()}`, {
      headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
      cache: 'no-store'
    });
    if (!res.ok) return { success: false, error: `HTTP ${res.status}` };
    const data = await res.json();
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message || 'NetworkError' };
  }
}

export async function fetchServerBuildMeta(fetchFn = globalThis.fetch) {
  try {
    const res = await fetchFn(`/build_meta.json?_cb=${Date.now()}`, {
      headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
      cache: 'no-store'
    });
    if (!res.ok) return { success: false, error: `HTTP ${res.status}` };
    const data = await res.json();
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message || 'NetworkError' };
  }
}
