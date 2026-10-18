import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { GET as driveGet } from '../src/routes/api/drive/+server.js';
import { createSignedToken } from '../src/lib/server/auth.js';

const ROOT = process.cwd();
const SECRET = 'edtech-copilot-regression-secret-20261018';

describe('EDTECH DESIGN SYSTEM, EXTENSION & ENDPOINT REGRESSION SUITE', () => {
  test('COPILOT-CSS-01: src/app.css uses :where(h1..h6) and text-wrap: balance so dark hero text-white is never overridden', () => {
    const css = fs.readFileSync(path.join(ROOT, 'src/app.css'), 'utf8');
    assert.match(css, /:where\(h1,\s*h2,\s*h3,\s*h4,\s*h5,\s*h6\),\s*\.font-heading/, 'Must use zero-specificity :where() for heading base rule');
    assert.match(css, /text-wrap:\s*balance/, 'Headings must use text-wrap: balance');
    // Must not force color: #1c1917 inside .font-heading rule
    const headingBlock = css.match(/:where\(h1,\s*h2,\s*h3,\s*h4,\s*h5,\s*h6\),\s*\.font-heading\s*\{([^}]*)\}/);
    assert.ok(headingBlock, 'Heading block must exist');
    assert.equal(headingBlock[1].includes('color: #1c1917'), false, '.font-heading rule must not hardcode #1c1917 over parent text-white');
  });

  test('COPILOT-A11Y-02: SectionHeading supports as="h1" and product pages render semantic <h1>', () => {
    const sectionHeading = fs.readFileSync(path.join(ROOT, 'src/lib/components/ui/SectionHeading.svelte'), 'utf8');
    assert.match(sectionHeading, /as\s*=\s*['"]h2['"]/, 'SectionHeading must accept as prop');
    assert.match(sectionHeading, /<h1\b/, 'SectionHeading must render <h1> when as === "h1"');

    const coursesPage = fs.readFileSync(path.join(ROOT, 'src/routes/courses/+page.svelte'), 'utf8');
    assert.match(coursesPage, /<SectionHeading[\s\S]*?\bas=["']h1["']/, '/courses must render top SectionHeading with as="h1"');

    const pricingPage = fs.readFileSync(path.join(ROOT, 'src/routes/bang-gia/+page.svelte'), 'utf8');
    assert.match(pricingPage, /<SectionHeading[\s\S]*?\bas=["']h1["']/, '/bang-gia must render top SectionHeading with as="h1"');

    const hofPage = fs.readFileSync(path.join(ROOT, 'src/routes/hall-of-fame/+page.svelte'), 'utf8');
    assert.match(hofPage, /<SectionHeading[\s\S]*?\bas=["']h1["']/, '/hall-of-fame must render top SectionHeading with as="h1"');
    assert.doesNotMatch(hofPage, /rows=\{\[\]\}/, '/hall-of-fame must not pass hardcoded empty rows={[]}');
  });

  test('COPILOT-EXT-03: /pedagogy uses Academic Warmth tokens and /cpanel passes Authorization + view=summary to /api/campuses', () => {
    const pedagogyPage = fs.readFileSync(path.join(ROOT, 'src/routes/pedagogy/+page.svelte'), 'utf8');
    assert.match(pedagogyPage, /bg-surface-0/, '/pedagogy must use Academic Warmth bg-surface-0');
    assert.equal(pedagogyPage.includes('bg-slate-950'), false, '/pedagogy must not use pitch-black bg-slate-950');

    const cpanelLayout = fs.readFileSync(path.join(ROOT, 'src/routes/cpanel/+layout.svelte'), 'utf8');
    assert.match(cpanelLayout, /\/api\/campuses\?view=summary/, 'cpanel layout must request /api/campuses?view=summary');
    assert.match(cpanelLayout, /Authorization/, 'cpanel layout loadCampuses must include Authorization header');

    const homePage = fs.readFileSync(path.join(ROOT, 'src/routes/+page.svelte'), 'utf8');
    assert.equal(homePage.includes('/courses/${curr.slug || curr.id}'), false, 'Home page must not link to non-existent /courses/[slug] route');
  });

  test('COPILOT-API-04: GET /api/drive maps folder_id=root to DEFAULT_DRIVE_FOLDER and falls back to D1 knowledge_vault with Vietnamese titles', async () => {
    const token = await createSignedToken({
      id: 'usr_teacher_1',
      username: 'teacher.quynh',
      role: 'teacher',
      sid: 'sess_drive_test_1',
      exp: Date.now() + 3600000
    }, SECRET);

    const mockDb = {
      prepare(sql) {
        return {
          bind(...args) {
            return {
              async first() {
                if (sql.includes('FROM users')) {
                  return { id: 'usr_teacher_1', username: 'teacher.quynh', role: 'teacher', status: 'active', approval_status: 'approved' };
                }
                if (sql.includes('FROM auth_sessions')) {
                  return { id: 'sess_drive_test_1', revoked_at: null, expires_at: new Date(Date.now() + 3600000).toISOString() };
                }
                return null;
              },
              async all() {
                if (sql.includes('FROM knowledge_vault')) {
                  return {
                    results: [
                      {
                        id: 'drive-doc1',
                        title: 'De thi thu THPT Quoc Gia 2026 - Ma de 01.pdf',
                        content: 'Question 1: Choose the correct answer...',
                        source_url: 'https://drive.google.com/file/d/doc1/view',
                        updated_at: '2026-10-18T10:00:00Z'
                      }
                    ]
                  };
                }
                return { results: [] };
              },
              async run() {
                return { meta: { changes: 1 } };
              }
            };
          }
        };
      }
    };

    const platform = { env: { AUTH_SECRET: SECRET, DB: mockDb } };
    const req = new Request('http://localhost/api/drive?folder_id=root', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const res = await driveGet({ url: new URL(req.url), request: req, platform });
    assert.equal(res.status, 200, 'GET /api/drive?folder_id=root must succeed with 200');
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.source, 'knowledge_vault_mirror');
    assert.equal(body.files.length, 1);
    assert.match(body.files[0].name, /Đề Thi Thử THPT Quốc Gia/i, 'Drive file title must be normalized to Vietnamese with diacritics');
    assert.ok(body.files[0].groupKey, 'Drive file must include groupKey');
    assert.ok(body.files[0].groupLabel, 'Drive file must include Vietnamese groupLabel');
  });
});
