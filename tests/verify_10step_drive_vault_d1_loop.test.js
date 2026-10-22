import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  cleanDriveMarkdownWrapper,
  syncDriveSourceToKnowledgeVault
} from '../src/lib/server/quizDrive.js';
import { _listVaultMirroredDriveFiles as listVaultMirroredDriveFiles } from '../src/routes/api/drive/+server.js';

test('Bước 1: /api/drive listVaultMirroredDriveFiles truy vấn đúng cột D1 knowledge_vault + drive_file_index và lọc bỏ stub lỗi', async () => {
  const vaultRows = [
    {
      id: 'db_drive_1abcDEF123456',
      title: '📄 1509_bai_tap_trac_nghiem_tieng_anh',
      folder: '07_GOOGLE_DRIVE_LIBRARY',
      category: 'thpt_hsg',
      content_markdown:
        '# 📄 1509 Bài Tập Trắc Nghiệm Tiếng Anh Tổng Hợp\n\n- **Loại:** Tài liệu Google Drive (.docx)\n\n---\n\n' +
        'Question 1: She _____ to school every day. A. go B. goes C. going D. gone. Answer: B. ' +
        'Question 2: They _____ playing football now. A. is B. are C. am D. be. Answer: B.',
      tags: '["google-drive","thpt_hsg"]',
      source_path: 'drive://1abcDEF123456',
      updated_at: '2026-10-22T12:00:00Z'
    },
    {
      id: 'db_drive_folderStub',
      title: '📁 CHUYÊN ĐỀ NGỮ PHÁP',
      folder: '07_GOOGLE_DRIVE_LIBRARY',
      category: 'drive_folder',
      content_markdown: 'Thư mục tài liệu trên Google Drive.',
      tags: '[]',
      source_path: 'drive://folderStub',
      updated_at: '2026-10-22T12:00:00Z'
    }
  ];
  const indexRows = [
    {
      drive_id: '1xyzINDEX987654',
      name: 'conditional sentences key.docx',
      mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      size_bytes: 40960,
      web_view_link: 'https://drive.google.com/file/d/1xyzINDEX987654/view',
      modified_time: '2026-10-22T13:00:00Z'
    }
  ];

  const fakeDb = {
    prepare(sql) {
      return {
        all: async () => {
          assert.ok(!sql.includes('source_url'), 'Không được query cột source_url không tồn tại trong knowledge_vault');
          if (sql.includes('FROM knowledge_vault')) {
            return { results: vaultRows.filter((r) => !r.title.startsWith('📁')) };
          }
          if (sql.includes('FROM drive_file_index')) {
            return { results: indexRows };
          }
          return { results: [] };
        }
      };
    }
  };

  const files = await listVaultMirroredDriveFiles(fakeDb, '');
  assert.equal(files.length, 2, 'Phải trả về cả file từ knowledge_vault và drive_file_index, bỏ qua folder stub');
  assert.equal(files[0].name, '1509 Bài Tập Trắc Nghiệm Tiếng Anh Tổng Hợp');
  assert.equal(files[0].driveId, '1abcDEF123456');
  assert.equal(files[1].name, 'Chuyên Đề Câu Điều Kiện – Conditional Sentences (Có Đáp Án)');
  assert.equal(files[1].groupKey, 'ngu_phap');
});

test('Bước 2: Drive Sync Engine (driveSync.js) giữ nguyên hợp đồng đồng bộ Drive -> knowledge_vault D1 (07_GOOGLE_DRIVE_LIBRARY)', () => {
  const driveSyncSrc = fs.readFileSync('src/lib/server/driveSync.js', 'utf8');
  assert.ok(driveSyncSrc.includes("'07_GOOGLE_DRIVE_LIBRARY'"));
  assert.ok(driveSyncSrc.includes('INSERT INTO knowledge_vault (id, title, folder, category, tags, source_path, source_hash, content_markdown, status)'));
  assert.ok(driveSyncSrc.includes('const vid = `db_drive_${f.id}`'));
});

test('Bước 3: syncDriveSourceToKnowledgeVault tự động backfill tài liệu Drive/Upload từ Quiz Studio vào knowledge_vault D1', async () => {
  const inserted = [];
  const fakeDb = {
    prepare(sql) {
      return {
        bind(...params) {
          return {
            run: async () => {
              inserted.push({ sql, params });
              return {};
            }
          };
        }
      };
    }
  };

  const sampleText =
    '1. If I _____ you, I would study harder for the final English examination.\n' +
    'A. am   B. were   C. was   D. been\n' +
    '2. Unless it rains tomorrow, we _____ go camping in the national park.\n' +
    'A. will   B. would   C. had   D. did\n';

  const ok = await syncDriveSourceToKnowledgeVault(
    fakeDb,
    { id: '1DriveDocId999', name: 'conditional sentences key.docx', webViewLink: 'https://drive.google.com/file/d/1DriveDocId999/view' },
    sampleText
  );

  assert.equal(ok, true, 'Phải đồng bộ thành công vào knowledge_vault');
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].params[0], 'db_drive_1DriveDocId999');
  assert.equal(inserted[0].params[1], 'Chuyên Đề Câu Điều Kiện – Conditional Sentences (Có Đáp Án)');
  assert.equal(inserted[0].params[4], 'drive://1DriveDocId999');
  assert.ok(inserted[0].params[6].includes('If I _____ you'));
});

test('Bước 4: cleanDriveMarkdownWrapper loại bỏ hoàn toàn header metadata của Drive/Vault trước khi sinh câu hỏi', () => {
  const wrapped = `# 📄 Chuyên Đề Câu Điều Kiện
- **Loại:** Tài liệu Google Drive (.docx)
- **Phân loại:** 📐 Chuyên đề Ngữ pháp
- **Tệp gốc:** conditional sentences key.docx
- **Nguồn:** [Mở trên Google Drive](https://drive.google.com/file/d/1DriveDocId999/view)
🔗 [Mở file gốc trên Drive](https://drive.google.com/file/d/1DriveDocId999/view)

---

Question 1: If he studies hard, he will pass the exam easily.
Question 2: Had I known the truth, I would have told you immediately.`;

  const cleaned = cleanDriveMarkdownWrapper(wrapped);
  assert.ok(!cleaned.includes('Loại:'), 'Không được còn dòng Loại:');
  assert.ok(!cleaned.includes('Phân loại:'), 'Không được còn dòng Phân loại:');
  assert.ok(!cleaned.includes('Mở file gốc trên Drive'), 'Không được còn link Mở trên Drive');
  assert.ok(cleaned.startsWith('Question 1: If he studies hard'), 'Nội dung sạch phải bắt đầu ngay bằng nội dung bài học');
});

test('Bước 5: Endpoint /api/quiz-menu/[id]/from-knowledge-vault làm sạch wrapper và tự động cứu hộ bài học Drive bị thiếu text', () => {
  const fromKvSrc = fs.readFileSync('src/routes/api/quiz-menu/[id]/from-knowledge-vault/+server.js', 'utf8');
  assert.ok(fromKvSrc.includes('cleanDriveMarkdownWrapper(article.content_markdown || \'\')'));
  assert.ok(fromKvSrc.includes('readAllowedDriveSource(platform, candidateDriveId)'));
  assert.ok(fromKvSrc.includes('syncDriveSourceToKnowledgeVault(db,'));
});

test('Bước 6: quizDrive.js readD1SyncedDriveSource hỗ trợ cả ID thô và db_drive_<id>, đồng thời saveQuizSourceAndDrafts tự backfill vào Vault', () => {
  const qdSrc = fs.readFileSync('src/lib/server/quizDrive.js', 'utf8');
  assert.ok(qdSrc.includes('WHERE (id = ? OR id = ?) AND folder = \'07_GOOGLE_DRIVE_LIBRARY\''));
  assert.ok(qdSrc.includes('WHERE (drive_id = ? OR drive_id = ?) LIMIT 1'));
  assert.ok(qdSrc.includes('if (options.sourceType !== \'knowledge_vault\') {\n    await syncDriveSourceToKnowledgeVault(db, metadata, text);\n  }'));
});

test('Bước 7: /second-brain (+page.server.js & /api/second-brain/+server.js) lọc bỏ folder stub, mp3/rar, lỗi trích xuất và chuẩn hóa tiêu đề tiếng Việt', () => {
  const sbServer = fs.readFileSync('src/routes/second-brain/+page.server.js', 'utf8');
  const sbApi = fs.readFileSync('src/routes/api/second-brain/+server.js', 'utf8');

  assert.ok(sbServer.includes("title NOT LIKE '📁%'"));
  assert.ok(sbServer.includes('normalizeVietnameseSourceTitle'));
  assert.ok(sbApi.includes("title NOT LIKE '📁%'"));
  assert.ok(sbApi.includes('normalizeVietnameseSourceTitle'));
});

test('Bước 8: /api/second-brain/sync đồng bộ khép kín cả Quizzes, Tài liệu Drive trích xuất và Hồ sơ Ca dạy (session_quality_audits) vào knowledge_vault D1', () => {
  const syncSrc = fs.readFileSync('src/routes/api/second-brain/sync/+server.js', 'utf8');
  assert.ok(syncSrc.includes('FROM quizzes'));
  assert.ok(syncSrc.includes('const vid = `db_quiz_${qz.id}`'));
  assert.ok(syncSrc.includes('syncDriveSourceToKnowledgeVault'));
  assert.ok(syncSrc.includes('FROM session_quality_audits'));
  assert.ok(syncSrc.includes('const vid = `db_audit_${aud.session_id}`'));
  assert.ok(syncSrc.includes("INSERT INTO knowledge_fts(knowledge_fts) VALUES('rebuild')"));
});

test('Bước 9: /api/session-audit nhận diện đầy đủ Bài giảng theo Link (resolvedDriveUrl), Nguồn dán thêm (hasCustomLessonPlan) và Kho Tri Thức D1', () => {
  const saSrc = fs.readFileSync('src/routes/api/session-audit/+server.js', 'utf8');
  assert.ok(saSrc.includes('const hasCustomLessonPlan = Boolean(audit?.lesson_plan_content && String(audit.lesson_plan_content).trim());'));
  assert.ok(saSrc.includes('const hasMaterial = Boolean(resolvedVaultId || resolvedVaultTitle || resolvedDriveId || resolvedDriveName || resolvedDriveUrl || hasCustomLessonPlan);'));
  assert.ok(saSrc.includes("LOWER(title) NOT LIKE '%.doc'"));
  assert.ok(saSrc.includes("content_markdown NOT LIKE '%Không trích xuất được nội dung%'"));
});

test('Bước 10: Liên kết điều hướng 1 chạm khép kín giữa /drive <-> /second-brain <-> /quiz-menu <-> /session-audit', () => {
  const drivePage = fs.readFileSync('src/routes/drive/+page.svelte', 'utf8');
  const sbPage = fs.readFileSync('src/routes/second-brain/+page.svelte', 'utf8');
  const qmPage = fs.readFileSync('src/routes/quiz-menu/+page.svelte', 'utf8');

  // /drive có filter group khớp chuẩn và nút Tạo Quiz + mở Vault + gắn Ca dạy
  assert.ok(drivePage.includes("{ key: 'tieu_hoc'"));
  assert.ok(drivePage.includes("{ key: 'thcs'"));
  assert.ok(drivePage.includes("{ key: 'thpt_hsg'"));
  assert.ok(drivePage.includes('/quiz-menu?tab=create&mode=auto&source=drive&file_id='));
  assert.ok(drivePage.includes('/second-brain?id='));

  // /second-brain có nút Tạo Quiz từ bài học + Gắn Ca dạy + đọc ?id= & ?folder=
  assert.ok(sbPage.includes('/quiz-menu?tab=create&mode=auto&source=knowledge_vault&vault_id='));
  assert.ok(sbPage.includes("const idParam = sp.get('id');"));

  // /quiz-menu tự động nhận ?file_id= và ?vault_id=
  assert.ok(qmPage.includes("const fileIdParam = sp.get('file_id');"));
  assert.ok(qmPage.includes("const vaultIdParam = sp.get('vault_id');"));
  assert.ok(qmPage.includes('selectedDriveFileId = fileIdParam;'));
  assert.ok(qmPage.includes('kvSelectedArticleId = vaultIdParam;'));
});
