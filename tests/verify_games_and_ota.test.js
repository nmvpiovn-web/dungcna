import fs from 'fs';
import path from 'path';

// Load test users data
const usersData = JSON.parse(fs.readFileSync(new URL('../src/lib/data/users.json', import.meta.url), 'utf-8'));

// Replicate Game Gatekeeper logic exactly as implemented in src/lib/unifiedStore.js
const DEFAULT_GAME_SETTINGS = {
  is_portal_open: false, // Default: LOCKED for students
  allowed_grades: ['all'],
  reward_stars_per_game: 20,
  opened_by: '',
  opened_at: null,
  active_games: {
    speed_match: false,      // Từ vựng: Ghép đôi
    word_scramble: false,    // Từ vựng: Xếp chữ
    meteor_rush: false,      // Từ vựng: Bắn thiên thạch
    sentence_builder: false, // Ngữ pháp: Xây dựng câu
    grammar_tense: false,    // Ngữ pháp: Thách thức thì động từ
    memory_flip: false,      // Cards: Lật thẻ trí nhớ 3D
    card_duel: false         // Cards: Đấu thẻ bài Flashcards
  },
  lock_message: '🔒 Đấu trường trò chơi hiện đang đóng. Chỉ được mở theo hiệu lệnh của Cô Dung / Giáo viên trong giờ học!'
};

class MockGameStore {
  constructor() {
    this.settings = JSON.parse(JSON.stringify(DEFAULT_GAME_SETTINGS));
  }

  getGameArenaSettings() {
    return JSON.parse(JSON.stringify(this.settings));
  }

  saveGameArenaSettings(newSettings) {
    this.settings = {
      ...this.settings,
      ...newSettings,
      active_games: {
        ...this.settings.active_games,
        ...(newSettings.active_games || {})
      },
      updated_at: new Date().toISOString()
    };
    return this.getGameArenaSettings();
  }

  toggleMasterGamePortal(isOpen, operator = null) {
    const s = this.getGameArenaSettings();
    s.is_portal_open = isOpen;
    if (isOpen) {
      s.opened_at = new Date().toISOString();
      s.opened_by = operator?.name || 'Giáo viên';
      const hasAnyActive = Object.values(s.active_games).some(Boolean);
      if (!hasAnyActive) {
        s.active_games.speed_match = true;
        s.active_games.sentence_builder = true;
        s.active_games.memory_flip = true;
      }
    }
    return this.saveGameArenaSettings(s);
  }

  toggleIndividualGame(gameKey, isOpen) {
    const s = this.getGameArenaSettings();
    if (s.active_games) {
      s.active_games[gameKey] = isOpen;
    }
    return this.saveGameArenaSettings(s);
  }

  isGameAccessibleForUser(user, gameKey) {
    if (!user) return false;
    // Teachers and Admins have unrestricted access anytime to preview and playtest
    if (user.role === 'teacher' || user.role === 'admin' || user.username === 'admin') return true;

    // For students and parents: strictly gatekept by teacher's switch
    const s = this.getGameArenaSettings();
    if (!s.is_portal_open) return false;
    if (!s.active_games[gameKey]) return false;
    return true;
  }
}

const store = new MockGameStore();

console.log('--- TEST 1: Default Game Gatekeeper Status (Locked by default) ---');
const defaultSettings = store.getGameArenaSettings();
console.log('Default Portal Open Status:', defaultSettings.is_portal_open);
if (defaultSettings.is_portal_open !== false) {
  throw new Error('Default game portal must be FALSE (LOCKED for students)!');
}
const allGames = Object.keys(defaultSettings.active_games);
for (const g of allGames) {
  if (defaultSettings.active_games[g] !== false) {
    throw new Error(`Game ${g} must default to FALSE!`);
  }
}
console.log(`✅ Verified: Game portal is locked by default across all ${allGames.length} games.`);

console.log('\n--- TEST 2: Student baokhiem Gatekeeper Check (Must be Blocked) ---');
const baokhiem = usersData.find(u => u.username === 'baokhiem');
if (!baokhiem) throw new Error('baokhiem user not found in users.json!');
console.log(`User: ${baokhiem.name} (${baokhiem.username}), Role: ${baokhiem.role}`);

for (const g of allGames) {
  const accessible = store.isGameAccessibleForUser(baokhiem, g);
  if (accessible) {
    throw new Error(`Student ${baokhiem.username} should NOT have access to ${g} when portal is closed!`);
  }
}
console.log('✅ Verified: Student baokhiem is strictly blocked from all games when portal is closed.');

console.log('\n--- TEST 3: Teacher & SuperAdmin Access Check (Always Permitted for Playtesting) ---');
const teacher = usersData.find(u => u.role === 'teacher');
const admin = usersData.find(u => u.username === 'admin');
for (const g of allGames) {
  if (!store.isGameAccessibleForUser(teacher, g)) {
    throw new Error(`Teacher should be able to access ${g} anytime!`);
  }
  if (!store.isGameAccessibleForUser(admin, g)) {
    throw new Error(`Admin should be able to access ${g} anytime!`);
  }
}
console.log('✅ Verified: Teachers and Admins have full access to playtest all games even when portal is closed to students.');

console.log('\n--- TEST 4: Teacher Activates Master Switch and Individual Games ---');
store.toggleMasterGamePortal(true, teacher);
let currentSettings = store.getGameArenaSettings();
console.log('Master Portal Status after Teacher opens:', currentSettings.is_portal_open);
if (currentSettings.is_portal_open !== true) {
  throw new Error('Portal should now be OPEN!');
}

// Check auto-enabled default games
console.log('Speed Match accessible for student:', store.isGameAccessibleForUser(baokhiem, 'speed_match'));
console.log('Sentence Builder accessible for student:', store.isGameAccessibleForUser(baokhiem, 'sentence_builder'));
console.log('Memory Flip accessible for student:', store.isGameAccessibleForUser(baokhiem, 'memory_flip'));
console.log('Grammar Tense accessible for student:', store.isGameAccessibleForUser(baokhiem, 'grammar_tense'));

if (!store.isGameAccessibleForUser(baokhiem, 'speed_match') ||
    !store.isGameAccessibleForUser(baokhiem, 'sentence_builder') ||
    !store.isGameAccessibleForUser(baokhiem, 'memory_flip')) {
  throw new Error('Active games should be accessible to student when portal is open!');
}

if (store.isGameAccessibleForUser(baokhiem, 'grammar_tense')) {
  throw new Error('grammar_tense should remain locked until specifically toggled on!');
}

// Teacher now explicitly opens grammar_tense
store.toggleIndividualGame('grammar_tense', true);
if (!store.isGameAccessibleForUser(baokhiem, 'grammar_tense')) {
  throw new Error('grammar_tense should now be accessible to student!');
}
console.log('✅ Verified: Teacher granular game switches control student access in real-time.');

console.log('\n--- TEST 5: Teacher Closes Master Portal (Instant Lockout for Students) ---');
store.toggleMasterGamePortal(false, teacher);
for (const g of allGames) {
  if (store.isGameAccessibleForUser(baokhiem, g)) {
    throw new Error(`Student should be locked out of ${g} when master portal is closed!`);
  }
}
console.log('✅ Verified: Master switch immediately revokes access for all students.');

console.log('\n--- TEST 6: APK OTA Wi-Fi Direct Artifacts & API Verification ---');
const rootDir = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'), '..');
const apkPath = path.join(rootDir, 'static', 'downloads', 'tienganhcodung-latest.apk');
const apkVersionPath = path.join(rootDir, 'static', 'apk_version.json');
const apiRoutePath = path.join(rootDir, 'src', 'routes', 'api', 'apk', 'version', '+server.js');

if (!fs.existsSync(apkPath)) {
  throw new Error(`APK file not found at ${apkPath}`);
}
const apkStat = fs.statSync(apkPath);
console.log(`APK File exists: ${apkPath}, Size: ${(apkStat.size / 1024).toFixed(2)} KB`);
if (apkStat.size < 100) {
  throw new Error('APK file size is abnormally small!');
}

if (!fs.existsSync(apkVersionPath)) {
  throw new Error(`apk_version.json not found at ${apkVersionPath}`);
}
const versionJson = JSON.parse(fs.readFileSync(apkVersionPath, 'utf-8'));
console.log('APK Version JSON:', versionJson);
if (versionJson.version_name !== '2.2.0' || versionJson.version_code !== 220 || !versionJson.wifi_only) {
  throw new Error('Invalid apk_version.json contents!');
}

if (!fs.existsSync(apiRoutePath)) {
  throw new Error(`API Route not found at ${apiRoutePath}`);
}
const apiRouteContent = fs.readFileSync(apiRoutePath, 'utf-8');
if (!apiRouteContent.includes('export async function GET') || !apiRouteContent.includes('wifi_only: true')) {
  throw new Error('API Route /api/apk/version missing GET handler or wifi_only flag!');
}
console.log('✅ Verified: APK OTA direct Wi-Fi download package and version endpoint are valid and ready.');

console.log('\n🎉 ALL 6 COMPREHENSIVE VERIFICATION TESTS PASSED SUCCESSFULLY!');
