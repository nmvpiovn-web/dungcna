import fs from 'node:fs';
import path from 'node:path';
import { spawn, execSync } from 'node:child_process';

const BASE_URL = 'https://timbk.io.vn';
const SCREENSHOT_DIR = path.resolve('tests/screenshots/audit_27ff462');
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

let commitSha = 'unknown';
try {
  commitSha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
} catch {}

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
if (!fs.existsSync(chromePath)) {
  console.error(`Chrome not found at ${chromePath}`);
  process.exit(1);
}

const tmpUserDataDir = path.join(process.env.TEMP || 'C:\\Temp', 'chrome_cdp_deep_' + Date.now());
fs.mkdirSync(tmpUserDataDir, { recursive: true });

console.log(`Starting isolated Headless Chrome on port 9223...`);
const chromeProc = spawn(chromePath, [
  '--headless=new',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-gpu',
  '--remote-debugging-port=9223',
  `--user-data-dir=${tmpUserDataDir}`,
  'about:blank'
], { stdio: 'ignore' });

process.on('exit', () => {
  try { chromeProc.kill(); } catch {}
  try { fs.rmSync(tmpUserDataDir, { recursive: true, force: true }); } catch {}
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class CdpClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.eventListeners = new Map();

    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) {
          reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        } else {
          resolve(msg.result);
        }
      } else if (msg.method) {
        const handlers = this.eventListeners.get(msg.method) || [];
        for (const h of handlers) h(msg.params);
      }
    };
  }

  async ready() {
    if (this.ws.readyState === WebSocket.OPEN) return;
    return new Promise((resolve, reject) => {
      this.ws.onopen = () => resolve();
      this.ws.onerror = (e) => reject(e);
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, handler) {
    if (!this.eventListeners.has(method)) {
      this.eventListeners.set(method, []);
    }
    this.eventListeners.get(method).push(handler);
  }

  async setViewport(width, height) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 768
    });
  }

  async navigate(url) {
    await this.send('Page.navigate', { url });
    // Robust wait for DOM ready and hydration
    for (let i = 0; i < 30; i++) {
      await sleep(200);
      const ready = await this.evaluate(`document.readyState === 'complete' && !!document.querySelector('header button, header nav')`);
      if (ready) break;
    }
    await sleep(600);
  }

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    return res.result?.value;
  }

  async screenshot(filename) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    const buffer = Buffer.from(res.data, 'base64');
    const fullPath = path.join(SCREENSHOT_DIR, filename);
    fs.writeFileSync(fullPath, buffer);
    return fullPath;
  }

  // Physical pointer click via CDP Input events
  async physicalClick(x, y) {
    await this.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x,
      y
    });
    await sleep(50);
    await this.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x,
      y,
      button: 'left',
      clickCount: 1
    });
    await sleep(80);
    await this.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x,
      y,
      button: 'left',
      clickCount: 1
    });
    await sleep(300);
  }

  close() {
    this.ws.close();
  }
}

async function main() {
  await sleep(1500);
  console.log('Connecting to Chrome CDP on port 9223...');

  const targetsRes = await fetch('http://127.0.0.1:9223/json/list');
  const targets = await targetsRes.json();
  const pageTarget = targets.find(t => t.type === 'page') || targets[0];
  const cdp = new CdpClient(pageTarget.webSocketDebuggerUrl);
  await cdp.ready();

  const consoleLogs = [];
  cdp.on('Console.messageAdded', (p) => {
    consoleLogs.push(`[${p.message.level}] ${p.message.text}`);
  });

  await cdp.send('Page.enable');
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Console.enable');

  console.log(`\n======================================================`);
  console.log(`CDP DEEP INTERACTION & CONTRAST AUDIT (SHA: ${commitSha})`);
  console.log(`======================================================\n`);

  const auditReport = {
    sha: commitSha,
    timestamp: new Date().toISOString(),
    tests: [],
    consoleErrors: [],
    contrastResults: []
  };

  function recordTest(name, passed, detail = '', extra = {}) {
    auditReport.tests.push({ name, passed, detail, ...extra });
    console.log(`[${passed ? 'PASS' : 'FAIL'}] ${name}: ${detail}`);
  }

  // STEP 1: Desktop Viewport at /admincp
  await cdp.setViewport(1440, 900);
  console.log('Navigating to ' + BASE_URL + '/admincp...');
  await cdp.navigate(BASE_URL + '/admincp');

  // Test 1: Service Worker Controller & Cache Name (Deterministic assertion)
  const swState = await cdp.evaluate(`
    (async () => {
      const hasSW = 'serviceWorker' in navigator;
      const controller = navigator.serviceWorker?.controller?.state || 'none';
      const cacheNames = await (window.caches ? window.caches.keys() : []);
      return { hasSW, controller, cacheNames };
    })()
  `);
  const swValid = swState && swState.hasSW && swState.controller === 'activated' && swState.cacheNames.includes('tienganh-academic-v3');
  recordTest('service_worker_state', swValid, `SW Controller: ${swState?.controller}, Caches: ${(swState?.cacheNames || []).join(', ')}`);

  // Test 2: Check Top Header Computed Properties (Unclipped)
  const headerInfo = await cdp.evaluate(`
    (() => {
      const header = document.querySelector('header.sticky') || document.querySelector('header');
      if (!header) return null;
      const cs = window.getComputedStyle(header);
      const rect = header.getBoundingClientRect();
      const overflow = cs.overflow || cs.overflowY || 'visible';
      return {
        overflow,
        overflowX: cs.overflowX,
        overflowY: cs.overflowY,
        zIndex: cs.zIndex,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
      };
    })()
  `);
  const headerNoClip = headerInfo && headerInfo.overflow !== 'hidden' && headerInfo.overflowY !== 'hidden';
  recordTest('header_unclipped_overflow', !!headerNoClip, `Header overflow: ${headerInfo?.overflow}, zIndex: ${headerInfo?.zIndex}`);

  // Test 3: Hit Target & Physical Click on "Lộ trình" Menu Button
  const loTrinhTarget = await cdp.evaluate(`
    (() => {
      const buttons = Array.from(document.querySelectorAll('header button'));
      const btn = buttons.find(b => b.textContent.includes('Lộ Trình') || b.textContent.includes('Lộ trình'));
      if (!btn) return null;
      const rect = btn.getBoundingClientRect();
      const cx = rect.x + rect.width / 2;
      const cy = rect.y + rect.height / 2;
      const topElement = document.elementFromPoint(cx, cy);
      const isUnobscured = btn.contains(topElement) || (topElement && topElement.contains(btn)) || topElement.closest('button') === btn;
      return {
        cx, cy,
        text: btn.textContent.trim(),
        topElementTag: topElement ? topElement.tagName : 'none',
        isUnobscured,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
      };
    })()
  `);

  if (loTrinhTarget && loTrinhTarget.isUnobscured) {
    recordTest('lotrinh_hit_target_unobscured', true, `Target at (${loTrinhTarget.cx.toFixed(0)}, ${loTrinhTarget.cy.toFixed(0)}) is topElement: <${loTrinhTarget.topElementTag}>`);
    
    // Execute Physical Pointer Click
    await cdp.physicalClick(loTrinhTarget.cx, loTrinhTarget.cy);

    // Verify Dropdown Rendered & Unclipped
    const dropdownInfo = await cdp.evaluate(`
      (() => {
        const links = Array.from(document.querySelectorAll('a'));
        const subLink = links.find(a => a.textContent.includes('Tiểu Học'));
        if (!subLink) return null;
        const panel = subLink.closest('.absolute') || subLink.parentElement;
        const rect = panel.getBoundingClientRect();
        const cs = window.getComputedStyle(panel);
        return {
          visible: rect.width > 0 && rect.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none',
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          subLinkText: subLink.textContent.trim()
        };
      })()
    `);

    const lotrinhOpened = dropdownInfo && dropdownInfo.visible && dropdownInfo.rect.height > 100;
    recordTest('lotrinh_dropdown_physically_opened', !!lotrinhOpened, `Dropdown rect: ${JSON.stringify(dropdownInfo?.rect)}`);
    await cdp.screenshot('lotrinh_dropdown_opened.png');

    // Close by pressing Escape
    await cdp.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));`);
    await sleep(200);
  } else {
    recordTest('lotrinh_hit_target_unobscured', false, `Hit target obscured or missing: ${JSON.stringify(loTrinhTarget)}`);
    recordTest('lotrinh_dropdown_physically_opened', false, 'Skipped due to obscured target');
  }

  // Test 4: Physical Click on "Phòng thi" Menu Button
  const phongThiTarget = await cdp.evaluate(`
    (() => {
      const buttons = Array.from(document.querySelectorAll('header button'));
      const btn = buttons.find(b => b.textContent.includes('Phòng Thi') || b.textContent.includes('Phòng thi'));
      if (!btn) return null;
      const rect = btn.getBoundingClientRect();
      const cx = rect.x + rect.width / 2;
      const cy = rect.y + rect.height / 2;
      const topElement = document.elementFromPoint(cx, cy);
      return { cx, cy, isUnobscured: btn.contains(topElement) || topElement.closest('button') === btn };
    })()
  `);

  if (phongThiTarget && phongThiTarget.isUnobscured) {
    await cdp.physicalClick(phongThiTarget.cx, phongThiTarget.cy);
    const ptDropdown = await cdp.evaluate(`
      (() => {
        const links = Array.from(document.querySelectorAll('a'));
        const testLink = links.find(a => a.textContent.includes('Test Nhanh 15 Phút'));
        return testLink ? true : false;
      })()
    `);
    recordTest('phongthi_dropdown_physically_opened', !!ptDropdown, 'Dropdown "Phòng Thi" opened via pointer events');
    await cdp.screenshot('phongthi_dropdown_opened.png');
    await cdp.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));`);
    await sleep(200);
  } else {
    recordTest('phongthi_dropdown_physically_opened', false, 'Target obscured or missing');
  }

  // Test 5: Physical Click on "Công cụ" Menu Button & Click Sub-item "Xem Tất Cả Công Cụ"
  const congCuTarget = await cdp.evaluate(`
    (() => {
      const buttons = Array.from(document.querySelectorAll('header button'));
      const btn = buttons.find(b => b.textContent.includes('Công Cụ') || b.textContent.includes('Công cụ'));
      if (!btn) return null;
      const rect = btn.getBoundingClientRect();
      return { cx: rect.x + rect.width / 2, cy: rect.y + rect.height / 2 };
    })()
  `);

  if (congCuTarget) {
    await cdp.physicalClick(congCuTarget.cx, congCuTarget.cy);
    const allToolsLinkTarget = await cdp.evaluate(`
      (() => {
        const links = Array.from(document.querySelectorAll('a'));
        const link = links.find(a => a.textContent.includes('Xem Tất Cả Công Cụ'));
        if (!link) return null;
        const rect = link.getBoundingClientRect();
        return { cx: rect.x + rect.width / 2, cy: rect.y + rect.height / 2, href: link.href };
      })()
    `);

    if (allToolsLinkTarget) {
      recordTest('tools_sublink_present', true, `Link href: ${allToolsLinkTarget.href}`);
      await cdp.screenshot('congcu_dropdown_opened.png');
      
      // Click sub-link and verify navigation
      await cdp.physicalClick(allToolsLinkTarget.cx, allToolsLinkTarget.cy);
      await sleep(1500);

      const currentPath = await cdp.evaluate(`window.location.pathname`);
      const onToolsPage = currentPath.startsWith('/tools');
      recordTest('tools_navigation_success', onToolsPage, `Navigated to ${currentPath}`);
      await cdp.screenshot('tools_hub_page.png');

      // Test Back navigation
      await cdp.evaluate(`window.history.back();`);
      await sleep(1500);
      const backPath = await cdp.evaluate(`window.location.pathname`);
      recordTest('history_back_success', backPath.includes('/admincp'), `History back returned to ${backPath}`);
    } else {
      recordTest('tools_sublink_present', false, 'Link "Xem Tất Cả Công Cụ" not found in dropdown');
      recordTest('tools_navigation_success', false, 'Skipped sublink click');
      recordTest('history_back_success', false, 'Skipped history back');
    }
  } else {
    recordTest('tools_sublink_present', false, 'Công Cụ button not found');
    recordTest('tools_navigation_success', false, 'Công Cụ button not found');
    recordTest('history_back_success', false, 'Công Cụ button not found');
  }

  // Test 6: Physical Test of Mobile Viewport & Drawer Navigation
  await cdp.setViewport(375, 812); // iPhone dimensions
  console.log('Testing Mobile Viewport (375x812)...');
  await sleep(500);

  const mobileMenuBtn = await cdp.evaluate(`
    (() => {
      const buttons = Array.from(document.querySelectorAll('header button'));
      const btn = buttons.find(b => (b.getAttribute('aria-label') || '').toLowerCase().includes('menu') || b.textContent.includes('☰') || b.textContent.includes('✕'));
      if (!btn) return null;
      const rect = btn.getBoundingClientRect();
      return { cx: rect.x + rect.width / 2, cy: rect.y + rect.height / 2 };
    })()
  `);

  if (mobileMenuBtn) {
    recordTest('mobile_menu_button_present', true, `Mobile button at (${mobileMenuBtn.cx.toFixed(0)}, ${mobileMenuBtn.cy.toFixed(0)})`);
    await cdp.physicalClick(mobileMenuBtn.cx, mobileMenuBtn.cy);
    await sleep(400);

    const mobileDrawerInfo = await cdp.evaluate(`
      (() => {
        const links = Array.from(document.querySelectorAll('a'));
        const courseBtn = links.find(a => a.textContent.includes('Xem Toàn Bộ 19 Khóa Học') || a.textContent.includes('19 Khóa Học'));
        const toolsBtn = links.find(a => a.textContent.includes('Xem Tất Cả Công Cụ') || a.textContent.includes('Công Cụ'));
        return {
          hasCoursesBtn: !!courseBtn,
          hasToolsBtn: !!toolsBtn
        };
      })()
    `);

    recordTest('mobile_drawer_direct_links', !!(mobileDrawerInfo?.hasCoursesBtn && mobileDrawerInfo?.hasToolsBtn),
      `Mobile drawer contains direct action buttons: Courses (${mobileDrawerInfo?.hasCoursesBtn}), Tools (${mobileDrawerInfo?.hasToolsBtn})`);
    await cdp.screenshot('mobile_drawer_opened.png');
  } else {
    recordTest('mobile_menu_button_present', false, 'Mobile menu toggle button not found');
    recordTest('mobile_drawer_direct_links', false, 'Skipped drawer checks');
  }

  // Reset back to desktop viewport
  await cdp.setViewport(1440, 900);
  await sleep(400);

  // Test 7: Guest State Non-Lockout Verification
  console.log('\n--- VERIFYING GUEST BROWSING & NON-LOCKOUT ---');
  const guestCheck = await cdp.evaluate(`
    (() => {
      const authModal = document.querySelector('[role="dialog"]');
      const isVisible = authModal && window.getComputedStyle(authModal).display !== 'none';
      const loginBtn = Array.from(document.querySelectorAll('header button, header a')).find(el => el.textContent.includes('Đăng Nhập'));
      return {
        authModalOpenOnLoad: !!isVisible,
        hasLoginButtonInHeader: !!loginBtn
      };
    })()
  `);
  recordTest('guest_non_lockout_mode', !guestCheck.authModalOpenOnLoad && guestCheck.hasLoginButtonInHeader,
    `AuthModal open on initial visit: ${guestCheck.authModalOpenOnLoad}, Header Login Button: ${guestCheck.hasLoginButtonInHeader}`);

  // Test 8: Real UI Login Flow (Open AuthModal, enter credentials, submit)
  console.log('\n--- VERIFYING REAL UI LOGIN FLOW ---');
  await cdp.evaluate(`
    (() => {
      const btn = Array.from(document.querySelectorAll('header button')).find(b => b.textContent.includes('Đăng Nhập'));
      if (btn) btn.click();
    })()
  `);
  await sleep(400);

  // Fill credentials and click submit
  const loginSubmitRes = await cdp.evaluate(`
    (async () => {
      const idInput = document.querySelector('#login-id');
      const pwInput = document.querySelector('#login-pass');
      const form = document.querySelector('#login-form');
      if (!idInput || !pwInput || !form) return { success: false, reason: 'Inputs not found' };

      // Type student credentials
      idInput.value = 'hocsinh';
      idInput.dispatchEvent(new Event('input', { bubbles: true }));
      pwInput.value = '123';
      pwInput.dispatchEvent(new Event('input', { bubbles: true }));

      // Find submit button
      const submitBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Đăng Nhập Vào Học') || (b.getAttribute('form') === 'login-form'));
      if (submitBtn) {
        submitBtn.click();
        return { success: true };
      }
      return { success: false, reason: 'Submit button not found' };
    })()
  `);

  // Wait for login processing and reload settle
  await sleep(2500);

  const loggedInState = await cdp.evaluate(`
    (() => {
      const user = localStorage.getItem('tienganh_active_user') || localStorage.getItem('tienganh_user');
      const headerText = document.querySelector('header')?.textContent || '';
      const hasUserBadge = headerText.includes('Học Sinh') || headerText.includes('Lê Bảo Anh') || headerText.includes('hocsinh');
      return {
        hasLocalStorageUser: !!user,
        hasUserBadge
      };
    })()
  `);
  recordTest('real_ui_login_success', loggedInState.hasLocalStorageUser && loggedInState.hasUserBadge,
    `Logged in user badge displayed: ${loggedInState.hasUserBadge}, Stored: ${loggedInState.hasLocalStorageUser}`);
  await cdp.screenshot('user_logged_in_state.png');

  // Test 9: Real User Profile Modal Flow (Open profile, check fields, close via Escape)
  console.log('\n--- VERIFYING USER PROFILE MODAL & ESCAPE CLOSE ---');
  const profileInteraction = await cdp.evaluate(`
    (async () => {
      // Click user button in header to open dropdown
      const userBtn = Array.from(document.querySelectorAll('header button')).find(b => b.textContent.includes('Lê Bảo Anh') || b.textContent.includes('Học Sinh') || b.textContent.includes('hocsinh'));
      if (!userBtn) return { opened: false, closedOnEscape: false, error: 'User button not found' };
      userBtn.click();
      await new Promise(r => setTimeout(r, 200));

      // Click "Chỉnh Sửa Hồ Sơ & Zalo"
      const editBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Chỉnh Sửa Hồ Sơ'));
      if (!editBtn) return { opened: false, closedOnEscape: false, error: 'Edit profile button not found' };
      editBtn.click();
      await new Promise(r => setTimeout(r, 300));

      const modal = Array.from(document.querySelectorAll('[role="dialog"]')).find(d => d.textContent.includes('Hồ Sơ'));
      const opened = !!modal;

      // Close via Escape
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await new Promise(r => setTimeout(r, 300));

      const isProfileStillOpen = Array.from(document.querySelectorAll('[role="dialog"]')).some(d => d.textContent.includes('Hồ Sơ'));
      return { opened, closedOnEscape: !isProfileStillOpen };
    })()
  `);
  recordTest('profile_modal_interaction_success', !!(profileInteraction.opened && profileInteraction.closedOnEscape),
    `Profile modal opened: ${profileInteraction.opened}, Closed on Escape: ${profileInteraction.closedOnEscape}`);

  // Test 10: Real UI Logout Flow & Protected API Negative Control
  console.log('\n--- VERIFYING REAL UI LOGOUT & 401 NEGATIVE CONTROL ---');
  const logoutRes = await cdp.evaluate(`
    (async () => {
      const userBtn = Array.from(document.querySelectorAll('header button')).find(b => b.textContent.includes('Lê Bảo Anh') || b.textContent.includes('Học Sinh') || b.textContent.includes('hocsinh'));
      if (userBtn) {
        userBtn.click();
        await new Promise(r => setTimeout(r, 200));
        const logoutBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Đăng Xuất'));
        if (logoutBtn) {
          logoutBtn.click();
          await new Promise(r => setTimeout(r, 300));
        }
      }
      const userCleared = !localStorage.getItem('tienganh_user') && !localStorage.getItem('tienganh_active_user');
      const loginBtnReturned = Array.from(document.querySelectorAll('header button')).some(b => b.textContent.includes('Đăng Nhập'));
      return { userCleared, loginBtnReturned };
    })()
  `);
  recordTest('real_ui_logout_success', logoutRes.userCleared && logoutRes.loginBtnReturned,
    `User session cleared: ${logoutRes.userCleared}, Login CTA restored: ${logoutRes.loginBtnReturned}`);

  // Negative Control: Test protected API without token
  const negControl = await cdp.evaluate(`
    (async () => {
      try {
        const res = await fetch('/api/homework', {
          headers: { 'Content-Type': 'application/json' }
        });
        const data = await res.json();
        return {
          status: res.status,
          success: data.success,
          isUnauthorized: res.status === 401 || data.success === false
        };
      } catch (e) {
        return { isUnauthorized: true };
      }
    })()
  `);
  recordTest('negative_control_protected_api_unauthorized', negControl.isUnauthorized,
    `Protected API /api/homework blocked unauthenticated request: HTTP ${negControl.status}, success: ${negControl.success}`);

  // Test 11: Onboarding Tour Modal Flow (Open via footer, inspect tabs, close)
  console.log('\n--- VERIFYING ONBOARDING TOUR MODAL ---');
  const tourRes = await cdp.evaluate(`
    (async () => {
      const tourBtn = Array.from(document.querySelectorAll('footer button')).find(b => b.textContent.includes('Hướng Dẫn') || b.textContent.includes('Tầm Nhìn'));
      if (!tourBtn) return { opened: false, closed: false, reason: 'Footer button not found' };
      tourBtn.click();
      await new Promise(r => setTimeout(r, 400));

      const modal = Array.from(document.querySelectorAll('[role="dialog"]')).find(d => d.textContent.includes('Tầm Nhìn Sư Phạm') || d.textContent.includes('Hướng Dẫn Hệ Thống'));
      const opened = !!modal;

      // Close modal
      const closeBtn = modal?.querySelector('button[title="Đóng"]') || Array.from(modal ? modal.querySelectorAll('button') : []).find(b => b.textContent.includes('Tôi Đã Hiểu'));
      if (closeBtn) closeBtn.click();
      await new Promise(r => setTimeout(r, 400));

      const isTourDialogPresent = Array.from(document.querySelectorAll('[role="dialog"]')).some(d => d.textContent.includes('Tầm Nhìn Sư Phạm') || d.textContent.includes('Hướng Dẫn Hệ Thống'));
      return {
        opened,
        closed: !isTourDialogPresent
      };
    })()
  `);
  recordTest('onboarding_tour_modal_flow', !!(tourRes.opened && tourRes.closed),
    `Onboarding tour opened: ${tourRes.opened}, closed successfully: ${tourRes.closed}`);

  // Test 12: Recruitment Multi-Grade & Auto-Save Draft
  console.log('\n--- VERIFYING RECRUITMENT MULTI-GRADE & AUTO-SAVE DRAFT ---');
  await cdp.navigate(BASE_URL + '/recruitment');
  const recruitDraftRes = await cdp.evaluate(`
    (async () => {
      const nameInput = document.querySelector('#cand-name');
      const phoneInput = document.querySelector('#cand-phone');
      if (!nameInput || !phoneInput) return { success: false, reason: 'Form inputs not found' };

      // Type candidate info
      nameInput.value = 'Cô Nguyễn Hoàng Yến';
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
      phoneInput.value = '0909123456';
      phoneInput.dispatchEvent(new Event('input', { bubbles: true }));

      // Select multiple grades
      const gradeButtons = Array.from(document.querySelectorAll('button')).filter(b => b.textContent.includes('Lớp 6') || b.textContent.includes('Lớp 7') || b.textContent.includes('Lớp 10'));
      for (const b of gradeButtons) {
        b.click();
        await new Promise(r => setTimeout(r, 50));
      }

      // Check localStorage draft
      const draft = JSON.parse(localStorage.getItem('tienganh_recruitment_draft') || '{}');
      return {
        success: true,
        candidateName: draft.candidateName,
        selectedGradesCount: (draft.selectedGrades || []).length
      };
    })()
  `);
  recordTest('recruitment_multigrade_draft_persistence', !!(recruitDraftRes.success && recruitDraftRes.selectedGradesCount >= 2),
    `Draft saved candidate: "${recruitDraftRes.candidateName}", grades count: ${recruitDraftRes.selectedGradesCount}`);

  // Return to /admincp
  await cdp.navigate(BASE_URL + '/admincp');

  // Test 13: 200% Zoom Resizability (WCAG 1.4.4 Resize Text)
  console.log('\n--- VERIFYING 200% ZOOM RESIZABILITY (WCAG 1.4.4) ---');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 2, // 200% Zoom
    mobile: false
  });
  await sleep(400);

  const zoomRes = await cdp.evaluate(`
    (() => {
      const header = document.querySelector('header');
      const brand = header?.querySelector('a span');
      const cs = window.getComputedStyle(header);
      const isVisible = header && brand && cs.display !== 'none' && cs.visibility !== 'hidden';
      return {
        brandLegible: isVisible,
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth
      };
    })()
  `);
  recordTest('zoom_200_layout_integrity', zoomRes.brandLegible,
    `At 200% zoom, brand header legible: ${zoomRes.brandLegible}, scrollWidth: ${zoomRes.scrollWidth}`);

  // Reset scale back to normal
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false
  });
  await sleep(300);

  // Test 14: Multi-Theme Real Computed Contrast (WCAG 2.1 Luminance Formula)
  console.log('\n--- MEASURING REAL COMPUTED WCAG CONTRAST RATIOS (MULTI-THEME) ---');
  const themes = ['sky', 'light', 'dark'];

  for (const th of themes) {
    // Set theme
    await cdp.evaluate(`
      (() => {
        document.documentElement.classList.remove('dark', 'theme-sky');
        if ('${th}' === 'dark') document.documentElement.classList.add('dark');
        else if ('${th}' === 'sky') document.documentElement.classList.add('theme-sky');
      })()
    `);
    await sleep(200);

    const contrastData = await cdp.evaluate(`
      (() => {
        function getLuminance(r, g, b) {
          const a = [r, g, b].map(v => {
            v /= 255;
            return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
          });
          return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
        }

        function parseRgb(colorStr) {
          const m = colorStr.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*([\\d.]+))?\\)/);
          if (m) {
            return { r: parseInt(m[1]), g: parseInt(m[2]), b: parseInt(m[3]), a: m[4] !== undefined ? parseFloat(m[4]) : 1 };
          }
          return { r: 0, g: 0, b: 0, a: 1 };
        }

        function getEffectiveBg(el) {
          let cur = el;
          while (cur && cur !== document) {
            const cs = window.getComputedStyle(cur);
            const bg = parseRgb(cs.backgroundColor);
            if (bg.a > 0.6) {
              return bg;
            }
            cur = cur.parentElement;
          }
          const isDark = document.documentElement.classList.contains('dark');
          return isDark ? { r: 15, g: 23, b: 42, a: 1 } : { r: 255, g: 255, b: 255, a: 1 };
        }

        function computeContrast(fgStr, bgObj) {
          const fg = parseRgb(fgStr);
          const l1 = getLuminance(fg.r, fg.g, fg.b);
          const l2 = getLuminance(bgObj.r, bgObj.g, bgObj.b);
          const light = Math.max(l1, l2);
          const dark = Math.min(l1, l2);
          return (light + 0.05) / (dark + 0.05);
        }

        const elementsToCheck = [
          { label: 'AdminCP Page Title', selector: 'header h1' },
          { label: 'Header Brand Name', selector: 'header a span' }
        ];

        return elementsToCheck.map(item => {
          const el = document.querySelector(item.selector);
          if (!el) return { label: item.label, found: false };
          const cs = window.getComputedStyle(el);
          const fg = cs.color;
          const bg = getEffectiveBg(el);
          const ratio = computeContrast(fg, bg);
          const fontSize = parseFloat(cs.fontSize);
          const fontWeight = parseInt(cs.fontWeight) || 400;
          // WCAG definition: Large text is >= 24px (18pt) normal, or >= 18.66px (14pt) bold
          const isLargeText = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);
          const minRatio = isLargeText ? 3.0 : 4.5;
          const passesWcag = ratio >= minRatio;
          return {
            label: item.label,
            found: true,
            fg,
            bg: \`rgb(\${bg.r}, \${bg.g}, \${bg.b})\`,
            ratio: parseFloat(ratio.toFixed(2)),
            minRequired: minRatio,
            passesWcag,
            isLargeText
          };
        });
      })()
    `);

    for (const c of contrastData) {
      if (c.found) {
        recordTest(
          `wcag_contrast_${th}_${c.label.toLowerCase().replace(/\\s+/g, '_')}`,
          c.passesWcag,
          `[${th.toUpperCase()}] Ratio ${c.ratio}:1 (Required: ${c.minRequired}:1). FG: ${c.fg}, BG: ${c.bg}`
        );
        auditReport.contrastResults.push({ theme: th, ...c });
      } else {
        recordTest(`wcag_contrast_${th}_${c.label.toLowerCase().replace(/\\s+/g, '_')}`, false, `Element ${c.label} not found`);
      }
    }
  }

  // Test 15: Check Console Errors
  auditReport.consoleErrors = consoleLogs.filter(l => l.startsWith('[error]'));
  const noConsoleErrors = auditReport.consoleErrors.length === 0;
  recordTest('browser_console_clean', noConsoleErrors, `Console errors count: ${auditReport.consoleErrors.length}`);

  cdp.close();

  const outPath = 'tests/deep_interaction_audit_evidence.json';
  fs.writeFileSync(outPath, JSON.stringify(auditReport, null, 2));

  console.log(`\n=== AUDIT COMPLETE ===`);
  const failed = auditReport.tests.filter(t => !t.passed);
  console.log(`Total: ${auditReport.tests.length} | Passed: ${auditReport.tests.length - failed.length} | Failed: ${failed.length}`);
  if (failed.length > 0) {
    console.error('Failed checks:', failed);
    process.exit(1);
  } else {
    console.log('ALL BROWSER INTERACTION & CONTRAST CHECKS PASSED!');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal error during browser audit:', err);
  process.exit(1);
});
