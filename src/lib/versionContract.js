/**
 * Version and Update Contract Module (Phase 5 - Round 2 Hardened)
 * Standardizes compile-time client build identity, semantic versioning,
 * server build metadata comparison, strict canonical APK URL validation,
 * and SHA-256 verified Blob download.
 */

const DETERMINISTIC_FALLBACK_BUILD_META = Object.freeze({
  version: '2.2.0',
  build_identity: 'build_bfad941_1791543919489',
  build_timestamp: '2026-10-09T11:05:19.489Z',
  source_commit: 'bfad941fffa2d7cd038d128c3b3171fe1015a2a6'
});

/**
 * Returns the compile-time client build identity embedded into the bundle by Vite define.
 * Never reads /build_meta.json from the server to represent the current client version.
 */
export function getClientBuildIdentity(overrideMeta = null) {
  if (overrideMeta && typeof overrideMeta === 'object') {
    return {
      version: String(overrideMeta.version || DETERMINISTIC_FALLBACK_BUILD_META.version),
      build_identity: String(overrideMeta.build_identity || DETERMINISTIC_FALLBACK_BUILD_META.build_identity),
      build_timestamp: String(overrideMeta.build_timestamp || DETERMINISTIC_FALLBACK_BUILD_META.build_timestamp),
      source_commit: String(overrideMeta.source_commit || DETERMINISTIC_FALLBACK_BUILD_META.source_commit)
    };
  }

  // eslint-disable-next-line no-undef
  const compiled = typeof __CLIENT_BUILD_META__ !== 'undefined' ? __CLIENT_BUILD_META__ : null;
  if (compiled && typeof compiled === 'object') {
    return {
      version: String(compiled.version || DETERMINISTIC_FALLBACK_BUILD_META.version),
      build_identity: String(compiled.build_identity || DETERMINISTIC_FALLBACK_BUILD_META.build_identity),
      build_timestamp: String(compiled.build_timestamp || DETERMINISTIC_FALLBACK_BUILD_META.build_timestamp),
      source_commit: String(compiled.source_commit || DETERMINISTIC_FALLBACK_BUILD_META.source_commit)
    };
  }

  return { ...DETERMINISTIC_FALLBACK_BUILD_META };
}

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

/**
 * Compares server PWA build metadata (/build_meta.json) against compile-time client build identity.
 * Keeps PWA build identity distinct from Android APK version_code.
 */
export function isNewerBuildIdentity(serverBuildMeta, clientBuildMeta = getClientBuildIdentity()) {
  if (!serverBuildMeta || typeof serverBuildMeta !== 'object') return false;
  const client = clientBuildMeta && typeof clientBuildMeta === 'object'
    ? clientBuildMeta
    : getClientBuildIdentity();

  const sVer = String(serverBuildMeta.version || '');
  const cVer = String(client.version || '');

  if (sVer && cVer) {
    const semCmp = compareSemver(sVer, cVer);
    if (semCmp > 0) return true;
    if (semCmp < 0) return false;
  }

  // If both have exact matching non-empty build_identity, they are the exact same build
  if (serverBuildMeta.build_identity && client.build_identity) {
    if (serverBuildMeta.build_identity === client.build_identity) {
      return false;
    }
  }

  // Compare build_timestamp when available
  if (serverBuildMeta.build_timestamp && client.build_timestamp) {
    const sTime = new Date(serverBuildMeta.build_timestamp).getTime();
    const cTime = new Date(client.build_timestamp).getTime();
    if (!Number.isNaN(sTime) && !Number.isNaN(cTime)) {
      if (sTime > cTime) return true;
      if (sTime < cTime) return false;
    }
  }

  // If timestamps are equal/missing but build_identity explicitly changed
  if (
    serverBuildMeta.build_identity &&
    client.build_identity &&
    serverBuildMeta.build_identity !== client.build_identity
  ) {
    return true;
  }

  return false;
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

  // 4. Fallback to build_identity difference when timestamps are not older
  if (
    serverMeta.build_identity &&
    currentMeta &&
    typeof currentMeta === 'object' &&
    currentMeta.build_identity &&
    serverMeta.build_identity !== currentMeta.build_identity
  ) {
    return true;
  }

  return false;
}

export function isValidSha256(hash) {
  if (!hash || typeof hash !== 'string') return false;
  return /^[a-f0-9]{64}$/i.test(hash.trim());
}

/**
 * Canonicalizes and validates an APK download URL against currentOrigin and optional trusted allowlist.
 * Rejects backslashes, control characters, protocol-relative URLs, userinfo, hashes, non-.apk paths,
 * and cross-origin URLs not in the trusted allowlist.
 */
export function canonicalizeApkDownloadUrl(urlStr, currentOrigin = '', allowedOrigins = []) {
  if (!urlStr || typeof urlStr !== 'string') return null;

  // Reject control characters or leading/trailing/internal raw backslashes before trimming
  if (/[\x00-\x20\x7f\\]/.test(urlStr)) {
    return null;
  }

  const trimmed = urlStr.trim();
  if (!trimmed) return null;

  // Reject protocol-relative URLs (e.g. //evil.example/app.apk)
  if (trimmed.startsWith('//')) {
    return null;
  }

  // Resolve currentOrigin
  const effectiveOrigin =
    currentOrigin ||
    (typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'https://timbk.io.vn');

  let baseOriginUrl;
  try {
    baseOriginUrl = new URL(effectiveOrigin);
  } catch {
    return null;
  }

  let parsed;
  try {
    parsed = new URL(trimmed, baseOriginUrl.origin);
  } catch {
    return null;
  }

  // Reject userinfo (username/password) and fragment hashes
  if (parsed.username || parsed.password || parsed.hash) {
    return null;
  }

  // Enforce protocol: https: required except http: on localhost / 127.0.0.1
  const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLocalhost)) {
    return null;
  }

  // Enforce exact same-origin by default or explicit trusted allowlist
  const trustedOrigins = new Set([baseOriginUrl.origin]);
  if (Array.isArray(allowedOrigins)) {
    for (const orig of allowedOrigins) {
      try {
        trustedOrigins.add(new URL(orig).origin);
      } catch {}
    }
  }

  if (!trustedOrigins.has(parsed.origin)) {
    return null;
  }

  // Reject path traversal segments or encoded backslashes in pathname
  const decodedPath = decodeURIComponent(parsed.pathname);
  if (decodedPath.includes('\\') || decodedPath.includes('..') || !parsed.pathname.toLowerCase().endsWith('.apk')) {
    return null;
  }

  return parsed.toString();
}

export function isValidApkDownloadUrl(urlStr, currentOrigin = '', allowedOrigins = []) {
  return canonicalizeApkDownloadUrl(urlStr, currentOrigin, allowedOrigins) !== null;
}

export async function computeArrayBufferSha256(arrayBuffer) {
  const digest = await crypto.subtle.digest('SHA-256', arrayBuffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Downloads an APK via fetch, verifies byte size and SHA-256 digest via WebCrypto,
 * and returns a verified Blob + Object URL (or fails closed without creating an Object URL).
 */
export async function downloadAndVerifyApk({
  downloadUrl,
  expectedSha256,
  expectedBytes = null,
  currentOrigin = '',
  allowedOrigins = [],
  fetchFn = globalThis.fetch,
  urlApi = globalThis.URL,
  onProgress = null
} = {}) {
  if (!isValidSha256(expectedSha256)) {
    return { success: false, error: 'Mã kiểm tra SHA-256 không hợp lệ.' };
  }

  const canonicalUrl = canonicalizeApkDownloadUrl(downloadUrl, currentOrigin, allowedOrigins);
  if (!canonicalUrl) {
    return { success: false, error: 'Đường dẫn tải APK không hợp lệ hoặc không cùng nguồn tin cậy.' };
  }

  try {
    if (typeof onProgress === 'function') onProgress({ phase: 'downloading', percent: 10 });
    const res = await fetchFn(canonicalUrl, { cache: 'no-store' });
    if (!res.ok) {
      return { success: false, error: `Không thể tải tệp APK (HTTP ${res.status}).` };
    }

    const arrayBuffer = await res.arrayBuffer();
    if (typeof onProgress === 'function') onProgress({ phase: 'verifying', percent: 80 });

    if (
      typeof expectedBytes === 'number' &&
      expectedBytes > 0 &&
      arrayBuffer.byteLength !== expectedBytes
    ) {
      return {
        success: false,
        error: `Kích thước tệp APK không khớp (${arrayBuffer.byteLength} bytes != ${expectedBytes} bytes).`
      };
    }

    const actualSha256 = await computeArrayBufferSha256(arrayBuffer);
    const targetSha256 = expectedSha256.trim().toLowerCase();

    if (actualSha256 !== targetSha256) {
      return {
        success: false,
        error: 'Cảnh báo bảo mật: Mã băm SHA-256 của tệp tải về không khớp với manifest gốc!',
        actualSha256,
        expectedSha256: targetSha256
      };
    }

    const blob = new Blob([arrayBuffer], { type: 'application/vnd.android.package-archive' });
    const objectUrl = typeof urlApi?.createObjectURL === 'function' ? urlApi.createObjectURL(blob) : '';
    const revoke = () => {
      if (objectUrl && typeof urlApi?.revokeObjectURL === 'function') {
        try {
          urlApi.revokeObjectURL(objectUrl);
        } catch {}
      }
    };

    if (typeof onProgress === 'function') onProgress({ phase: 'verified', percent: 100 });

    return {
      success: true,
      canonicalUrl,
      sha256: actualSha256,
      byteLength: arrayBuffer.byteLength,
      blob,
      objectUrl,
      revoke
    };
  } catch (err) {
    return {
      success: false,
      error: err?.message || 'Lỗi mạng khi tải và xác minh tệp APK.'
    };
  }
}

export async function fetchServerApkVersion(fetchFn = globalThis.fetch) {
  try {
    const res = await fetchFn(`/api/apk/version?_cb=${Date.now()}`, {
      headers: { Accept: 'application/json' },
      cache: 'no-cache'
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
