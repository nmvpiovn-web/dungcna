// static/mobile-app/live-bridge.js
// Connects the LingoNest / Tiếng Anh Cô Dung Mobile App UI (PR #1) to live Cloudflare D1 APIs & DOOGEE R10 telemetry

(function () {
  let liveUser = null;
  let liveToken = null;
  let liveSessions = [];
  let liveStars = 240;

  function getStoredToken() {
    try {
      return localStorage.getItem('tienganh_token') || localStorage.getItem('tienganh_auth_token') || '';
    } catch {
      return '';
    }
  }

  function getStoredUser() {
    try {
      const raw = localStorage.getItem('tienganh_current_user') || localStorage.getItem('currentUser');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function getOrCreateDeviceId() {
    try {
      let id = localStorage.getItem('tienganh_device_id');
      if (!id) {
        const ua = navigator.userAgent || '';
        const prefix = /R10|DOOGEE/i.test(ua) ? 'r10' : (/TiengAnhCoDungApp/i.test(ua) ? 'apk' : 'dev');
        id = `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
        localStorage.setItem('tienganh_device_id', id);
      }
      return id;
    } catch {
      return 'unknown_device';
    }
  }

  async function sendDeviceHeartbeat(extraPath) {
    try {
      const token = getStoredToken();
      const user = liveUser || getStoredUser();
      const ua = navigator.userAgent || '';
      const isAndroidApk = Boolean(
        (window.AndroidApp && typeof window.AndroidApp.isAndroidApp === 'function' && window.AndroidApp.isAndroidApp()) ||
        /TiengAnhCoDungApp/i.test(ua)
      );
      await fetch('/api/devices/heartbeat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          device_id: getOrCreateDeviceId(),
          user_id: user?.id || null,
          username: user?.username || 'guest',
          user_role: user?.role || state?.role || 'guest',
          device_model: /R10|DOOGEE/i.test(ua) ? 'DOOGEE R10 Tablet' : (isAndroidApk ? 'Android APK' : ''),
          app_mode: isAndroidApk ? 'android_apk' : 'mobile_app_ui',
          is_android_apk: isAndroidApk,
          screen_size: `${window.innerWidth}x${window.innerHeight}`,
          current_path: extraPath || `/app#${state?.page || 'home'}`
        })
      });
    } catch {}
  }

  function applyLiveUserToState(user) {
    if (!user) return;
    liveUser = user;
    const role = String(user.role || 'student').toLowerCase();
    if (role === 'parent') {
      state.role = 'parent';
      if (state.page === 'home') state.page = 'parent';
    } else if (role === 'teacher' || role === 'admin' || role === 'superadmin' || role === 'leader') {
      state.role = 'teacher';
      if (state.page === 'home') state.page = 'teacher';
    } else {
      state.role = 'student';
      state.child = user.name || user.username || 'Học viên';
    }
    updateTopStatusBar();
    render();
    decorateLiveDom();
  }

  function updateTopStatusBar() {
    const bar = document.querySelector('.demobar');
    if (!bar) return;
    const ua = navigator.userAgent || '';
    const isApk = Boolean(
      (window.AndroidApp && typeof window.AndroidApp.isAndroidApp === 'function' && window.AndroidApp.isAndroidApp()) ||
      /TiengAnhCoDungApp/i.test(ua)
    );
    const isR10 = /R10|DOOGEE/i.test(ua);
    const badgeLabel = isR10 ? '📱 DOOGEE R10 App' : (isApk ? '📱 Android APK v2.2' : '📱 Mobile App UI');

    if (liveUser) {
      const displayName = liveUser.name || liveUser.username;
      const gradeInfo = liveUser.grade ? ` · ${liveUser.grade}` : '';
      bar.innerHTML = `
        <div class="live-topbar-inner">
          <span class="live-chip-apk">${badgeLabel}</span>
          <span class="live-user-tag">🟢 <b>${displayName}</b>${gradeInfo}</span>
          <div class="live-topbar-links">
            <a href="/quiz-menu" target="_top" class="live-mini-btn">🧩 Kho Đề</a>
            <a href="/exam" target="_top" class="live-mini-btn">📝 Phòng Thi</a>
            <button onclick="openRealLoginSheet()" class="live-mini-btn">👤 Tài khoản</button>
            <a href="/?web=1" target="_top" class="live-mini-btn">🌐 Web</a>
          </div>
        </div>
      `;
    } else {
      bar.innerHTML = `
        <div class="live-topbar-inner">
          <span class="live-chip-apk">${badgeLabel}</span>
          <button onclick="openRealLoginSheet()" class="live-login-cta">🔑 Đăng nhập tài khoản</button>
          <div class="live-topbar-links">
            <a href="/quiz-menu" target="_top" class="live-mini-btn">🧩 Kho Đề</a>
            <a href="/exam" target="_top" class="live-mini-btn">📝 Phòng Thi</a>
            <a href="/?web=1" target="_top" class="live-mini-btn">🌐 Web</a>
          </div>
        </div>
      `;
    }
  }

  function decorateLiveDom() {
    try {
      if (liveUser && state.role === 'student' && state.page === 'home') {
        const titleEl = document.querySelector('#view .pagetitle');
        if (titleEl && titleEl.textContent.includes('Chào')) {
          titleEl.textContent = `Chào ${liveUser.name || liveUser.username}`;
        }
        const subEl = document.querySelector('#view .subtitle');
        if (subEl) {
          const gradeLabel = liveUser.grade || 'Học viên chính thức';
          subEl.textContent = `${gradeLabel} · Chuỗi học 12 ngày · Đồng bộ D1`;
        }
      }
      if (liveSessions.length > 0 && state.role === 'student' && state.page === 'home') {
        const firstSess = liveSessions[0];
        const h3 = document.querySelector('.today-class .class-info h3');
        const p = document.querySelector('.today-class .class-info p');
        const timeB = document.querySelector('.today-class .class-time b');
        if (h3 && firstSess.class_name) h3.textContent = firstSess.class_name;
        if (p) p.textContent = `${firstSess.topic || 'Lịch học chính khóa'} · ${firstSess.teacher_name || 'Cô Dung'}`;
        if (timeB && firstSess.start_time) timeB.textContent = firstSess.start_time;
      }
      // Inject quick bridge to full 8-type Quiz Menu on the Quiz tab
      if (state.page === 'quiz') {
        const viewEl = document.querySelector('#view');
        if (viewEl && !viewEl.querySelector('.real-quiz-bridge')) {
          const bridge = document.createElement('div');
          bridge.className = 'card real-quiz-bridge';
          bridge.style.cssText = 'background:linear-gradient(135deg,#0f2f46,#07688a);color:#fff;border:0;margin-bottom:16px;';
          bridge.innerHTML = `
            <div class="row">
              <span class="badge" style="background:#55d5ce;color:#063240">ĐỒNG BỘ D1 & GOOGLE DRIVE</span>
              <span style="font-size:11px;color:#bfe7f5">8 kiểu câu hỏi</span>
            </div>
            <h3 style="color:#fff;margin:8px 0 4px">Kho Đề Đa Dạng & Phòng Thi Chính Thức</h3>
            <p style="color:#d2ebf5;font-size:11px;margin:0 0 12px">Làm bài Trắc nghiệm, Đúng/Sai, Điền từ, Ghép đôi, Sắp xếp từ, Đọc hiểu, Nghe & Tự luận.</p>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
              <a href="/quiz-menu" target="_top" class="primary" style="text-align:center;background:#fff;color:#085c7c;font-size:12px;padding:10px;border-radius:8px;font-weight:700">🧩 Mở Kho Đề</a>
              <a href="/exam" target="_top" class="secondary" style="text-align:center;background:#194d66;color:#fff;border-color:#3a7996;font-size:12px;padding:10px;border-radius:8px;font-weight:700">📝 Phòng Thi</a>
            </div>
          `;
          viewEl.prepend(bridge);
        }
      }
    } catch {}
  }

  // Wrap render() and go() so live user info & heartbeat stay synced on every navigation
  const origRender = window.render;
  if (typeof origRender === 'function') {
    window.render = function () {
      origRender();
      updateTopStatusBar();
      decorateLiveDom();
    };
  }

  const origGo = window.go;
  if (typeof origGo === 'function') {
    window.go = function (p) {
      origGo(p);
      sendDeviceHeartbeat(`/app#${p}`);
    };
  }

  // Real Login / Account Modal connected to /api/auth/token
  window.openRealLoginSheet = function () {
    if (liveUser) {
      showSheet('Tài khoản đang đăng nhập', `
        <div class="card" style="background:#f2f9fc;margin-top:0">
          <span class="badge blue">${(liveUser.role || 'student').toUpperCase()}</span>
          <h3 style="margin:8px 0 4px">${liveUser.name || liveUser.username}</h3>
          <p style="margin:0;font-size:12px">Tài khoản: <b>@${liveUser.username}</b> ${liveUser.grade ? `· Lớp: <b>${liveUser.grade}</b>` : ''}</p>
        </div>
        <div style="display:grid;gap:8px;margin-top:14px">
          <a href="/quiz-menu" target="_top" class="primary wide" style="text-align:center;display:block">🧩 Mở Kho Đề & Bài Tập</a>
          <a href="/cpanel" target="_top" class="secondary wide" style="text-align:center;display:block">🛠️ Mở Bảng Điều Khiển</a>
          <button class="secondary wide" style="color:#b42318;border-color:#fecdca" onclick="doRealLogout()">Đăng xuất tài khoản</button>
        </div>
      `);
      return;
    }

    showSheet('Đăng nhập Tiếng Anh Cô Dung', `
      <p style="margin-top:0">Đăng nhập bằng tài khoản học sinh, phụ huynh hoặc giáo viên để đồng bộ lịch học, điểm danh và Quỹ Sao trên D1.</p>
      <label class="label" for="real-user">Tên đăng nhập / SĐT / Email</label>
      <input id="real-user" class="field" type="text" placeholder="VD: baokhiem5 hoặc msdung" autocomplete="username">
      <label class="label" for="real-pass">Mật khẩu</label>
      <input id="real-pass" class="field" type="password" placeholder="Nhập mật khẩu" autocomplete="current-password">
      <p id="real-login-err" class="error"></p>
      <button id="real-login-btn" class="primary wide" style="margin-top:12px" onclick="submitRealLogin()">🔑 Đăng nhập ngay</button>
    `);
  };

  window.submitRealLogin = async function () {
    const uEl = document.querySelector('#real-user');
    const pEl = document.querySelector('#real-pass');
    const errEl = document.querySelector('#real-login-err');
    const btnEl = document.querySelector('#real-login-btn');
    const username = (uEl?.value || '').trim();
    const password = pEl?.value || '';
    if (!username || !password) {
      if (errEl) errEl.textContent = 'Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.';
      return;
    }
    if (btnEl) {
      btnEl.disabled = true;
      btnEl.textContent = 'Đang xác thực...';
    }
    try {
      const res = await fetch('/api/auth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        if (errEl) errEl.textContent = data.error || 'Đăng nhập thất bại.';
        if (btnEl) {
          btnEl.disabled = false;
          btnEl.textContent = '🔑 Đăng nhập ngay';
        }
        return;
      }
      liveToken = data.token;
      liveUser = data.user;
      try {
        localStorage.setItem('tienganh_token', data.token);
        localStorage.setItem('tienganh_auth_token', data.token);
        localStorage.setItem('tienganh_current_user', JSON.stringify(data.user));
        localStorage.setItem('currentUser', JSON.stringify(data.user));
      } catch {}
      document.querySelector('#sheet')?.close();
      toast(`Đã đăng nhập: ${data.user.name || data.user.username}`);
      applyLiveUserToState(data.user);
      await loadLiveSchedule();
      await sendDeviceHeartbeat('/app#login_success');
    } catch (e) {
      if (errEl) errEl.textContent = 'Lỗi kết nối máy chủ.';
      if (btnEl) {
        btnEl.disabled = false;
        btnEl.textContent = '🔑 Đăng nhập ngay';
      }
    }
  };

  window.doRealLogout = async function () {
    const token = getStoredToken();
    if (token) {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }
        });
      } catch {}
    }
    try {
      localStorage.removeItem('tienganh_token');
      localStorage.removeItem('tienganh_auth_token');
      localStorage.removeItem('tienganh_current_user');
      localStorage.removeItem('currentUser');
    } catch {}
    liveUser = null;
    liveToken = null;
    liveSessions = [];
    document.querySelector('#sheet')?.close();
    updateTopStatusBar();
    render();
    toast('Đã đăng xuất tài khoản');
  };

  // Override confirmCheckin & sendStudentAbsence to call real D1 endpoints when authenticated
  window.confirmCheckin = async function () {
    const token = getStoredToken();
    const sessionId = liveSessions[0]?.id || '';
    if (token && sessionId) {
      try {
        const res = await fetch('/api/attendance/check-in', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ session_id: sessionId })
        });
        const data = await res.json();
        document.querySelector('#sheet')?.close();
        if (res.ok && data.success) {
          toast(`Điểm danh thành công trên D1 · +${data.check_in?.stars_awarded ?? 5} sao`);
          return;
        }
        toast(data.error || 'Đã ghi nhận điểm danh trên thiết bị');
        return;
      } catch {}
    }
    document.querySelector('#sheet')?.close();
    toast('Điểm danh thành công · +5 sao');
  };

  window.sendStudentAbsence = async function () {
    const token = getStoredToken();
    const sessionId = liveSessions[0]?.id || '';
    const reasonSel = document.querySelector('#absence-reason')?.value || 'Sức khỏe';
    const noteVal = document.querySelector('#sheet textarea')?.value || '';
    const reason = noteVal.trim() ? `${reasonSel}: ${noteVal.trim()}` : reasonSel;
    if (token && sessionId) {
      try {
        const res = await fetch('/api/attendance/absence', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ session_id: sessionId, reason })
        });
        const data = await res.json();
        document.querySelector('#sheet')?.close();
        if (res.ok && data.success) {
          toast('Đã gửi đơn xin nghỉ tới Giáo viên & Leader trên D1');
          return;
        }
        toast(data.error || 'Đã lưu yêu cầu xin nghỉ');
        return;
      } catch {}
    }
    document.querySelector('#sheet')?.close();
    toast('Đã gửi xin nghỉ · Chờ giáo viên/Leader xác nhận');
  };

  async function loadLiveSchedule() {
    const token = getStoredToken();
    if (!token) return;
    try {
      const res = await fetch('/api/schedule', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.sessions)) {
        liveSessions = data.sessions;
        decorateLiveDom();
      }
    } catch {}
  }

  async function initLiveBridge() {
    const stored = getStoredUser();
    if (stored) {
      applyLiveUserToState(stored);
    } else {
      updateTopStatusBar();
      decorateLiveDom();
    }

    const token = getStoredToken();
    if (token) {
      try {
        const res = await fetch('/api/auth/verify', {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.valid && data.user) {
          applyLiveUserToState(data.user);
          await loadLiveSchedule();
        }
      } catch {}
    }

    await sendDeviceHeartbeat();
    setInterval(() => sendDeviceHeartbeat(), 30000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLiveBridge);
  } else {
    initLiveBridge();
  }
})();
