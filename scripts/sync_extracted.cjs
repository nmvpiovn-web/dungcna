const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

let accessToken = "ya29.a0AX07Cmttco0FKzJZxe5LQslb_qqf0f2UFr-0g18wJg8BG0bIHVez3MBruIkhrmcRmwN5jePbbU5QpwQVLr-fYrjAiNBy4sdLgyIJh8vO73WJXc9pY5M_lfPan_zQD3ls2Bp65uqt-WkziZuACw_aPsR-zmEgd-MnOjecxbfpx27cRIr0N9y0QKfDRRjRxxP2gJ3w8mgaCgYKAfMSARUSFQHGX2MiU_FkUhK7heH7cn-lKnwgpQ0206";
const REFRESH_TOKEN = "1//04Y4v87xTV-lxCgYIARAAGAQSNwF-L9IrzYXhYPuuLhtugYHIP14AcfdwLX5-mQHdoo4IYSP4y-gDDVPpQyUCSCUJ27GWfs-I1Zg";
let tokenExpiresAt = Date.now() + 3500 * 1000;

const ROOT_FOLDER_ID = "1_V4YUCuTJ4uui49S6AfcaI8lZmIszKou";

const STATE_FILE = path.join(__dirname, 'extracted_sync_state.json');
const CATALOG_FILE = path.join(__dirname, 'catalog.json');
const TEMP_BASE_DIR = path.join(process.env.TEMP, 'giaoandethi_extract');
const UNRAR_PATH = "C:\\Program Files\\WinRAR\\UnRAR.exe";

async function getValidToken() {
  if (Date.now() > tokenExpiresAt - 5 * 60 * 1000) {
    console.log('[Auth] Refreshing Google Drive access token...');
    try {
      const res = await fetch('https://developers.google.com/oauthplayground/refreshAccessToken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token_uri: 'https://oauth2.googleapis.com/token',
          refresh_token: REFRESH_TOKEN
        })
      });
      const data = await res.json();
      if (data.access_token) {
        accessToken = data.access_token;
        tokenExpiresAt = Date.now() + (data.expires_in || 3600) * 1000;
        console.log('[Auth] Token refreshed successfully!');
      }
    } catch (e) {
      console.error('[Auth] Token refresh error:', e.message);
    }
  }
  return accessToken;
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
        body: body
      });
      if (res.status === 401) {
        await getValidToken();
        attempts++;
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
    body: JSON.stringify({ parents: [folderId] })
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
    const res = await fetch(targetUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return null;
    const html = await res.text();
    const m = html.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
    return m ? m[1] : null;
  } catch (e) {
    return null;
  }
}

function extractSingleArchive(archivePath, destDir) {
  const isZip = archivePath.toLowerCase().endsWith('.zip');
  if (isZip) {
    try {
      execSync(`powershell -NoProfile -Command "Expand-Archive -LiteralPath '${archivePath}' -DestinationPath '${destDir}' -Force"`, { stdio: 'pipe' });
      return;
    } catch (zipErr) {
      try {
        execSync(`tar -xf "${archivePath}" -C "${destDir}"`, { stdio: 'pipe' });
        return;
      } catch (e2) {
        throw zipErr;
      }
    }
  }

  // RAR
  try {
    execSync(`"${UNRAR_PATH}" x -y -p- "${archivePath}" "${destDir}\\"`, { stdio: 'pipe' });
  } catch (unrarErr) {
    try {
      execSync(`"${UNRAR_PATH}" x -y -predlog "${archivePath}" "${destDir}\\"`, { stdio: 'pipe' });
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
  if (state.synced[post.title]) {
    return;
  }

  let fileId = post.directFileId;
  if (!fileId && post.targetUrl) {
    fileId = await extractDriveFileId(post.targetUrl);
  }

  if (!fileId) {
    state.failed[post.title] = 'No Google Drive link found';
    saveState(state);
    return;
  }

  const catName = determineCategory(post.title, post.categories);
  const targetFolderId = await getOrCreateFolder(catName, ROOT_FOLDER_ID, state);

  // 1. Check file metadata
  let meta = null;
  const token = await getValidToken();
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
    state.failed[post.title] = meta;
    saveState(state);
    return;
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
    return;
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
    // Download
    const downRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` }
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
  console.log(`======================================================\n`);

  for (let i = 0; i < posts.length; i++) {
    await processPost(posts[i], i + 1, posts.length, state);
    await new Promise(r => setTimeout(r, 200));
  }

  console.log("\n=== PIPELINE 100% FINISHED ===");
}

main().catch(console.error);
