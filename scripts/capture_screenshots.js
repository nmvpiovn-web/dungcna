import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const outDir = path.resolve('tests/visual_evidence');

const targets = [
  { name: 'home_desktop_1440', url: 'http://127.0.0.1:5173/', width: 1440, height: 900 },
  { name: 'home_tablet_768', url: 'http://127.0.0.1:5173/', width: 768, height: 1024 },
  { name: 'home_mobile_390', url: 'http://127.0.0.1:5173/', width: 390, height: 844 },
  { name: 'cpanel_student_desktop_1440', url: 'http://127.0.0.1:5173/cpanel/student', width: 1440, height: 900 },
  { name: 'cpanel_student_mobile_390', url: 'http://127.0.0.1:5173/cpanel/student', width: 390, height: 844 },
  { name: 'cpanel_teacher_desktop_1440', url: 'http://127.0.0.1:5173/cpanel/teacher', width: 1440, height: 900 },
  { name: 'cpanel_teacher_mobile_390', url: 'http://127.0.0.1:5173/cpanel/teacher', width: 390, height: 844 },
  { name: 'cpanel_parent_desktop_1440', url: 'http://127.0.0.1:5173/cpanel/parent', width: 1440, height: 900 },
  { name: 'cpanel_parent_mobile_390', url: 'http://127.0.0.1:5173/cpanel/parent', width: 390, height: 844 },
  { name: 'cpanel_leader_desktop_1440', url: 'http://127.0.0.1:5173/cpanel/leader', width: 1440, height: 900 },
  { name: 'cpanel_leader_mobile_390', url: 'http://127.0.0.1:5173/cpanel/leader', width: 390, height: 844 },
  { name: 'cpanel_notifications_desktop_1440', url: 'http://127.0.0.1:5173/cpanel/notifications', width: 1440, height: 900 },
  { name: 'cpanel_notifications_mobile_390', url: 'http://127.0.0.1:5173/cpanel/notifications', width: 390, height: 844 }
];

console.log('Capturing complete visual catalog...');
for (const t of targets) {
  const outFile = path.join(outDir, `${t.name}.png`);
  const cmd = `"${chromePath}" --headless=new --disable-gpu --no-sandbox --window-size=${t.width},${t.height} --screenshot="${outFile}" "${t.url}"`;
  try {
    execSync(cmd, { timeout: 15000, stdio: 'pipe' });
    const stat = fs.statSync(outFile);
    console.log(`✓ Captured ${t.name}.png (${stat.size} bytes)`);
  } catch (err) {
    console.error(`✗ Failed to capture ${t.name}:`, err.message);
  }
}
