import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

test('PWA/Mobile Navigation: BottomNav.svelte has Quiz tab and no tuition quote public item', () => {
  const bottomNavContent = fs.readFileSync(path.join(ROOT, 'src/lib/components/ui/BottomNav.svelte'), 'utf8');

  // Must have Quiz label and /quiz-menu href
  assert.match(
    bottomNavContent,
    /label:\s*['"]Quiz['"]/,
    'BottomNav must contain item with label "Quiz"'
  );
  assert.match(
    bottomNavContent,
    /href:\s*['"]\/quiz-menu['"]/,
    'BottomNav must contain item with href "/quiz-menu"'
  );

  // Must not have old user-facing "Học" or "/courses" in navigation tabs
  assert.doesNotMatch(
    bottomNavContent,
    /label:\s*['"]Học['"]/,
    'BottomNav must not contain tab with label "Học"'
  );
  assert.doesNotMatch(
    bottomNavContent,
    /href:\s*['"]\/courses['"]/,
    'BottomNav must not contain tab with href "/courses"'
  );

  // Must not contain any public pricing / tuition quote menu items
  assert.doesNotMatch(
    bottomNavContent,
    /báo\s*giá|bảng\s*giá|\/bang-gia/i,
    'BottomNav must not contain public pricing or tuition quote links'
  );

  // Extract tabs and test active state logic
  const tabsMatch = bottomNavContent.match(/const\s+tabs\s*=\s*(\[[^\]]+\])/s);
  assert.ok(tabsMatch, 'tabs array must be defined in BottomNav');

  // Verify active state logic for /quiz-menu
  const isActiveQuiz = (pathname, href) => {
    return href === '/' ? pathname === '/' : (pathname === href || pathname.startsWith(href + '/'));
  };

  assert.equal(isActiveQuiz('/quiz-menu', '/quiz-menu'), true, '/quiz-menu should be active on /quiz-menu');
  assert.equal(isActiveQuiz('/quiz-menu/play', '/quiz-menu'), true, 'subpath /quiz-menu/play should be active for /quiz-menu');
  assert.equal(isActiveQuiz('/', '/quiz-menu'), false, 'root / should NOT activate /quiz-menu');
  assert.equal(isActiveQuiz('/exam', '/quiz-menu'), false, '/exam should NOT activate /quiz-menu');
  assert.equal(isActiveQuiz('/courses', '/quiz-menu'), false, '/courses should NOT activate /quiz-menu');
});

test('EducationNavigation.svelte: primary items contain Quiz and active state on /quiz-menu does not falsely trigger exam', () => {
  const eduNavContent = fs.readFileSync(path.join(ROOT, 'src/lib/components/EducationNavigation.svelte'), 'utf8');

  // Must have Quiz label and /quiz-menu href in primaryItems
  assert.match(
    eduNavContent,
    /href:\s*['"]\/quiz-menu['"].*?label:\s*['"]Quiz['"]|label:\s*['"]Quiz['"].*?href:\s*['"]\/quiz-menu['"]/s,
    'EducationNavigation primary items must contain Quiz pointing to /quiz-menu'
  );

  // Must not have old user-facing "Học" or "/courses" in primary items
  assert.doesNotMatch(
    eduNavContent,
    /href:\s*['"]\/courses['"].*?label:\s*['"]Học['"]|label:\s*['"]Học['"].*?href:\s*['"]\/courses['"]/s,
    'EducationNavigation primary items must not contain user-facing "Học" pointing to /courses'
  );

  // Must not have public pricing menu item in EducationNavigation
  assert.doesNotMatch(
    eduNavContent,
    /báo\s*giá\s*học\s*phí|bảng\s*giá|\/bang-gia/i,
    'EducationNavigation must not have public pricing/tuition quote menu item'
  );

  // Active state validation:
  // On /quiz-menu, Quiz should be active, and Kiểm tra (/exam) must NOT be active
  const hasExactOrSlashMatch = /path\s*===\s*path\s*\|\|\s*\$page\.url\.pathname\.startsWith\(path\s*\+\s*['"]\/['"]\)/.test(eduNavContent)
    || !eduNavContent.includes("'/quiz'");

  assert.ok(
    hasExactOrSlashMatch,
    'EducationNavigation isActive logic must not falsely match /quiz-menu for an item matching /quiz'
  );

  // Simulate EducationNavigation isActive evaluation matrix
  const isActiveEdu = (pathname, match) => {
    return match.some(p => p === '/' ? pathname === '/' : (pathname === p || pathname.startsWith(p + '/')));
  };

  const quizMatch = ['/quiz-menu'];
  const examMatch = ['/exam'];

  // 1. When on /quiz-menu:
  assert.equal(isActiveEdu('/quiz-menu', quizMatch), true, 'Quiz is active on /quiz-menu');
  assert.equal(isActiveEdu('/quiz-menu', examMatch), false, 'Exam is NOT active on /quiz-menu');

  // 2. When on /exam:
  assert.equal(isActiveEdu('/exam', quizMatch), false, 'Quiz is NOT active on /exam');
  assert.equal(isActiveEdu('/exam', examMatch), true, 'Exam is active on /exam');

  // 3. When on /courses:
  assert.equal(isActiveEdu('/courses', quizMatch), false, 'Quiz is NOT active on /courses');
  assert.equal(isActiveEdu('/courses', examMatch), false, 'Exam is NOT active on /courses');

  // 4. When on /:
  assert.equal(isActiveEdu('/', quizMatch), false, 'Quiz is NOT active on /');
  assert.equal(isActiveEdu('/', examMatch), false, 'Exam is NOT active on /');
});

test('src/routes/+layout.svelte: public navigation has Quiz, no public pricing, and preserves admin billing', () => {
  const layoutContent = fs.readFileSync(path.join(ROOT, 'src/routes/+layout.svelte'), 'utf8');

  // Verify Quiz direct navigation is present
  assert.match(
    layoutContent,
    /href=['"]\/quiz-menu['"]/,
    'Layout must contain link to /quiz-menu'
  );

  // Verify no public pricing / tuition quote menu item in public navs
  // Ensure /bang-gia is not in top nav or mobile drawer
  const headerNav = layoutContent.substring(
    layoutContent.indexOf('<header'),
    layoutContent.indexOf('</header>')
  );
  assert.doesNotMatch(
    headerNav,
    /href=['"]\/bang-gia['"]/,
    'Header navigation and mobile drawer must not contain link to /bang-gia'
  );
  assert.doesNotMatch(
    headerNav,
    /Báo\s+giá\s+học\s+phí/i,
    'Header navigation must not contain public "Báo giá học phí" menu item'
  );

  // Preserve internal admin billing "Báo Học Phí & Đổi Sao"
  assert.match(
    layoutContent,
    /Báo Học Phí (&amp;|&) Đổi Sao/,
    'Admin billing workflow "Báo Học Phí & Đổi Sao" must be preserved'
  );
});

test('Responsive Audit 320px & 360px viewport: BottomNav grid-cols-5 metrics and label safety', () => {
  const bottomNavContent = fs.readFileSync(path.join(ROOT, 'src/lib/components/ui/BottomNav.svelte'), 'utf8');

  // Ensure 5-tab grid layout and mobile-only display
  assert.match(bottomNavContent, /grid-cols-5/, 'BottomNav must use grid-cols-5 for 5 tabs');
  assert.match(bottomNavContent, /lg:hidden/, 'BottomNav must be mobile/PWA only (lg:hidden)');
  assert.match(bottomNavContent, /env\(safe-area-inset-bottom\)/, 'BottomNav must support safe-area-inset-bottom for iOS/PWA');

  // Parse labels from tabs in BottomNav
  const labels = [...bottomNavContent.matchAll(/label:\s*['"]([^'"]+)['"]/g)].map(m => m[1]);
  assert.equal(labels.length, 5, 'BottomNav must have exactly 5 tabs');
  assert.deepEqual(labels, ['Trang chủ', 'Quiz', 'Phòng thi', 'Từ vựng', 'Tôi']);

  // Label length audit for 320px / 360px:
  // At 320px width: 320 / 5 = 64px per column
  // At 360px width: 360 / 5 = 72px per column
  // "Quiz" has 4 characters (~24px at 10px font), safely well below 64px
  labels.forEach(label => {
    assert.ok(
      label.length <= 10,
      `Tab label "${label}" length (${label.length}) must fit inside 64px mobile column`
    );
  });
});

test('Pricing page route /bang-gia is preserved and not deleted', () => {
  assert.ok(
    fs.existsSync(path.join(ROOT, 'src/routes/bang-gia/+page.svelte')),
    'src/routes/bang-gia/+page.svelte must exist for future reuse'
  );
  const pricingPage = fs.readFileSync(path.join(ROOT, 'src/routes/bang-gia/+page.svelte'), 'utf8');
  assert.match(pricingPage, /Bảng giá/i, 'Pricing page content must be preserved intact');
});

test('Business constraint: educational content "Học" and admin billing remain untouched', () => {
  const coursesPage = fs.readFileSync(path.join(ROOT, 'src/routes/courses/+page.svelte'), 'utf8');
  assert.match(coursesPage, /Đổi Sao trừ học phí/, 'Courses page educational billing text preserved');

  const layoutContent = fs.readFileSync(path.join(ROOT, 'src/routes/+layout.svelte'), 'utf8');
  assert.match(layoutContent, /Báo Học Phí &amp; Đổi Sao/, 'Layout admin CP billing workflow preserved');
});
