/**
 * Safe client/server helper to parse user metadata and detect must_change_password flag
 */
export function parseUserMetadata(rawMetadata) {
  if (!rawMetadata) return {};
  if (typeof rawMetadata === 'object' && !Array.isArray(rawMetadata)) {
    return rawMetadata;
  }
  if (typeof rawMetadata === 'string') {
    try {
      const parsed = JSON.parse(rawMetadata);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {}
  }
  return {};
}

export function shouldForcePasswordChange(user) {
  if (!user) return false;
  const meta = parseUserMetadata(user.metadata);
  return Boolean(meta && meta.must_change_password === true);
}
