import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { convertBankRowsToTypeMix } from '../src/lib/server/quizBankBridge.js';
import { gradeAnswers } from '../src/lib/server/quizMenu.js';
import { listQuizDriveFiles, readAllowedDriveSource } from '../src/lib/server/quizDrive.js';
import {
  normalizeVietnameseSourceTitle,
  classifyDriveFileGroup,
  classifyKnowledgeVaultArticle,
  formatGradeLevelVi,
  formatSkillCategoryVi,
  formatCognitiveLevelVi,
  formatTopicVi,
  formatQuestionTypeVi
} from '../src/lib/quizSourceNormalizer.js';

const MOCK_BANK_ROWS = [
  {
    id: 501,
    question_text: 'She ____ to school every morning by bicycle.',
    options_json: JSON.stringify(['A. go', 'B. goes', 'C. going', 'D. gone']),
    correct_option_id: 'B',
    explanation: 'Present simple third-person singular takes -es (goes).'
  },
  {
    id: 502,
    question_text: 'Choose the word that means "essential" in academic reading.',
    options_json: JSON.stringify(['A. optional', 'B. vital', 'C. minor', 'D. trivial']),
    correct_option_id: 'B',
    explanation: '"Vital" is a direct synonym of "essential".'
  },
  {
    id: 503,
    question_text: 'If I ____ enough money, I would buy a new laptop for studying.',
    options_json: JSON.stringify(['A. have', 'B. had', 'C. has', 'D. having']),
    correct_option_id: 'B',
    explanation: 'Second conditional uses past simple in the if-clause.'
  },
  {
    id: 504,
    question_text: 'Look at the sign: "NO PARKING". What does it mean?',
    options_json: JSON.stringify([
      'A. You can park here for free.',
      'B. You must not leave your vehicle here.',
      'C. Only buses can park here.',
      'D. Parking is allowed at night.'
    ]),
    correct_option_id: 'B',
    explanation: '"No parking" prohibits leaving any vehicle in this area.'
  },
  {
    id: 505,
    question_text: 'They have lived in this neighborhood ____ ten years.',
    options_json: JSON.stringify(['A. since', 'B. for', 'C. during', 'D. ago']),
    correct_option_id: 'B',
    explanation: 'Use "for" with a period of time (ten years).'
  },
  {
    id: 506,
    question_text: 'The book ____ was written by Hemingway is very famous.',
    options_json: JSON.stringify(['A. who', 'B. which', 'C. whom', 'D. whose']),
    correct_option_id: 'B',
    explanation: 'Use "which" for things in relative clauses.'
  },
  {
    id: 507,
    question_text: 'We should protect the environment by reducing plastic waste.',
    options_json: JSON.stringify(['A. pollutes', 'B. conserving nature', 'C. wasting water', 'D. cutting trees']),
    correct_option_id: 'B',
    explanation: 'Protecting the environment corresponds to conserving nature.'
  },
  {
    id: 508,
    question_text: 'Although it rained heavily, they continued their outdoor trip.',
    options_json: JSON.stringify(['A. Despite the heavy rain', 'B. Because it rained', 'C. Unless it rains', 'D. So it rained']),
    correct_option_id: 'A',
    explanation: '"Although + clause" can be rewritten with "Despite + noun phrase".'
  }
];

describe('QUIZ ENRICHMENT, DRIVE D1 SYNC & MULTI-TYPE QA SUITE', () => {
  test('ENRICH-01: convertBankRowsToTypeMix generates diverse interactive question types from Question Bank rows', () => {
    const typeMix = {
      multiple_choice: 2,
      true_false: 1,
      fill_blank: 1,
      word_guess: 1,
      ordering: 1,
      matching: 1,
      memory_match: 1
    };

    const converted = convertBankRowsToTypeMix(MOCK_BANK_ROWS, 'quiz_test_mix', 1, typeMix);
    assert.equal(converted.length, 8);

    const types = converted.map((q) => q.type);
    assert.deepEqual(types, [
      'multiple_choice',
      'multiple_choice',
      'true_false',
      'fill_blank',
      'word_guess',
      'ordering',
      'matching',
      'memory_match'
    ]);

    // Verify all converted questions can be auto-graded with 100% score when answered with correct_answer
    const answersPayload = {};
    for (const q of converted) {
      if (q.type === 'matching' || q.type === 'memory_match' || q.type === 'ordering') {
        answersPayload[q.id] = JSON.parse(q.correct_answer);
      } else {
        answersPayload[q.id] = q.correct_answer;
      }
    }

    const graded = gradeAnswers(converted, answersPayload);
    assert.equal(graded.autoScore, graded.maxScore);
    assert.equal(graded.needsReview, false);
  });

  test('ENRICH-02: D1-synced Drive fallback lists and reads knowledge_vault and drive_file_index documents without hitting Drive storage quota', async () => {
    const mockDb = {
      prepare(sql) {
        return {
          bind(...args) {
            return {
              async first() {
                if (sql.includes('FROM knowledge_vault WHERE id = ?')) {
                  return {
                    id: args[0],
                    title: 'GLOBAL SUCCESS - GRADE 7 - HK I.docx',
                    content_markdown: 'Unit 1: My Hobbies. She enjoys reading books every evening. Playing sports helps students stay healthy and active.',
                    updated_at: '2026-10-15T00:00:00Z'
                  };
                }
                return null;
              }
            };
          },
          async all() {
            if (sql.includes('FROM knowledge_vault')) {
              return {
                results: [
                  {
                    id: 'kv_drive_doc_1',
                    title: 'GLOBAL SUCCESS - GRADE 7 - HK I.docx',
                    updated_at: '2026-10-15T00:00:00Z'
                  }
                ]
              };
            }
            if (sql.includes('FROM drive_file_index')) {
              return {
                results: [
                  {
                    drive_id: '1DriveFileIdMock999',
                    name: '1509_bai_tap_trac_nghiem_tieng_anh.docx',
                    mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    size_bytes: 45000,
                    modified_time: '2026-10-15T00:00:00Z',
                    web_view_link: 'https://drive.google.com/file/d/1DriveFileIdMock999/view'
                  }
                ]
              };
            }
            return { results: [] };
          }
        };
      }
    };

    const platform = { env: { DB: mockDb } };
    const listed = await listQuizDriveFiles(platform);
    assert.ok(listed.length >= 2);
    assert.equal(listed[0].id, 'kv_drive_doc_1');

    const source = await readAllowedDriveSource(platform, 'kv_drive_doc_1');
    assert.equal(source.file.id, 'kv_drive_doc_1');
    assert.ok(source.text.includes('Unit 1: My Hobbies'));
  });

  test('ENRICH-03: +page.svelte implements hash deep-link resolution, smooth scroll, option prefix cleanup, and format presets', () => {
    const sveltePath = path.resolve('src/routes/quiz-menu/+page.svelte');
    const content = fs.readFileSync(sveltePath, 'utf8');

    assert.ok(content.includes('function resolveQuizIdFromHash'), 'Must define resolveQuizIdFromHash');
    assert.ok(content.includes('function scrollToQuestion'), 'Must define scrollToQuestion');
    assert.ok(content.includes('function formatOptionDisplay'), 'Must define formatOptionDisplay');
    assert.ok(content.includes('QUIZ_FORMAT_PRESETS'), 'Must define QUIZ_FORMAT_PRESETS');
    assert.ok(content.includes('format-presets-bar'), 'Must render format-presets-bar in Step 2');
  });

  test('ENRICH-04: quizSourceNormalizer normalizes ASCII/English Drive & Knowledge Vault titles and Question Bank facets into full Vietnamese with diacritics', () => {
    assert.equal(
      normalizeVietnameseSourceTitle('1000 cau trac nghiem ngu phap hsg', 'drive-1000-cau-trac-nghiem-ngu-phap-hsg'),
      '1000 Câu Trắc Nghiệm Ngữ Pháp Học Sinh Giỏi'
    );
    assert.equal(
      normalizeVietnameseSourceTitle('g3 ck1 test', 'drive-g3-ck1-test'),
      'Đề Kiểm Tra Cuối Học Kỳ 1 – Tiếng Anh Lớp 3'
    );
    assert.equal(
      normalizeVietnameseSourceTitle('22000 tu toefl ielts harold levine', 'drive-22000-tu-toefl-ielts-harold-levine'),
      '22.000 Từ Vựng TOEFL & IELTS – Harold Levine'
    );

    const gPrimary = classifyDriveFileGroup('g3 ck1 test', 'drive-g3-ck1-test');
    assert.equal(gPrimary.key, 'tieu_hoc');
    assert.ok(gPrimary.label.includes('Khối Tiểu học'));

    const kvClassified = classifyKnowledgeVaultArticle({
      id: 'kv_test_1',
      title: '1509 bai tap trac nghiem tieng anh',
      category: 'question'
    });
    assert.equal(kvClassified.group_key, 'de_thi_hsg');
    assert.equal(kvClassified.title_vi, '1509 Bài Tập Trắc Nghiệm Tiếng Anh Tổng Hợp');

    assert.equal(formatGradeLevelVi('lop_7'), 'Lớp 7 (THCS)');
    assert.equal(formatSkillCategoryVi('grammar'), 'Ngữ pháp & Cấu trúc câu');
    assert.equal(formatCognitiveLevelVi('van_dung_cao'), 'Vận dụng cao (HSG / Chuyên)');
    assert.equal(formatTopicVi('conditional'), 'Câu điều kiện (If)');
    assert.equal(formatQuestionTypeVi('multiple_choice'), 'Trắc nghiệm 4 lựa chọn');
  });

  test('ENRICH-05: +page.svelte removes up/down ordering buttons and groups Drive/Vault/Catalog with Vietnamese pills', () => {
    const sveltePath = path.resolve('src/routes/quiz-menu/+page.svelte');
    const content = fs.readFileSync(sveltePath, 'utf8');

    assert.ok(!content.includes('moveOrderItem('), 'Must not use moveOrderItem up/down buttons');
    assert.ok(!/\bmoveQuestion\s*\(/.test(content), 'Must not use moveQuestion up/down buttons');
    assert.ok(content.includes('source-group-pills'), 'Must render grouped Vietnamese source pills');
    assert.ok(content.includes('catalog-filter-bar'), 'Must render catalog filter bar in Take tab');
    assert.ok(content.includes('groupedDriveFiles'), 'Must group Drive files by Vietnamese category');
    assert.ok(content.includes('groupedKvArticles'), 'Must group Knowledge Vault articles by Vietnamese category');
  });
});

