function readEnv(platform, name) {
  return platform?.env?.[name] || (typeof process !== 'undefined' ? process.env?.[name] : null);
}

function constantTimeEqual(left, right) {
  const a = new TextEncoder().encode(String(left || ''));
  const b = new TextEncoder().encode(String(right || ''));
  let diff = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) diff |= (a[index] || 0) ^ (b[index] || 0);
  return diff === 0;
}

export function verifyServiceSecret(request, platform, envName, extraHeader = 'x-webhook-secret') {
  const expected = readEnv(platform, envName);
  if (!expected || typeof expected !== 'string' || !expected.trim()) {
    return { ok: false, status: 503, error: `ServiceUnavailable: ${envName} chưa được cấu hình.` };
  }
  const authorization = request.headers.get('authorization') || '';
  const authorizationMatch = authorization.match(/^(?:Bearer|Apikey)\s+(.+)$/i);
  const supplied = authorizationMatch?.[1]?.trim() || request.headers.get(extraHeader) || '';
  if (!supplied || !constantTimeEqual(supplied, expected.trim())) {
    return { ok: false, status: 401, error: 'Unauthorized: Chữ ký dịch vụ không hợp lệ.' };
  }
  return { ok: true, status: 200 };
}
