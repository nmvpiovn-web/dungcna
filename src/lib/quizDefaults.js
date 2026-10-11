/**
 * Resolves default grade level for quiz builder UI and endpoints.
 * Preserves 0 (Tổng hợp / IELTS). Defaults null/undefined/empty string to 7.
 * Valid grade levels are integers 0..12.
 */
export function resolveDefaultGradeLevel(raw) {
  if (raw === undefined || raw === null || raw === '') {
    return 7;
  }
  if (typeof raw === 'number') {
    if (Number.isInteger(raw) && raw >= 0 && raw <= 12) {
      return raw;
    }
    return 7;
  }
  if (typeof raw === 'string' && /^\s*\d+\s*$/.test(raw)) {
    const num = Number(raw.trim());
    if (Number.isInteger(num) && num >= 0 && num <= 12) {
      return num;
    }
  }
  return 7;
}
