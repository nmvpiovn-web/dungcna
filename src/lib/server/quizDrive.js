import { getServiceAccountToken } from './googleServiceAccount.js';
import { makeId, sha256, validateQuestion } from './quizMenu.js';

export const MAX_QUIZ_FILE_BYTES = 10 * 1024 * 1024;
export const QUIZ_UPLOAD_FOLDER_NAME = 'Quiz Uploads';
export const GOOGLE_FOLDER_MIME = 'application/vnd.google-apps.folder';
export const GOOGLE_DOC_MIME = 'application/vnd.google-apps.document';

const TYPES = new Map([
  ['.pdf', 'application/pdf'],
  ['.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ['.txt', 'text/plain'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg']
]);

export class QuizDriveError extends Error {
  constructor(message, status = 500, code = 'DriveError') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function sanitizeDriveFilename(value) {
  const leaf = String(value || '').replaceAll('\\', '/').split('/').pop() || 'upload';
  const clean = leaf.normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, '_')
    .replace(/\.{2,}/g, '.')
    .replace(/\s+/g, ' ')
    .replace(/^[. ]+|[. ]+$/g, '')
    .slice(0, 120);
  return clean || 'upload';
}

export function validateQuizFile(file) {
  if (!file || typeof file.arrayBuffer !== 'function') {
    throw new QuizDriveError('Thiếu tệp upload', 400, 'FileRequired');
  }
  const name = sanitizeDriveFilename(file.name);
  const dot = name.lastIndexOf('.');
  const ext = dot >= 0 ? name.slice(dot).toLowerCase() : '';
  const expected = TYPES.get(ext);
  if (!expected) throw new QuizDriveError('Chỉ hỗ trợ PDF, DOCX, TXT, PNG, JPG', 415, 'UnsupportedFileType');
  if (!Number.isFinite(file.size) || file.size <= 0) throw new QuizDriveError('Tệp rỗng', 400, 'EmptyFile');
  if (file.size > MAX_QUIZ_FILE_BYTES) throw new QuizDriveError('Tệp vượt quá giới hạn 10MB', 413, 'FileTooLarge');
  const supplied = String(file.type || '').toLowerCase();
  const allowedForExt = ext === '.jpg' || ext === '.jpeg' ? ['image/jpeg'] : [expected];
  if (supplied && !allowedForExt.includes(supplied)) {
    throw new QuizDriveError('Định dạng tệp không khớp phần mở rộng', 415, 'MimeMismatch');
  }
  return { name, mimeType: expected, size: file.size };
}

function configuredFolderIds(platform) {
  const raw = platform?.env?.QUIZ_DRIVE_ALLOWED_FOLDER_IDS || platform?.env?.GOOGLE_DRIVE_ALLOWED_FOLDER_IDS || '';
  return String(raw).split(',').map((id) => id.trim()).filter(Boolean);
}

async function accessToken(platform) {
  const explicit = platform?.env?.GOOGLE_DRIVE_ACCESS_TOKEN;
  const token = explicit || await getServiceAccountToken(platform);
  if (!token) throw new QuizDriveError('Chưa cấu hình Google Drive service account', 503, 'DriveNotConfigured');
  return token;
}

async function driveRequest(platform, path, init = {}) {
  const token = await accessToken(platform);
  const response = await fetch(`https://www.googleapis.com${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, ...(init.headers || {}) }
  });
  if (!response.ok) {
    let detail = '';
    try { detail = (await response.json())?.error?.message || ''; } catch {}
    throw new QuizDriveError(detail || `Google Drive trả về HTTP ${response.status}`, 502, 'DriveApiError');
  }
  return response;
}

function driveQuery(value) {
  return String(value).replaceAll('\\', '\\\\').replaceAll("'", "\\'");
}

export async function ensureQuizUploadsFolder(platform) {
  const parent = String(platform?.env?.QUIZ_DRIVE_PARENT_FOLDER_ID || '').trim();
  if (!parent) throw new QuizDriveError('Thiếu QUIZ_DRIVE_PARENT_FOLDER_ID', 503, 'DriveParentNotConfigured');
  const q = [`name = '${driveQuery(QUIZ_UPLOAD_FOLDER_NAME)}'`, `mimeType = '${GOOGLE_FOLDER_MIME}'`, 'trashed = false', `'${driveQuery(parent)}' in parents`].join(' and ');
  const list = await driveRequest(platform, `/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,parents)&pageSize=10&supportsAllDrives=true&includeItemsFromAllDrives=true`);
  const existing = (await list.json()).files?.[0];
  if (existing?.id) return existing;
  const created = await driveRequest(platform, '/drive/v3/files?fields=id,name,parents&supportsAllDrives=true', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: QUIZ_UPLOAD_FOLDER_NAME, mimeType: GOOGLE_FOLDER_MIME, parents: [parent] })
  });
  return created.json();
}

export async function allowedQuizFolderIds(platform) {
  const uploadFolder = await ensureQuizUploadsFolder(platform);
  return new Set([uploadFolder.id, ...configuredFolderIds(platform)]);
}

function multipartBody(metadata, bytes, mimeType) {
  const boundary = `quiz_${crypto.randomUUID().replaceAll('-', '')}`;
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
    `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`, bytes, `\r\n--${boundary}--`
  ]);
  return { body, contentType: `multipart/related; boundary=${boundary}` };
}

async function uploadBytes(platform, { name, mimeType, bytes, folderId, convertToDoc = false }) {
  const metadata = { name, parents: [folderId], ...(convertToDoc ? { mimeType: GOOGLE_DOC_MIME } : {}) };
  const multipart = multipartBody(metadata, bytes, mimeType);
  const response = await driveRequest(platform, '/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size,parents,webViewLink,createdTime&supportsAllDrives=true', {
    method: 'POST', headers: { 'content-type': multipart.contentType }, body: multipart.body
  });
  return response.json();
}

async function exportGoogleDoc(platform, id) {
  const response = await driveRequest(platform, `/drive/v3/files/${encodeURIComponent(id)}/export?mimeType=text%2Fplain`);
  return response.text();
}

async function removeDriveFile(platform, id) {
  await driveRequest(platform, `/drive/v3/files/${encodeURIComponent(id)}?supportsAllDrives=true`, { method: 'DELETE' });
}

async function extractBytes(platform, metadata, bytes, folderId) {
  if (metadata.mimeType === 'text/plain') return new TextDecoder().decode(bytes);
  // Local extraction first (no Drive dependency)
  const local = await extractBytesLocal(metadata, bytes);
  if (local && local.trim().length >= 50) return local;
  // Fallback: Drive conversion
  let converted;
  try {
    converted = await uploadBytes(platform, {
      name: `${metadata.name} (parse temp)`, mimeType: metadata.mimeType, bytes, folderId, convertToDoc: true
    });
    return await exportGoogleDoc(platform, converted.id);
  } finally {
    if (converted?.id) {
      try { await removeDriveFile(platform, converted.id); } catch {}
    }
  }
}

async function extractBytesLocal(metadata, bytes) {
  const mime = metadata.mimeType || '';
  const name = (metadata.name || '').toLowerCase();
  try {
    if (mime.includes('wordprocessingml') || name.endsWith('.docx')) {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ arrayBuffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
      return result.value || '';
    }
    if (mime === 'application/pdf' || name.endsWith('.pdf')) {
      // Try pdfjs-dist first
      try {
        const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
        const doc = await pdfjs.getDocument({ data: bytes }).promise;
        const pages = [];
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const content = await page.getTextContent();
          pages.push(content.items.map(it => it.str).join(' '));
        }
        await doc.destroy();
        const text = pages.join('\n\n');
        if (text.trim().length >= 50) return text;
      } catch (e) {
        console.warn('[quizDrive] pdfjs failed, trying regex fallback:', e.message);
      }
      // Fallback: regex extract text from PDF content streams (Tj/TJ operators)
      const regexText = extractPdfTextRegex(bytes);
      if (regexText.trim().length >= 50) return regexText;
      const decompText = await extractPdfTextDecompressed(bytes);
      if (decompText.trim().length >= 20) return decompText;
      return regexText || decompText;
    }
  } catch (e) {
    console.warn('[quizDrive] local extraction failed:', e.message);
  }
  return '';
}

function extractPdfTextRegex(bytes) {
  try {
    const raw = new TextDecoder('latin1').decode(bytes);
    const texts = [];
    // Find all streams, decompress if FlateDecode
    const streamRe = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let sm;
    const chunks = [];
    while ((sm = streamRe.exec(raw)) !== null) {
      chunks.push(sm[1]);
    }
    // Also try decompressing flate streams via DecompressionStream
    const combined = chunks.join('\n');
    // Match (text) Tj and [...] TJ operators
    const tjRe = /\((?:\\.|[^\\()])*\)\s*Tj/g;
    const tjArrRe = /\[((?:[^\[\]])*)\]\s*TJ/g;
    let m;
    while ((m = tjRe.exec(combined)) !== null) {
      texts.push(decodePdfString(m[0]));
    }
    while ((m = tjArrRe.exec(combined)) !== null) {
      const strRe = /\((?:\\.|[^\\()])*\)/g;
      let s2;
      while ((s2 = strRe.exec(m[1])) !== null) {
        texts.push(decodePdfString(s2[0]));
      }
    }
    if (texts.join(' ').trim().length >= 20) return texts.join(' ');
    return '';
  } catch {
    return '';
  }
}

async function extractPdfTextDecompressed(bytes) {
  // Decompress FlateDecode streams then regex-extract
  try {
    if (typeof DecompressionStream === 'undefined') return '';
    const raw = new TextDecoder('latin1').decode(bytes);
    const streamRe = /\/Filter\s*\/FlateDecode[\s\S]*?stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let m;
    const out = [];
    while ((m = streamRe.exec(raw)) !== null) {
      const latinBytes = Uint8Array.from(m[1], c => c.charCodeAt(0));
      const ds = new DecompressionStream('deflate');
      const writer = ds.writable.getWriter();
      writer.write(latinBytes);
      writer.close();
      const chunks = [];
      const reader = ds.readable.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      const total = chunks.reduce((a, c) => a + c.length, 0);
      const merged = new Uint8Array(total);
      let off = 0;
      for (const c of chunks) { merged.set(c, off); off += c.length; }
      out.push(new TextDecoder('latin1').decode(merged));
    }
    const combined = out.join('\n');
    const texts = [];
    const tjRe = /\((?:\\.|[^\\()])*\)\s*Tj/g;
    while ((m = tjRe.exec(combined)) !== null) texts.push(decodePdfString(m[0]));
    return texts.join(' ');
  } catch {
    return '';
  }
}

function decodePdfString(s) {
  // s is like "(Hello \(world\))" — strip parens and unescape
  let inner = s.replace(/^\(/, '').replace(/\)\s*Tj$/, '').replace(/\)$/, '');
  return inner
    .replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t')
    .replace(/\\\(/g, '(').replace(/\\\)/g, ')').replace(/\\\\/g, '\\');
}

export async function uploadQuizSource(platform, file) {
  const validated = validateQuizFile(file);
  const bytes = new Uint8Array(await file.arrayBuffer());
  // Local extraction for TXT/DOCX/PDF — no Drive dependency
  if (validated.mimeType === 'text/plain' || validated.mimeType.includes('wordprocessingml') || validated.mimeType === 'application/pdf') {
    const text = validated.mimeType === 'text/plain'
      ? new TextDecoder().decode(bytes)
      : await extractBytesLocal(validated, bytes);
    if (!text || text.trim().length < 50) {
      throw new QuizDriveError('Không đọc được nội dung tệp (tệp rỗng hoặc định dạng không đọc được)', 400, 'EmptyExtraction');
    }
    // Best-effort Drive archival (service accounts can't upload to regular shared folders)
    let uploaded = null;
    let uploadFolderId = null;
    try {
      const folder = await ensureQuizUploadsFolder(platform);
      uploaded = await uploadBytes(platform, { ...validated, bytes, folderId: folder.id });
      uploadFolderId = folder.id;
    } catch (e) {
      console.warn('[quizDrive] Drive archival skipped:', e.message);
    }
    const fileInfo = uploaded || { id: null, name: validated.name, mimeType: validated.mimeType, size: validated.size };
    return { file: fileInfo, text, uploadFolderId };
  }
  // Images (PNG/JPG): need Drive/OCR path
  const folder = await ensureQuizUploadsFolder(platform);
  const uploaded = await uploadBytes(platform, { ...validated, bytes, folderId: folder.id });
  const text = await extractBytes(platform, validated, bytes, folder.id);
  return { file: uploaded, text, uploadFolderId: folder.id };
}

export async function getDriveFileMetadata(platform, id) {
  if (!/^[A-Za-z0-9_-]{6,200}$/.test(String(id || ''))) throw new QuizDriveError('Drive file ID không hợp lệ', 400, 'InvalidFileId');
  const response = await driveRequest(platform, `/drive/v3/files/${encodeURIComponent(id)}?fields=id,name,mimeType,size,parents,webViewLink,createdTime,modifiedTime,trashed&supportsAllDrives=true`);
  return response.json();
}

function assertSupportedMetadata(file) {
  if (file.trashed) throw new QuizDriveError('Tệp Drive đã bị xóa', 404, 'DriveFileNotFound');
  const ext = sanitizeDriveFilename(file.name).match(/\.[^.]+$/)?.[0]?.toLowerCase();
  if (file.mimeType !== GOOGLE_DOC_MIME && !TYPES.has(ext)) {
    throw new QuizDriveError('Tệp Drive không thuộc định dạng hỗ trợ', 415, 'UnsupportedFileType');
  }
  if (Number(file.size || 0) > MAX_QUIZ_FILE_BYTES) throw new QuizDriveError('Tệp vượt quá giới hạn 10MB', 413, 'FileTooLarge');
}

export async function readAllowedDriveSource(platform, id) {
  const file = await getDriveFileMetadata(platform, id);
  assertSupportedMetadata(file);
  const allowed = await allowedQuizFolderIds(platform);
  const parent = (file.parents || []).find((folderId) => allowed.has(folderId));
  if (!parent) throw new QuizDriveError('Tệp không nằm trong thư mục Drive được phép', 403, 'DriveFolderForbidden');
  if (file.mimeType === GOOGLE_DOC_MIME) return { file, text: await exportGoogleDoc(platform, file.id) };
  const response = await driveRequest(platform, `/drive/v3/files/${encodeURIComponent(file.id)}?alt=media&supportsAllDrives=true`);
  const bytes = await response.arrayBuffer();
  return { file, text: await extractBytes(platform, { name: file.name, mimeType: file.mimeType }, bytes, parent) };
}

export async function listQuizDriveFiles(platform) {
  const folders = await allowedQuizFolderIds(platform);
  const files = [];
  for (const folderId of folders) {
    const q = `'${driveQuery(folderId)}' in parents and trashed = false`;
    let pageToken = '';
    let pages = 0;
    do {
      const suffix = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '';
      const response = await driveRequest(platform, `/drive/v3/files?q=${encodeURIComponent(q)}&fields=nextPageToken,files(id,name,mimeType,size,parents,webViewLink,createdTime,modifiedTime)&orderBy=modifiedTime%20desc&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true${suffix}`);
      const data = await response.json();
      files.push(...(data.files || []).filter((file) => file.mimeType !== GOOGLE_FOLDER_MIME));
      pageToken = data.nextPageToken || '';
      pages += 1;
    } while (pageToken && pages < 20);
  }
  return [...new Map(files.map((file) => [file.id, file])).values()];
}

function answerKey(text) {
  const answers = new Map();
  for (const match of String(text).matchAll(/(?:^|\n)\s*(\d{1,3})\s*[.)-]\s*([A-H])\s*(?=\n|\s|$)/gim)) answers.set(match[1], match[2].toUpperCase());
  return answers;
}

export function generateDraftQuestions(text) {
  const clean = String(text || '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').trim().slice(0, 500_000);
  if (!clean) return [];
  const keys = answerKey(clean);
  const starts = [...clean.matchAll(/(?:^|\n)\s*(\d{1,3})[.)]\s+([^\n]+)/g)];
  const questions = [];
  for (let i = 0; i < starts.length && questions.length < 100; i++) {
    const number = starts[i][1];
    if (/^[A-H]$/i.test(starts[i][2].trim())) continue;
    const block = clean.slice(starts[i].index, starts[i + 1]?.index ?? clean.length).trim().slice(0, 7000);
    const options = [...block.matchAll(/(?:^|\n|\s{2,})([A-H])[.)]\s+(.+?)(?=(?:\n|\s{2,})[A-H][.)]\s+|$)/gms)]
      .map((match) => `${match[1].toUpperCase()}. ${match[2].trim()}`);
    const firstOption = block.search(/(?:^|\n|\s{2,})[A-H][.)]\s+/m);
    const prompt = (firstOption > 0 ? block.slice(0, firstOption) : starts[i][2]).replace(/^\s*\d{1,3}[.)]\s*/, '').trim();
    if (!prompt || prompt.length > 5000) continue;
    let type = 'paragraph';
    let correct = null;
    let optionsJson = null;
    if (options.length >= 2) {
      type = 'multiple_choice'; optionsJson = JSON.stringify(options.slice(0, 8)); correct = keys.get(number) || null;
    } else if (prompt.includes('___') || /fill\s+in|điền/i.test(prompt)) {
      type = 'fill_blank'; correct = keys.get(number) || null;
    } else if (/rewrite|viết lại/i.test(prompt)) type = 'rewrite';
    questions.push({
      id: makeId('qq'), type, prompt, prompt_image_url: null, options_json: optionsJson,
      correct_answer: correct, explanation: null, points: 1, q_order: questions.length
    });
  }
  if (!questions.length) {
    const paragraphs = clean.split(/\n{2,}/).map((s) => s.trim()).filter((s) => s.length >= 20);
    for (const paragraph of paragraphs.slice(0, 20)) questions.push({
      id: makeId('qq'), type: 'paragraph', prompt: `Đọc nội dung và viết câu trả lời phù hợp:\n${paragraph.slice(0, 1500)}`,
      prompt_image_url: null, options_json: null, correct_answer: null, explanation: null, points: 1, q_order: questions.length
    });
  }
  return questions;
}

const AI_SYSTEM_PROMPT = `Bạn là trợ lý tạo đề kiểm tra tiếng Anh. Từ nội dung tài liệu người dùng cung cấp, hãy tạo 10 câu hỏi kiểm tra.

QUY TẮC:
- Ưu tiên các loại: multiple_choice (trắc nghiệm 4 lựa chọn), fill_blank (điền từ), matching (nối từ 2 cột).
- Có thể thêm paragraph (viết đoạn văn) hoặc rewrite (viết lại câu) nếu nội dung phù hợp, tối đa 2 câu mỗi loại này.
- Đáp án correct_answer phải chính xác theo nội dung tài liệu.
- Prompt viết bằng tiếng Việt nếu tài liệu là tiếng Việt, giữ nguyên tiếng Anh cho phần câu hỏi tiếng Anh.

TRẢ VỀ DUY NHẤT một JSON object đúng format sau, không thêm chữ nào khác:
{"questions": [{"type": "multiple_choice|fill_blank|matching|paragraph|rewrite", "prompt": "nội dung câu hỏi", "options": ["A. ...", "B. ..."] hoặc {"left": [...], "right": [...]}, "correct_answer": "đáp án đúng (string, hoặc object cho matching)", "explanation": "giải thích ngắn (có thể null)", "points": 1}]}

- multiple_choice: options là array 4 string, correct_answer là 1 string trùng 1 option.
- fill_blank: không có options, correct_answer là string đáp án.
- matching: options là {"left": [...], "right": [...]}, correct_answer là object {"trái": "phải"}.
- paragraph/rewrite: không có options, correct_answer là null.`;

/**
 * Dùng AI (OpenRouter / OpenAI-compatible) để sinh câu hỏi từ nội dung tài liệu.
 * Trả về array câu hỏi đã validate, hoặc null nếu chưa cấu hình / AI lỗi.
 * Env: AI_BASE_URL (mặc định https://openrouter.ai/api/v1), AI_API_KEY, AI_MODEL (mặc định deepseek/deepseek-chat).
 */
export async function generateQuestionsWithAI(text, platform) {
  const apiKey = platform?.env?.AI_API_KEY;
  if (!apiKey) return null;
  const clean = String(text || '').replace(/\r/g, '').trim().slice(0, 6000);
  if (!clean) return null;
  const baseUrl = String(platform?.env?.AI_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
  const model = platform?.env?.AI_MODEL || 'deepseek/deepseek-chat';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${String(apiKey).trim()}`,
        'HTTP-Referer': 'https://timbk.io.vn',
        'X-Title': 'timbk.io.vn Quiz Menu'
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: AI_SYSTEM_PROMPT },
          { role: 'user', content: clean }
        ],
        temperature: 0.3,
        max_tokens: 4000,
        response_format: { type: 'json_object' }
      })
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return null;
    let parsed;
    try { parsed = JSON.parse(content); } catch { return null; }
    const rawList = Array.isArray(parsed?.questions) ? parsed.questions : [];
    const questions = [];
    for (const raw of rawList.slice(0, 20)) {
      const mapped = {
        type: String(raw?.type || ''),
        prompt: String(raw?.prompt || ''),
        prompt_image_url: null,
        options_json: raw?.options === undefined || raw?.options === null ? null : JSON.stringify(raw.options),
        correct_answer: raw?.correct_answer === undefined ? null : (typeof raw.correct_answer === 'object' ? JSON.stringify(raw.correct_answer) : String(raw.correct_answer)),
        explanation: raw?.explanation ? String(raw.explanation) : null,
        points: Number(raw?.points) || 1,
        q_order: questions.length
      };
      const checked = validateQuestion(mapped, questions.length);
      if (checked.error) continue;
      questions.push({ ...checked.value, id: makeId('qq'), q_order: questions.length });
    }
    return questions.length ? questions : null;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

export async function saveQuizSourceAndDrafts(db, quizId, source, text, questions) {
  // source may be null when Drive archival was skipped — synthesize from available info
  const s = source || {};
  const metadata = {
    id: s.id || null, name: s.name || 'uploaded.txt', mime_type: s.mimeType || 'text/plain', size: Number(s.size || 0) || null,
    parents: s.parents || [], web_view_link: s.webViewLink || null,
    created_time: s.createdTime || null, modified_time: s.modifiedTime || null
  };
  const statements = [
    db.prepare(`UPDATE quizzes SET source_file_id = ?, source_file_name = ?, source_metadata_json = ?, source_text_excerpt = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`)
      .bind(metadata.id, metadata.name, JSON.stringify(metadata), String(text || '').slice(0, 4000) || null, quizId),
    db.prepare(`DELETE FROM quiz_questions WHERE quiz_id = ?`).bind(quizId)
  ];
  for (const q of questions) statements.push(db.prepare(`
    INSERT INTO quiz_questions (id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(q.id, quizId, q.type, q.prompt, q.prompt_image_url, q.options_json, q.correct_answer, q.explanation, q.points, q.q_order));
  await db.batch(statements);
  return metadata;
}

function safeDocTitle(value) {
  return sanitizeDriveFilename(String(value || 'Quiz').replace(/\.[^.]+$/, '')).slice(0, 90) || 'Quiz';
}

function displayAnswer(question) {
  if (question.correct_answer == null || question.correct_answer === '') return 'Chờ giáo viên bổ sung/chấm';
  if (typeof question.correct_answer === 'string') {
    try { return JSON.stringify(JSON.parse(question.correct_answer), null, 2); } catch { return question.correct_answer; }
  }
  return JSON.stringify(question.correct_answer, null, 2);
}

export function renderTeacherDocument(quiz, questions) {
  const lines = [
    quiz.title, '='.repeat(Math.min(80, Math.max(8, quiz.title.length))), '',
    quiz.description || '', `Thời gian: ${quiz.time_limit_minutes} phút`, `Tổng số câu: ${questions.length}`, ''
  ];
  questions.forEach((question, index) => {
    lines.push(`Câu ${index + 1} (${Number(question.points || 0)} điểm)`, question.prompt);
    let options = question.options_json;
    if (typeof options === 'string') { try { options = JSON.parse(options); } catch {} }
    if (Array.isArray(options)) lines.push(...options.map(String));
    else if (options && typeof options === 'object') lines.push(JSON.stringify(options, null, 2));
    lines.push('');
  });
  lines.push('', 'PHỤ LỤC ĐÁP ÁN DÀNH CHO GIÁO VIÊN', '====================================');
  questions.forEach((question, index) => {
    lines.push(`Câu ${index + 1}: ${displayAnswer(question)}`);
    if (question.explanation) lines.push(`Giải thích: ${question.explanation}`);
  });
  return lines.join('\n').trim();
}

async function createGoogleDoc(platform, folderId, name, text) {
  return uploadBytes(platform, {
    name, mimeType: 'text/plain', bytes: new TextEncoder().encode(text), folderId, convertToDoc: true
  });
}

async function updateGoogleDoc(platform, id, text) {
  const response = await driveRequest(platform, `/upload/drive/v3/files/${encodeURIComponent(id)}?uploadType=media&fields=id,name,mimeType,parents,webViewLink,modifiedTime&supportsAllDrives=true`, {
    method: 'PATCH', headers: { 'content-type': 'text/plain; charset=UTF-8' }, body: text
  });
  return response.json();
}

async function exportGoogleDocBytes(platform, id, mimeType) {
  const response = await driveRequest(platform, `/drive/v3/files/${encodeURIComponent(id)}/export?mimeType=${encodeURIComponent(mimeType)}`);
  return response.arrayBuffer();
}

async function loadQuizBundleInput(db, quizId) {
  const quiz = await db.prepare(`SELECT * FROM quizzes WHERE id = ? LIMIT 1`).bind(quizId).first();
  if (!quiz) throw new QuizDriveError('Không tìm thấy quiz', 404, 'QuizNotFound');
  const result = await db.prepare(`SELECT * FROM quiz_questions WHERE quiz_id = ? ORDER BY q_order, id`).bind(quizId).all();
  return { quiz, questions: result.results || [] };
}

async function bundleChecksum(quiz, questions) {
  return sha256(JSON.stringify({
    title: quiz.title, description: quiz.description || '', time_limit_minutes: Number(quiz.time_limit_minutes),
    questions: questions.map((q) => ({
      type: q.type, prompt: q.prompt, prompt_image_url: q.prompt_image_url || null,
      options_json: q.options_json || null, correct_answer: q.correct_answer ?? null,
      explanation: q.explanation || null, points: Number(q.points || 0), q_order: Number(q.q_order || 0)
    }))
  }));
}

function homeworkDraft(quiz, questions) {
  return {
    status: 'draft', quiz_id: quiz.id, title: quiz.title,
    description: quiz.description || `Hoàn thành quiz ${quiz.title}`,
    skill_type: 'reading', max_score: questions.reduce((sum, q) => sum + Number(q.points || 0), 0),
    class_id: null, class_name: null, deadline_date: null, deadline_time: null,
    publish_ready: false
  };
}

async function upsertHomeworkDraft(db, quiz, questions, bundle) {
  const id = bundle.homework_assignment_id || `hw_quiz_${quiz.id}`;
  const maxScore = questions.reduce((sum, q) => sum + Number(q.points || 0), 0);
  const description = [
    quiz.description || `Hoàn thành bài ${quiz.title}`,
    `Quiz tương tác: /quiz-menu?quiz=${encodeURIComponent(quiz.id)}`,
    bundle.google_doc_file_id ? `Google Docs: https://docs.google.com/document/d/${bundle.google_doc_file_id}/edit` : '',
    bundle.printable_docx_file_id ? `DOCX để in (Drive ID): ${bundle.printable_docx_file_id}` : ''
  ].filter(Boolean).join('\n');
  const today = new Date().toISOString().slice(0, 10);
  await db.prepare(`
    INSERT INTO homework_assignments (
      id, session_id, class_id, class_name, title, description, due_date, total_points,
      created_by, teacher_id, teacher_name, campus_id, skill_type, assigned_date,
      deadline_date, deadline_time, max_score, star_reward_on_time, status,
      source_quiz_id, source_google_doc_file_id, source_docx_file_id, source_content_revision
    ) VALUES (?, ?, '', 'Chưa chọn lớp', ?, ?, ?, ?, ?, ?, ?, 'loc_codung', 'reading', ?, ?, '18:00', ?, 50, 'draft', ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      description = excluded.description,
      total_points = excluded.total_points,
      max_score = excluded.max_score,
      source_google_doc_file_id = excluded.source_google_doc_file_id,
      source_docx_file_id = excluded.source_docx_file_id,
      source_content_revision = excluded.source_content_revision
  `).bind(
    id, `quiz:${quiz.id}`, quiz.title, description, today, maxScore,
    quiz.created_by, quiz.created_by, quiz.creator_name || 'Giáo viên', today, today,
    maxScore, quiz.id, bundle.google_doc_file_id, bundle.printable_docx_file_id, bundle.revision
  ).run();
  return id;
}

async function upsertBundle(db, data) {
  await db.prepare(`
    INSERT INTO quiz_bundles (
      quiz_id, google_doc_file_id, printable_docx_file_id, homework_assignment_id,
      homework_draft_json, revision, quiz_checksum, google_doc_modified_time,
      sync_status, last_synced_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ON CONFLICT(quiz_id) DO UPDATE SET
      google_doc_file_id = excluded.google_doc_file_id,
      printable_docx_file_id = excluded.printable_docx_file_id,
      homework_assignment_id = excluded.homework_assignment_id,
      homework_draft_json = excluded.homework_draft_json,
      revision = excluded.revision,
      quiz_checksum = excluded.quiz_checksum,
      google_doc_modified_time = excluded.google_doc_modified_time,
      sync_status = excluded.sync_status,
      last_synced_at = excluded.last_synced_at,
      updated_at = excluded.updated_at
  `).bind(
    data.quiz_id, data.google_doc_file_id, data.printable_docx_file_id, data.homework_assignment_id || null,
    JSON.stringify(data.homework_draft), data.revision, data.quiz_checksum, data.google_doc_modified_time || null, data.sync_status
  ).run();
}

async function replaceQuestions(db, quizId, questions) {
  const statements = [db.prepare(`DELETE FROM quiz_questions WHERE quiz_id = ?`).bind(quizId)];
  for (const q of questions) statements.push(db.prepare(`
    INSERT INTO quiz_questions (id, quiz_id, type, prompt, prompt_image_url, options_json, correct_answer, explanation, points, q_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(q.id, quizId, q.type, q.prompt, q.prompt_image_url, q.options_json, q.correct_answer, q.explanation, q.points, q.q_order));
  await db.batch(statements);
}

export async function inspectBundleConflict(platform, bundle) {
  if (!bundle?.google_doc_file_id || !bundle.google_doc_modified_time) return { conflict: false, metadata: null };
  const metadata = await getDriveFileMetadata(platform, bundle.google_doc_file_id);
  return { conflict: Boolean(metadata.modifiedTime && metadata.modifiedTime !== bundle.google_doc_modified_time), metadata };
}

export async function publishQuizBundle(platform, db, quizId, { force = false } = {}) {
  const previous = await db.prepare(`SELECT * FROM quiz_bundles WHERE quiz_id = ? LIMIT 1`).bind(quizId).first();
  if (previous && !force) {
    const state = await inspectBundleConflict(platform, previous);
    if (state.conflict) {
      await db.prepare(`UPDATE quiz_bundles SET sync_status = 'conflict', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE quiz_id = ?`).bind(quizId).run();
      throw new QuizDriveError('Google Doc đã được sửa sau lần đồng bộ gần nhất; hãy chọn rõ chiều đồng bộ', 409, 'BundleSyncConflict');
    }
  }
  const { quiz, questions } = await loadQuizBundleInput(db, quizId);
  if (!questions.length) throw new QuizDriveError('Quiz chưa có câu hỏi', 400, 'QuizQuestionsRequired');
  const folder = await ensureQuizUploadsFolder(platform);
  const documentText = renderTeacherDocument(quiz, questions);
  let googleDoc;
  if (previous?.google_doc_file_id) googleDoc = await updateGoogleDoc(platform, previous.google_doc_file_id, documentText);
  else googleDoc = await createGoogleDoc(platform, folder.id, `${safeDocTitle(quiz.title)} - Bản giáo viên`, documentText);
  if (previous?.printable_docx_file_id) {
    try { await removeDriveFile(platform, previous.printable_docx_file_id); } catch {}
  }
  const docxMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const docxBytes = await exportGoogleDocBytes(platform, googleDoc.id, docxMime);
  const printable = await uploadBytes(platform, {
    name: `${safeDocTitle(quiz.title)} - Bản in giáo viên.docx`, mimeType: docxMime,
    bytes: docxBytes, folderId: folder.id
  });
  const checksum = await bundleChecksum(quiz, questions);
  const revision = Number(previous?.revision || 0) + 1;
  const modified = googleDoc.modifiedTime || (await getDriveFileMetadata(platform, googleDoc.id)).modifiedTime || null;
  const data = {
    quiz_id: quizId, google_doc_file_id: googleDoc.id, printable_docx_file_id: printable.id,
    homework_assignment_id: previous?.homework_assignment_id || `hw_quiz_${quizId}`,
    homework_draft: homeworkDraft(quiz, questions), revision, quiz_checksum: checksum,
    google_doc_modified_time: modified, sync_status: 'synced'
  };
  data.homework_assignment_id = await upsertHomeworkDraft(db, quiz, questions, data);
  await upsertBundle(db, data);
  return data;
}

export async function importGoogleDocToQuizBundle(platform, db, quizId) {
  const bundle = await db.prepare(`SELECT * FROM quiz_bundles WHERE quiz_id = ? LIMIT 1`).bind(quizId).first();
  if (!bundle?.google_doc_file_id) throw new QuizDriveError('Quiz chưa có Google Doc liên kết', 404, 'BundleNotFound');
  const metadata = await getDriveFileMetadata(platform, bundle.google_doc_file_id);
  const text = await exportGoogleDoc(platform, bundle.google_doc_file_id);
  const questions = generateDraftQuestions(text);
  if (!questions.length) throw new QuizDriveError('Không tách được câu hỏi từ Google Doc', 422, 'QuestionParseFailed');
  await replaceQuestions(db, quizId, questions);
  // Google Doc là nguồn trong chiều này; chỉ làm mới DOCX/homework/checksum mà không ghi ngược Doc.
  const { quiz } = await loadQuizBundleInput(db, quizId);
  const folder = await ensureQuizUploadsFolder(platform);
  if (bundle.printable_docx_file_id) {
    try { await removeDriveFile(platform, bundle.printable_docx_file_id); } catch {}
  }
  const docxMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const docxBytes = await exportGoogleDocBytes(platform, bundle.google_doc_file_id, docxMime);
  const printable = await uploadBytes(platform, {
    name: `${safeDocTitle(quiz.title)} - Bản in giáo viên.docx`, mimeType: docxMime, bytes: docxBytes, folderId: folder.id
  });
  const current = await loadQuizBundleInput(db, quizId);
  const data = {
    quiz_id: quizId, google_doc_file_id: bundle.google_doc_file_id, printable_docx_file_id: printable.id,
    homework_assignment_id: bundle.homework_assignment_id || `hw_quiz_${quizId}`,
    homework_draft: homeworkDraft(current.quiz, current.questions), revision: Number(bundle.revision || 0) + 1,
    quiz_checksum: await bundleChecksum(current.quiz, current.questions),
    google_doc_modified_time: metadata.modifiedTime || null, sync_status: 'synced'
  };
  data.homework_assignment_id = await upsertHomeworkDraft(db, current.quiz, current.questions, data);
  await upsertBundle(db, data);
  return { ...data, imported_question_count: questions.length };
}

export async function getQuizBundle(db, quizId) {
  const row = await db.prepare(`SELECT * FROM quiz_bundles WHERE quiz_id = ? LIMIT 1`).bind(quizId).first();
  if (!row) throw new QuizDriveError('Quiz chưa có bundle DOCX', 404, 'BundleNotFound');
  return {
    ...row,
    canonical_source: 'docx',
    homework_draft: (() => { try { return JSON.parse(row.homework_draft_json || '{}'); } catch { return {}; } })(),
    homework_draft_json: undefined,
    google_doc_url: row.google_doc_file_id ? `https://docs.google.com/document/d/${row.google_doc_file_id}/edit` : null,
    quiz_url: `/quiz-menu?quiz=${encodeURIComponent(quizId)}`
  };
}

export async function publishBundleHomework(db, quizId, user, input) {
  const bundle = await db.prepare(`SELECT * FROM quiz_bundles WHERE quiz_id = ? LIMIT 1`).bind(quizId).first();
  if (!bundle?.homework_assignment_id) throw new QuizDriveError('Bundle chưa có bài tập nháp', 404, 'HomeworkDraftNotFound');
  const sessionId = String(input.session_id || '').trim();
  const classId = String(input.class_id || '').trim();
  const className = String(input.class_name || classId).trim();
  const deadlineDate = String(input.deadline_date || '').trim();
  const deadlineTime = String(input.deadline_time || '18:00').trim();
  if (!sessionId || !classId || !className || !/^\d{4}-\d{2}-\d{2}$/.test(deadlineDate) || !/^\d{2}:\d{2}$/.test(deadlineTime)) {
    throw new QuizDriveError('Cần chọn lớp, buổi học và hạn nộp hợp lệ', 400, 'HomeworkPublishFieldsRequired');
  }
  const assignment = await db.prepare(`SELECT * FROM homework_assignments WHERE id = ? LIMIT 1`).bind(bundle.homework_assignment_id).first();
  if (!assignment) throw new QuizDriveError('Không tìm thấy bài tập nháp trong D1', 404, 'HomeworkDraftNotFound');
  if (assignment.status === 'published') return assignment;

  const students = await db.prepare(`SELECT user_id FROM class_enrollments WHERE class_id = ? AND status = 'active'`).bind(classId).all();
  const parents = await db.prepare(`
    SELECT DISTINCT psl.parent_user_id
    FROM parent_student_links psl JOIN class_enrollments ce ON ce.user_id = psl.student_user_id
    WHERE psl.verification_status = 'verified' AND ce.class_id = ? AND ce.status = 'active'
  `).bind(classId).all();
  const teacherName = String(user.name || user.username || assignment.teacher_name || 'Giáo viên').slice(0, 150);
  const statements = [db.prepare(`
    UPDATE homework_assignments SET session_id = ?, class_id = ?, class_name = ?, teacher_id = ?, teacher_name = ?,
      deadline_date = ?, deadline_time = ?, due_date = ?, status = 'published'
    WHERE id = ? AND status = 'draft'
  `).bind(sessionId, classId, className, user.id, teacherName, deadlineDate, deadlineTime, deadlineDate, assignment.id)];
  for (const student of students.results || []) statements.push(db.prepare(`
    INSERT INTO system_notifications (id, target_role, target_user_id, title, body, category, reference_id)
    VALUES (?, 'student', ?, ?, ?, 'homework', ?) ON CONFLICT(id) DO NOTHING
  `).bind(`notif_hw_${assignment.id}_s_${student.user_id}`, student.user_id, `📚 BTVN mới: ${assignment.title}`, `Hạn nộp ${deadlineTime} ngày ${deadlineDate}.`, assignment.id));
  for (const parent of parents.results || []) statements.push(db.prepare(`
    INSERT INTO system_notifications (id, target_role, target_user_id, title, body, category, reference_id)
    VALUES (?, 'parent', ?, ?, ?, 'homework', ?) ON CONFLICT(id) DO NOTHING
  `).bind(`notif_hw_${assignment.id}_p_${parent.parent_user_id}`, parent.parent_user_id, `📚 BTVN mới: ${assignment.title}`, `Lớp ${className}, hạn nộp ${deadlineTime} ngày ${deadlineDate}.`, assignment.id));
  await db.batch(statements);
  return db.prepare(`SELECT * FROM homework_assignments WHERE id = ?`).bind(assignment.id).first();
}
