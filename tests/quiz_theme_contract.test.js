import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const FORBIDDEN_DARK_BLUE_TOKENS = [
  '#17283d',
  '#075985',
  '#0f172a',
  '#132238',
  '#0b132b',
  '#172554',
  '#0c1a2b',
  '#155e75',
  '#164e63',
  '#083344',
  '#1e293b',
  '#334155',
  '#475569',
  '#64748b',
  '#0c4a6e',
  'slate-950',
  'bg-slate-900',
  'text-slate-900',
  'bg-blue-900',
  'text-blue-900',
  'bg-blue-100 text-blue-700',
  '15 23 42',
  '12 26 43'
];

const SHELL_FILES = [
  'src/app.css',
  'src/routes/+layout.svelte',
  'src/lib/components/EducationNavigation.svelte',
  'src/lib/components/ui/BottomNav.svelte',
  'src/lib/components/ThemeStudio.svelte',
  'src/lib/components/ThemeStudioPanel.svelte',
  'src/lib/components/PersonalThemeModal.svelte',
  'src/routes/quiz-menu/+page.svelte',
  'src/lib/components/QuizCameraCapture.svelte',
  'src/lib/components/QuizReviewPanel.svelte',
  'src/lib/components/QuizChildResults.svelte'
];

const DARK_NAVY_REGEX = /(?:#0f172a|#1e293b|#334155|#475569|#64748b|#17283d|#075985|#0c4a6e|#155e75|#164e63|#083344|#172554|#0b132b|#0c1a2b)\b/i;

function hexToLuminance(hex) {
  const rgb = hex.replace('#', '').match(/.{2}/g).map((x) => parseInt(x, 16) / 255).map((c) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

function contrastRatio(hex1, hex2) {
  const l1 = hexToLuminance(hex1);
  const l2 = hexToLuminance(hex2);
  const max = Math.max(l1, l2);
  const min = Math.min(l1, l2);
  return (max + 0.05) / (min + 0.05);
}

describe('QUIZ THEME & RESPONSIVE CONTRACT SUITE', () => {
  const quizPagePath = 'src/routes/quiz-menu/+page.svelte';
  const quizPageContent = fs.readFileSync(quizPagePath, 'utf8');
  const appCssContent = fs.readFileSync('src/app.css', 'utf8');

  test('THEME-01: Full shell scan - zero occurrences of navy/dark blue in all 11 shell files', () => {
    for (const filePath of SHELL_FILES) {
      if (!fs.existsSync(filePath)) continue;
      const content = fs.readFileSync(filePath, 'utf8');
      for (const token of FORBIDDEN_DARK_BLUE_TOKENS) {
        assert.strictEqual(
          content.includes(token),
          false,
          `Found forbidden dark blue token "${token}" in ${filePath}`
        );
      }
      assert.strictEqual(
        DARK_NAVY_REGEX.test(content),
        false,
        `Regex matched dark navy/slate pattern in ${filePath}`
      );
    }
  });

  test('THEME-02: Global CSS tokens use warm ivory and neutral stone near-black', () => {
    assert.match(appCssContent, /--text-main:\s*#1c1917/, 'Global --text-main must be stone-900 #1c1917');
    assert.match(appCssContent, /--bg-page:\s*#fdfbf7/, 'Global --bg-page must be warm ivory #fdfbf7');
    assert.match(appCssContent, /--ink-900:\s*#1c1917/, 'Global --ink-900 must be #1c1917');
    assert.match(appCssContent, /--c-800:\s*#292524/, 'Global --c-800 must be warm stone #292524');
    assert.match(appCssContent, /--c-900:\s*#1c1917/, 'Global --c-900 must be near-black #1c1917');
    assert.match(appCssContent, /--c-950:\s*#0c0a09/, 'Global --c-950 must be deepest stone #0c0a09');
  });

  test('THEME-03: Tag grade uses emerald/jade palette, not blue', () => {
    // Must NOT have old blue tokens in .tag.grade
    assert.strictEqual(quizPageContent.includes('#eff6ff'), false, 'Tag grade must not use #eff6ff blue');
    assert.strictEqual(quizPageContent.includes('#1d4ed8'), false, 'Tag grade must not use #1d4ed8 blue');
    assert.strictEqual(quizPageContent.includes('#bfdbfe'), false, 'Tag grade must not use #bfdbfe blue');

    // Must use emerald palette
    assert.match(
      quizPageContent,
      /\.tag\.grade\{[^}]*background:\s*#ecfdf5;[^}]*color:\s*#047857;[^}]*border:\s*1px solid #a7f3d0\}/,
      'Tag grade must use emerald palette (#ecfdf5 / #047857 / #a7f3d0)'
    );
  });

  test('THEME-04: WCAG AA contrast compliance for text, tags, and buttons', () => {
    // 1. Body text on warm ivory background
    const bodyContrast = contrastRatio('#1c1917', '#fdfbf7');
    assert.ok(bodyContrast >= 4.5, `Body text contrast ${bodyContrast.toFixed(2)} must satisfy WCAG AA >= 4.5`);

    // 2. Tag grade text on light emerald badge background
    const tagContrast = contrastRatio('#047857', '#ecfdf5');
    assert.ok(tagContrast >= 4.5, `Tag text contrast ${tagContrast.toFixed(2)} must satisfy WCAG AA >= 4.5`);

    // 3. Primary button text (bold) on emerald background
    const primaryButtonContrast = contrastRatio('#ffffff', '#059669');
    assert.ok(primaryButtonContrast >= 3.0, `Primary button contrast ${primaryButtonContrast.toFixed(2)} must satisfy WCAG AA >= 3.0`);

    // 4. Accent button text (bold) on coral background
    const accentButtonContrast = contrastRatio('#ffffff', '#ea580c');
    assert.ok(accentButtonContrast >= 3.0, `Accent button contrast ${accentButtonContrast.toFixed(2)} must satisfy WCAG AA >= 3.0`);
  });

  test('THEME-05: Question Bank D1 panel, pagination, touch targets, and a11y', () => {
    assert.match(quizPageContent, /Kho câu hỏi D1/, 'Must contain "Kho câu hỏi D1"');
    assert.match(quizPageContent, /bank-panel/, 'Must contain bank-panel');
    assert.match(quizPageContent, /bank-pagination/, 'Must contain bank-pagination');
    assert.match(quizPageContent, /Trang trước/, 'Must contain previous page button');
    assert.match(quizPageContent, /Trang sau/, 'Must contain next page button');
    assert.match(quizPageContent, /min-height:\s*44px/, 'Must enforce >= 44px min-height touch targets');

    // Accessible cards: semantic label without nested button role
    assert.match(quizPageContent, /<label class="bank-q-card"/, 'bank-q-card must be semantic label');
    assert.strictEqual(quizPageContent.includes('<div class="bank-q-card" role="button"'), false, 'Must not use div role="button"');
    assert.match(quizPageContent, /\.bank-q-card:focus-within/, 'Must style :focus-within on bank card');
    assert.match(quizPageContent, /\.q-checkbox:focus-visible/, 'Must style :focus-visible on checkbox');
    assert.match(quizPageContent, /aria-label=\{`Chọn câu hỏi #/, 'Must provide descriptive aria-label on checkbox');
    assert.match(quizPageContent, /on:keydown=\{.*?Enter.*?toggleBankQuestion/, 'Checkbox must handle Enter key');
    assert.match(quizPageContent, /on:change=\{.*?toggleBankQuestion/, 'Checkbox must handle change event (triggered by Space and click)');
    assert.match(quizPageContent, /aria-live="polite"/, 'Must contain aria-live region for announcements');
  });

  test('THEME-06: Responsive layout contracts for 320px, 360px, 560px and 800px', () => {
    assert.match(quizPageContent, /@media\(max-width:800px\)/, 'Must have 800px breakpoint');
    assert.match(quizPageContent, /@media\(max-width:560px\)/, 'Must have 560px breakpoint');
    assert.match(quizPageContent, /@media\(max-width:390px\)/, 'Must have 390px breakpoint covering 320/360px');
  });
});
