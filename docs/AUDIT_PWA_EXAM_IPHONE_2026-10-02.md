# AUDIT REPORT: PWA Exam Page Issues (iPhone 12 Pro Max)

**Date:** 2026-10-02
**Reporter:** User (via Muse)
**Device:** iPhone 12 Pro Max, PWA mode
**Page:** https://timbk.io.vn/exam/

## Issues Reported

### Issue 1: Grade/Category Selection "Missed" on iPhone
**Symptom:** When tapping grade/category pills (e.g., "Tiểu Học", "Lớp 6", "Lớp 7"), the tap is "missed" - doesn't register or selects wrong item.

**Hypothesis:**
1. Touch targets too small (py-1.5 = 6px vertical padding, below Apple's 44px minimum)
2. Horizontal scroll container (`overflow-x-auto`) interferes with tap recognition on iOS Safari
3. Missing `touch-manipulation` CSS (300ms tap delay on iOS)
4. Missing `-webkit-overflow-scrolling: touch` for smooth scroll

**Fix Applied (commit pending):**
- Increased padding: `px-3 py-1.5` → `px-4 py-2.5`
- Added `touch-manipulation` class to all category buttons
- Added `style="-webkit-overflow-scrolling: touch; touch-action: pan-x pan-y;"` to scroll container

**Needs Verification:** Test on actual iPhone 12 Pro Max PWA

---

### Issue 2: "Thi Thử Ngay" Button Not Showing in Test Cards
**Symptom:** The "Thi Thử Ngay" (Take Test Now) button added to each exam card doesn't appear on iPhone PWA.

**Root Cause Found:**
```svelte
{#if isEnrolled}
  <button>🚀 Thi Thử Ngay</button>
{/if}
```
Button only rendered when `isEnrolled=true`. For students, `isEnrolled` checks grade matching. If student's grade doesn't match exam, button hidden.

**Fix Applied:**
- Changed `{#if isEnrolled}` → `{#if true}` (always show)
- Button color indicates status: green (enrolled) vs amber (locked)
- Clicking locked exam shows the existing lock message via `handleSelectExam`

**Code Location:** `src/routes/exam/+page.svelte`, exam card grid section

---

## Architecture Notes for Codex/GPT6

### Exam Data Flow
```
JSON files (src/lib/data/exams.json, questions.json)
  → unifiedStore.js (getExams, getStaticQuestions)
  → +page.js (load function, ssr=false)
  → +page.svelte (client-side rendering)
```

**Important:** Page has `ssr=false`, so all rendering is client-side. PWA issues are purely frontend.

### Key Functions
- `isExamEnrolledForUser(user, exam)` - Grade matching logic (line ~177)
- `handleSelectExam(ex)` - Selects exam, shows lock message if not enrolled (line ~329)
- `startExam()` - Starts exam session via `/api/exams` POST `start_session` (line ~344)
- `filteredExams` - Derived store filtering by `activeExamGroup`/`activeExamCategory` (line ~598)

### Exam Groups
- `my_grade` - Student's enrolled grades
- `k12` - K12 levels (primary, g6, g7, g8, g9, highschool)
- `intl` - International (ielts, toeic, toefl)
- `periodic` - By duration (quick_5m, quick_15m, standard_45m)
- `random_builder` - Random exam generator

## Recommended Audit Focus for GPT6

1. **iOS PWA Touch Handling:**
   - Verify all interactive elements meet 44px minimum touch target
   - Check for `touch-action` conflicts in scrollable containers
   - Test `onclick` vs `onpointerup` for iOS Safari PWA

2. **Exam Card Layout (Mobile):**
   - Grid: `grid-cols-1 min-[380px]:grid-cols-2` - verify on 390px iPhone 12 Pro Max width
   - Card structure changed from `<button>` to `<div>` + nested `<button>`s - verify no nesting violations
   - "Thi Thử Ngay" button visibility and tap area

3. **State Management:**
   - `selectedExamId` initialization: `data.exams[0]?.id || 'ex_quick_15m_g7'`
   - `activeExamCategory` defaults to `'all'` - verify category pills update correctly
   - Check for race conditions in `handleSelectExam` + `setTimeout(() => startExam(), 100)`

4. **Performance (PWA):**
   - 87 exams × cards with nested buttons - check render performance on mobile
   - `filteredExams` derived recomputes on every category change - verify no lag

## Test Checklist

- [ ] Open PWA on iPhone 12 Pro Max
- [ ] Tap each grade pill (Tiểu Học, Lớp 6-9, THPT) - verify selection works
- [ ] Verify "Thi Thử Ngay" button visible on all cards
- [ ] Tap "Thi Thử Ngay" on 15p exam - verify enters exam room
- [ ] Tap "Thi Thử Ngay" on 45p exam - verify enters exam room
- [ ] Tap "Thi Thử Ngay" on locked exam (student) - verify lock message shows
- [ ] Rotate device - verify layout doesn't break
- [ ] Test with slow 3G - verify buttons remain responsive

## Files Changed
- `src/routes/exam/+page.svelte` - Exam card buttons, category pills touch targets
