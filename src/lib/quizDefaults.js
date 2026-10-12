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

/**
 * Canonical default question type mix:
 * 5 Multiple Choice + 2 True/False + 2 Fill Blank + 1 Matching = 10 questions total.
 */
export const CANONICAL_DEFAULT_TYPE_MIX = Object.freeze({
  multiple_choice: 5,
  true_false: 2,
  fill_blank: 2,
  matching: 1
});

/**
 * Returns a fresh copy of the canonical default question type mix.
 */
export function getCanonicalDefaultTypeMix() {
  return { ...CANONICAL_DEFAULT_TYPE_MIX };
}

/**
 * Resolves type mix from D1/API or falls back to canonical default mix.
 * Preserves user's saved type mix exactly if valid object with at least one key.
 * If raw is null/undefined/empty/corrupted JSON, falls back to canonical 5/2/2/1 mix.
 */
export function resolveDefaultTypeMix(raw) {
  if (!raw) return getCanonicalDefaultTypeMix();
  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return getCanonicalDefaultTypeMix();
    }
  }
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Object.keys(parsed).length > 0) {
    return parsed;
  }
  return getCanonicalDefaultTypeMix();
}
