const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const TOKEN_FILE = path.join(__dirname, 'gdrive_token.json');
const STATE_FILE = path.join(__dirname, 'extracted_sync_state.json');
const CATALOG_FILE = path.join(__dirname, 'catalog.json');
const TEMP_BASE_DIR = path.join(process.env.TEMP, 'giaoandethi_extract');
const UNRAR_PATH = "C:\\Program Files\\WinRAR\\UnRAR.exe";
const ROOT_FOLDER_ID = "1_V4YUCuTJ4uui49S6AfcaI8lZmIszKou";

let currentAccessToken = "";
let currentRefreshToken = "";
let tokenExpiresAt = Date.now() + 3500 * 1000;

function loadTokenConfig() {
  if (fs.existsSync(TOKEN_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
      if (data.access_token) currentAccessToken = data.access_token;
      if (data.refresh_token) currentRefreshToken = data.refresh_token;
    } catch (e) {}
  }
}

async function getValidToken() {
  loadTokenConfig();
  if (Date.now() > tokenExpiresAt - 5 * 60 * 1000 && currentRefreshToken) {
    try {
      const res = await fetch('https://developers.google.com/oauthplayground/refreshAccessToken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token_uri: 'https://oauth2.googleapis.com/token',
          refresh_token: currentRefreshToken
        })
      });
      const data = await res.json();
      if (data.access_token) {
        currentAccessToken = data.access_token;
        tokenExpiresAt = Date.now() + (data.expires_in || 3600) * 1000;
        console.log('[Auth] Token refreshed successfully!');
        fs.writeFileSync(TOKEN_FILE, JSON.stringify({
          access_token: currentAccessToken,
          refresh_token: currentRefreshToken,
          updated_at: new Date().toISOString()
        }, null, 2));
      }
    } catch (e) {
      console.error('[Auth] Token refresh error:', e.message);
    }
  }
  return currentAccessToken;
}

function loadState() {
  if (fs.existsSync(STATE_FILE)) {
    try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch (e) {}
  }
  return { folders: {}, synced: {}, failed: {} };
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

async function getOrCreateFolder(name, parentId, state) {
  if (state.folders[name]) return state.folders[name];
  const token = await getValidToken();
  console.log(`[Drive] Creating subfolder: ${name}...`);
  try {
    const res = await fetch("https://www.googleapis.com/drive/v3/files", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: name,
        mimeType: "application/vnd.google-apps.folder",
        parents: [parentId]
      })
    });
    const data = await res.json();
    if (data.id) {
      state.folders[name] = data.id;
      saveState(state);
      return data.id;
    }
  } catch (e) {
    console.error(`[Drive] Failed to create folder ${name}:`, e.message);
  }
  return parentId;
}

function determineCategory(title, categories) {
  const combined = (title + " " + (categories || []).join(" ")).toLowerCase();
  for (let i = 12; i >= 1; i--) {
    if (combined.includes(`lớp ${i}`) || combined.includes(`khối ${i}`) || combined.includes(`tiếng anh ${i}`) || combined.includes(`ta${i}`) || combined.includes(` ${i} `)) {
      return `Tiếng Anh Lớp ${i}`;
    }
  }
  if (combined.includes('hsg') || combined.includes('học sinh giỏi') || combined.includes('chuyên đề')) {
    return 'Chuyên Đề & HSG';
  }
  if (combined.includes('worksheet')) {
    return 'Worksheets';
  }
  return 'Tài Liệu Chung';
}

async function uploadFileToDrive(filePath, fileName, folderId) {
  const token = await getValidToken();
  const fileContent = fs.readFileSync(filePath);
  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const close_delim = `\r\n--${boundary}--`;

  const metadata = {
    name: fileName,
    parents: [folderId]
  };

  const metaPart = Buffer.from(
    `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}${delimiter}Content-Type: application/octet-stream\r\n\r\n`
  );
  const closePart = Buffer.from(close_delim);
  const body = Buffer.concat([metaPart, fileContent, closePart]);

  let attempts = 0;
  while (attempts < 3) {
    try {
      const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`
        },
        body: body,
        signal: AbortSignal.timeout(60000)
      });
      if (res.status === 401) {
        console.error('[Upload] Token 401 Unauthorized!');
        attempts++;
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      return await res.json();
    } catch (e) {
      attempts++;
      await new Promise(r => setTimeout(r, 1000 * attempts));
    }
  }
  return { error: 'Upload failed after 3 attempts' };
}

async function copyFileToDrive(fileId, folderId) {
  const token = await getValidToken();
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/copy`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ parents: [folderId] }),
    signal: AbortSignal.timeout(20000)
  });
  return await res.json();
}

function getAllFilesRecursively(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      getAllFilesRecursively(fullPath, fileList);
    } else {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

async function extractDriveFileId(targetUrl) {
  if (!targetUrl) return null;
  try {
    const res = await fetch(targetUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(12000)
    });
    if (!res.ok) return null;
    const html = await res.text();
    const m = html.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|drive\/folders\/)([a-zA-Z0-9_-]+)/);
    return m ? m[1] : null;
  } catch (e) {
    return null;
  }
}

function extractSingleArchive(archivePath, destDir) {
  const isZip = archivePath.toLowerCase().endsWith('.zip');
  const timeoutMs = 40000; // 40 seconds timeout max per extraction

  if (isZip) {
    // 1. Try native tar.exe (fastest, never prompts)
    try {
      execSync(`tar -xf "${archivePath}" -C "${destDir}"`, { stdio: 'pipe', timeout: timeoutMs });
      return;
    } catch (tarErr) {
      // 2. Try WinRAR UnRAR
      try {
        execSync(`"${UNRAR_PATH}" x -y -p- "${archivePath}" "${destDir}\\"`, { stdio: 'pipe', timeout: timeoutMs });
        return;
      } catch (unrarErr) {
        // 3. Fallback to PowerShell Expand-Archive
        try {
          execSync(`powershell -NoProfile -Command "Expand-Archive -LiteralPath '${archivePath}' -DestinationPath '${destDir}' -Force"`, { stdio: 'pipe', timeout: timeoutMs });
          return;
        } catch (psErr) {
          throw psErr;
        }
      }
    }
  }

  // RAR
  try {
    execSync(`"${UNRAR_PATH}" x -y -p- "${archivePath}" "${destDir}\\"`, { stdio: 'pipe', timeout: timeoutMs });
  } catch (unrarErr) {
    try {
      execSync(`"${UNRAR_PATH}" x -y -predlog "${archivePath}" "${destDir}\\"`, { stdio: 'pipe', timeout: timeoutMs });
    } catch (pwErr) {
      throw pwErr;
    }
  }
}

function extractArchiveRecursively(initialArchive, extractDir) {
  extractSingleArchive(initialArchive, extractDir);
  try { fs.unlinkSync(initialArchive); } catch (e) {}

  // Recursively extract any nested archives
  for (let round = 0; round < 5; round++) {
    const allFiles = getAllFilesRecursively(extractDir);
    const nested = allFiles.filter(f => {
      const ext = path.extname(f).toLowerCase();
      return ext === '.zip' || ext === '.rar' || ext === '.7z';
    });
    if (nested.length === 0) break;

    for (let i = 0; i < nested.length; i++) {
      const n = nested[i];
      const pDir = path.dirname(n);
      const nExt = path.extname(n) || '.zip';
      const safePath = path.join(pDir, `nested_${round}_${i}${nExt}`);
      try {
        fs.renameSync(n, safePath);
        extractSingleArchive(safePath, pDir);
        fs.unlinkSync(safePath);
      } catch (e) {
        try { fs.unlinkSync(n); } catch (e2) {}
      }
    }
  }
}

async function uploadFilesConcurrently(filePaths, folderId, concurrency = 5) {
  const uploadedList = [];
  const queue = [...filePaths];
  async function worker() {
    while (queue.length > 0) {
      const fPath = queue.shift();
      const baseName = path.basename(fPath);
      try {
        const upRes = await uploadFileToDrive(fPath, baseName, folderId);
        if (upRes.id) uploadedList.push(upRes.name);
      } catch (e) {
        console.error(`Upload error for ${baseName}:`, e.message);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return uploadedList;
}

async function processPost(post, index, total, state) {
  // FAST SKIP if already processed (synced or failed)
  if (state.synced[post.title] || state.failed[post.title]) {
    return false;
  }

  console.log(`[${index}/${total}] Scanning: ${post.title.substring(0, 50)}...`);

  let fileId = post.directFileId;
  if (!fileId && post.targetUrl) {
    fileId = await extractDriveFileId(post.targetUrl);
  }

  if (!fileId) {
    console.log(`[${index}/${total}] -> No Google Drive link found`);
    state.failed[post.title] = 'No Google Drive link found';
    saveState(state);
    return true;
  }

  const catName = determineCategory(post.title, post.categories);
  const targetFolderId = await getOrCreateFolder(catName, ROOT_FOLDER_ID, state);

  // 1. Check file metadata
  let meta = null;
  const token = await getValidToken();
  if (!token) {
    console.error(`[CRITICAL] Missing valid Google Drive token. Pausing pipeline.`);
    throw new Error('NO_TOKEN');
  }

  try {
    const metaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,size`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    meta = await metaRes.json();
  } catch (e) {
    console.error(`[${index}/${total}] Failed to get meta for ${post.title}`);
    return;
  }

  if (!meta || !meta.name) {
    state.failed[post.title] = meta ? (meta.error?.message || 'Empty metadata') : 'Fetch error';
    saveState(state);
    return true;
  }

  if (meta.mimeType === 'application/vnd.google-apps.folder') {
    console.log(`[${index}/${total}] [${catName}] Item is a Google Drive folder (skip direct copy): ${meta.name}`);
    state.failed[post.title] = 'Google Drive folder (cannot copy directly)';
    saveState(state);
    return true;
  }

  const fileName = meta.name;
  const isArchive = fileName.endsWith('.rar') || fileName.endsWith('.zip') || fileName.endsWith('.7z');

  // If not an archive, simply copy directly
  if (!isArchive) {
    const copyRes = await copyFileToDrive(fileId, targetFolderId);
    if (copyRes.id) {
      console.log(`[${index}/${total}] [${catName}] Copied: ${copyRes.name}`);
      state.synced[post.title] = { id: copyRes.id, name: copyRes.name, type: 'direct_copy' };
    } else {
      console.log(`[${index}/${total}] [${catName}] Copy failed: ${fileName}`);
      state.failed[post.title] = copyRes;
    }
    saveState(state);
    return true;
  }

  // It is an archive -> Download, extract, upload extracted files
  console.log(`[${index}/${total}] [${catName}] Unpacking archive: ${fileName}...`);
  const workDir = path.join(TEMP_BASE_DIR, `job_${Date.now()}_${Math.random().toString(36).substring(7)}`);
  fs.mkdirSync(workDir, { recursive: true });

  const ext = path.extname(fileName) || '.rar';
  const archivePath = path.join(workDir, `input_archive${ext}`);
  const extractDir = path.join(workDir, 'extracted');
  fs.mkdirSync(extractDir, { recursive: true });

  try {
    // Check file size limit (skip archives > 1.5GB to prevent memory out of range)
    if (meta.size && parseInt(meta.size) > 1500 * 1024 * 1024) {
      console.log(`[${index}/${total}] File size too large (${meta.size} bytes). Direct copying instead.`);
      const copyRes = await copyFileToDrive(fileId, targetFolderId);
      state.synced[post.title] = { id: copyRes.id, name: copyRes.name, type: 'direct_copy_large' };
      saveState(state);
      return;
    }

    // Download
    const downRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(60000)
    });
    const buffer = Buffer.from(await downRes.arrayBuffer());
    fs.writeFileSync(archivePath, buffer);

    // Extract recursively
    extractArchiveRecursively(archivePath, extractDir);

    // Get all extracted files
    const extractedFiles = getAllFilesRecursively(extractDir);

    const validFiles = extractedFiles.filter(fPath => {
      const baseName = path.basename(fPath);
      return baseName !== 'desktop.ini' && !baseName.startsWith('._') && !fPath.includes('__MACOSX');
    });

    if (validFiles.length === 0) {
      console.log(`[${index}/${total}] Warning: No valid files extracted from ${fileName}`);
      state.failed[post.title] = 'Archive empty or extraction failed';
      saveState(state);
      return;
    }

    // If multiple files, create a specific folder for this post title
    let destFolderId = targetFolderId;
    if (validFiles.length > 1) {
      const cleanTitle = post.title.replace(/[\\/:*?"<>|]/g, '-').trim();
      destFolderId = await getOrCreateFolder(cleanTitle, targetFolderId, state);
    }

    // Parallel upload with concurrency of 5
    const uploadedList = await uploadFilesConcurrently(validFiles, destFolderId, 5);

    console.log(`[${index}/${total}] [${catName}] Extracted & uploaded ${uploadedList.length} files: ${uploadedList.slice(0, 3).join(', ')}${uploadedList.length > 3 ? '...' : ''}`);
    state.synced[post.title] = { name: fileName, extractedCount: uploadedList.length, files: uploadedList };
    saveState(state);

  } catch (err) {
    console.error(`[${index}/${total}] Extraction error on ${fileName}:`, err.message);
    state.failed[post.title] = err.message;
    saveState(state);
  } finally {
    try {
      fs.rmSync(workDir, { recursive: true, force: true });
    } catch (e) {}
  }
}

async function main() {
  if (!fs.existsSync(TEMP_BASE_DIR)) fs.mkdirSync(TEMP_BASE_DIR, { recursive: true });

  const state = loadState();
  if (!fs.existsSync(CATALOG_FILE)) {
    console.error("Missing catalog.json. Run fetchAllPosts first.");
    return;
  }
  const posts = JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf8'));

  console.log(`\n======================================================`);
  console.log(`   STARTING AUTO-EXTRACT & MULTI-THREAD UPLOAD`);
  console.log(`   Total Catalog Posts: ${posts.length}`);
  console.log(`   Already Synced: ${Object.keys(state.synced || {}).length}`);
  console.log(`======================================================\n`);

  for (let i = 0; i < posts.length; i++) {
    try {
      const processed = await processPost(posts[i], i + 1, posts.length, state);
      if (processed) {
        await new Promise(r => setTimeout(r, 100));
      }
    } catch (err) {
      if (err.message === 'NO_TOKEN') {
        console.error('Pipeline stopped: Waiting for valid Google Drive OAuth token.');
        process.exit(2);
      }
    }
  }

  console.log("\n=== PIPELINE 100% FINISHED ===");
}

main().catch(console.error);
