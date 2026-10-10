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
  'bg-slate-900',
  'bg-blue-900'
];

describe('QUIZ THEME & RESPONSIVE CONTRACT SUITE', () => {
  const quizPagePath = 'src/routes/quiz-menu/+page.svelte';
  const quizPageContent = fs.readFileSync(quizPagePath, 'utf8');

  test('THEME-01: /quiz-menu has zero occurrences of navy/dark blue tokens', () => {
    for (const token of FORBIDDEN_DARK_BLUE_TOKENS) {
      assert.strictEqual(
        quizPageContent.includes(token),
        false,
        `Found forbidden dark blue token "${token}" in ${quizPagePath}`
      );
    }
  });

  test('THEME-02: Quiz components have zero occurrences of navy/dark blue tokens', () => {
    const componentPaths = [
      'src/lib/components/QuizCameraCapture.svelte',
      'src/lib/components/QuizReviewPanel.svelte',
      'src/lib/components/QuizChildResults.svelte'
    ];

    for (const p of componentPaths) {
      if (!fs.existsSync(p)) continue;
      const content = fs.readFileSync(p, 'utf8');
      for (const token of FORBIDDEN_DARK_BLUE_TOKENS) {
        assert.strictEqual(
          content.includes(token),
          false,
          `Found forbidden dark blue token "${token}" in ${p}`
        );
      }
    }
  });

  test('THEME-03: Warm ivory base, emerald primary, and coral/amber CTA palette configured', () => {
    // 1. Warm ivory background
    assert.match(quizPageContent, /background:\s*#fdfbf7/, 'Body must use warm ivory background #fdfbf7');
    // 2. High contrast neutral near-black text
    assert.match(quizPageContent, /color:\s*#1c1917/, 'Neutral near-black text #1c1917 must be used');
    // 3. Primary emerald / jade palette
    assert.match(quizPageContent, /#059669/, 'Primary emerald #059669 must be used');
    // 4. Accent coral/amber CTA
    assert.match(quizPageContent, /#ea580c/, 'Coral/amber CTA #ea580c must be used');
    // 5. Lavender accent
    assert.match(quizPageContent, /#8b5cf6|#f5f3ff|#ddd6fe/, 'Lavender secondary palette must be used');
  });

  test('THEME-04: Save bar and submit panel use light card backgrounds (no dark blue)', () => {
    // Check save bar is white/light with dark text
    assert.match(
      quizPageContent,
      /\.save-bar\{[^}]*background:\s*#ffffff;[^}]*color:\s*#1c1917/,
      'Save bar must have white background and neutral dark text'
    );

    // Check submit panel is light with neutral dark text
    assert.match(
      quizPageContent,
      /\.submit-panel\{[^}]*background:\s*#ffffff;[^}]*color:\s*#1c1917/,
      'Submit panel must have white background and neutral dark text'
    );
  });

  test('THEME-05: Question Bank D1 source button and panel rendered with full facets and filters', () => {
    assert.match(quizPageContent, /Kho câu hỏi D1/, 'Must contain "Kho câu hỏi D1" source option');
    assert.match(quizPageContent, /bank-panel/, 'Must contain bank-panel container');
    assert.match(quizPageContent, /Khối lớp/, 'Must include Grade level filter');
    assert.match(quizPageContent, /Kỹ năng/, 'Must include Skill category filter');
    assert.match(quizPageContent, /Mức nhận thức/, 'Must include Cognitive level filter');
    assert.match(quizPageContent, /Tìm kiếm câu hỏi/, 'Must include search question filter');
    assert.match(quizPageContent, /Nhập nhanh:/, 'Must include quick import controls');
  });

  test('THEME-06: Responsive layout contracts for 320px, 360px, 560px and 800px', () => {
    assert.match(quizPageContent, /@media\(max-width:800px\)/, 'Must have 800px breakpoint');
    assert.match(quizPageContent, /@media\(max-width:560px\)/, 'Must have 560px breakpoint');
    assert.match(quizPageContent, /@media\(max-width:390px\)/, 'Must have 390px breakpoint covering 320/360px mobile viewports');
  });
});
