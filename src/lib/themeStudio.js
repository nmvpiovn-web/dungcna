// src/lib/themeStudio.js — Hệ thống Quản trị Giao diện & Chủ đề Sự kiện (Halloween, Đi Dã Ngoại, Workshop, Trại Hè, Lễ Hội...)
// Dùng chung cho Theme Studio (?studio=1), Modal cá nhân và Tab Giao diện trong Admin CP (/admincp & /admin)
export const STORE_KEY = 'tienganh_studio_theme';
export const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

export const PRESETS = [
  // =========================================================================
  // NHÓM 1: CHỦ ĐỀ SỰ KIỆN, LỄ HỘI & NGOẠI KHÓA (EVENT & WORKSHOP THEMES)
  // =========================================================================
  {
    id: 'halloween_festival',
    name: '🎃 Lễ Hội Halloween',
    category: 'event',
    icon: '🎃',
    badge: 'HALLOWEEN SPOOKY FESTIVAL',
    desc: 'Cam bí ngô & Tím ma thuật — Săn từ vựng lễ hội hóa trang, trò chơi Trick-or-Treat',
    bannerEnabled: true,
    bannerTitle: '🎃 Lễ Hội Hóa Trang Halloween — Săn Từ Vựng & Quiz Ma Thuật Nhận 200 Sao!',
    bannerSub: 'Khám phá bộ từ vựng chủ đề Halloween, Lễ hội hóa trang & Văn hóa phương Tây chuẩn Cambridge.',
    ctaText: '🎃 Học Từ Vựng Halloween',
    ctaHref: '/dictionary?q=halloween',
    particlesEnabled: true,
    particles: ['🎃', '🦇', '👻', '🍬', '🕸️', '✨'],
    c: {
      50: '#fff7ed',
      100: '#ffedd5',
      200: '#fed7aa',
      300: '#fdba74',
      400: '#fb923c',
      500: '#f97316',
      600: '#ea580c',
      700: '#c2410c',
      800: '#7c2d12',
      900: '#431407',
      950: '#1f0903'
    },
    hof: ['#fdba74', '#f97316', '#ea580c', '#7e22ce']
  },
  {
    id: 'outdoor_picnic',
    name: '🏕️ Đi Dã Ngoại & Eco-Trip',
    category: 'event',
    icon: '🏕️',
    badge: 'OUTDOOR PICNIC & FIELD TRIP',
    desc: 'Xanh rừng thông & Nắng thảo nguyên — Dã ngoại thực tế, cắm trại & trò chơi ngoài trời',
    bannerEnabled: true,
    bannerTitle: '🏕️ Chuyến Đi Dã Ngoại Tiếng Anh — Học Giao Tiếp Thực Tế Giữa Thiên Nhiên!',
    bannerSub: 'Trải nghiệm cắm trại, Scavenger Hunt, sinh hoạt đồng đội & thuyết trình tiếng Anh ngoài trời.',
    ctaText: '🏕️ Từ Vựng Dã Ngoại & Cắm Trại',
    ctaHref: '/dictionary?q=picnic',
    particlesEnabled: true,
    particles: ['🏕️', '🌿', '🌻', '🎒', '🧭', '🦋'],
    c: {
      50: '#f0fdf4',
      100: '#dcfce7',
      200: '#bbf7d0',
      300: '#86efac',
      400: '#4ade80',
      500: '#10b981',
      600: '#059669',
      700: '#047857',
      800: '#065f46',
      900: '#064e3b',
      950: '#022c22'
    },
    hof: ['#bbf7d0', '#34d399', '#059669', '#d97706']
  },
  {
    id: 'english_workshop',
    name: '🎙️ Workshop & CLB Tiếng Anh',
    category: 'event',
    icon: '🎙️',
    badge: 'SPEAKING & DEBATE WORKSHOP',
    desc: 'Tím Indigo sáng tạo — Workshop thuyết trình, phản biện (Debate), làm việc nhóm & dự án',
    bannerEnabled: true,
    bannerTitle: '🎙️ English Workshop — Thực Hành Thuyết Trình, Phản Biện & Làm Việc Nhóm!',
    bannerSub: 'Rèn luyện kỹ năng Public Speaking, Brainstorming, Role-play & Giao tiếp thực chiến.',
    ctaText: '🎙️ Mẫu Câu & Từ Vựng Workshop',
    ctaHref: '/dictionary?q=workshop',
    particlesEnabled: true,
    particles: ['🎙️', '💡', '🤝', '🎯', '🌟', '🚀'],
    c: {
      50: '#eef2ff',
      100: '#e0e7ff',
      200: '#c7d2fe',
      300: '#a5b4fc',
      400: '#818cf8',
      500: '#6366f1',
      600: '#4f46e5',
      700: '#4338ca',
      800: '#3730a3',
      900: '#312e81',
      950: '#1e1b4b'
    },
    hof: ['#c7d2fe', '#818cf8', '#4f46e5', '#9333ea']
  },
  {
    id: 'summer_camp',
    name: '🏖️ Trại Hè Quốc Tế',
    category: 'event',
    icon: '🏖️',
    badge: 'INTERNATIONAL SUMMER CAMP',
    desc: 'Xanh đại dương & Nắng vàng cát biển — Trại hè tiếng Anh, giao lưu văn hóa & khám phá',
    bannerEnabled: true,
    bannerTitle: '🏖️ Trại Hè Tiếng Anh Quốc Tế — Khám Phá Thế Giới & Giao Lưu Đa Văn Hóa!',
    bannerSub: 'Hoạt động ngoại khóa mùa hè, du lịch sinh thái, thể thao biển & giao tiếp tự tin.',
    ctaText: '🏖️ Khám Phá Chủ Đề Trại Hè',
    ctaHref: '/quiz-menu',
    particlesEnabled: true,
    particles: ['🏖️', '🌊', '☀️', '🏄', '🐚', '🌴'],
    c: {
      50: '#f0f9ff',
      100: '#e0f2fe',
      200: '#bae6fd',
      300: '#7dd3fc',
      400: '#38bdf8',
      500: '#0ea5e9',
      600: '#0284c7',
      700: '#0369a1',
      800: '#075985',
      900: '#0c4a6e',
      950: '#082f49'
    },
    hof: ['#7dd3fc', '#38bdf8', '#0284c7', '#f59e0b']
  },
  {
    id: 'tet_spring',
    name: '🌸 Lễ Hội Tết & Mùa Xuân',
    category: 'event',
    icon: '🌸',
    badge: 'LUNAR NEW YEAR & SPRING FESTIVAL',
    desc: 'Đỏ son may mắn & Vàng hoa mai — Lễ hội Tết cổ truyền, lì xì Sao học tập đầu xuân',
    bannerEnabled: true,
    bannerTitle: '🌸 Khai Xuân Như Ý — Lì Xì Sao Học Tập & Chinh Phục Đỉnh Cao Tiếng Anh!',
    bannerSub: 'Tìm hiểu từ vựng Văn hóa Tết Việt Nam, Phong tục Mùa xuân & Lễ hội truyền thống bằng tiếng Anh.',
    ctaText: '🌸 Từ Vựng Lễ Hội & Tết',
    ctaHref: '/dictionary?q=festival',
    particlesEnabled: true,
    particles: ['🌸', '🧧', '🏮', '🌼', '✨', '🎊'],
    c: {
      50: '#fff1f2',
      100: '#ffe4e6',
      200: '#fecdd3',
      300: '#fda4af',
      400: '#fb7185',
      500: '#f43f5e',
      600: '#e11d48',
      700: '#be123c',
      800: '#9f1239',
      900: '#881337',
      950: '#4c0519'
    },
    hof: ['#fde68a', '#fbbf24', '#f43f5e', '#e11d48']
  },
  {
    id: 'mid_autumn',
    name: '🏮 Đêm Hội Trăng Rằm',
    category: 'event',
    icon: '🏮',
    badge: 'MID-AUTUMN LANTERN FESTIVAL',
    desc: 'Vàng ánh trăng & Đỏ đèn lồng — Vui Tết Trung Thu, rước đèn & kể chuyện tiếng Anh',
    bannerEnabled: true,
    bannerTitle: '🏮 Đêm Hội Trăng Rằm — Rước Đèn Trung Thu & Săn Sao Học Tập!',
    bannerSub: 'Khám phá từ vựng Tết Trung Thu (Mooncake, Lantern Parade, Lion Dance) & văn hóa Á Đông.',
    ctaText: '🏮 Khám Phá Từ Vựng Lễ Hội',
    ctaHref: '/dictionary?q=lantern',
    particlesEnabled: true,
    particles: ['🏮', '🌕', '🥮', '🦁', '✨', '🐇'],
    c: {
      50: '#fffbeb',
      100: '#fef3c7',
      200: '#fde68a',
      300: '#fcd34d',
      400: '#fbbf24',
      500: '#f59e0b',
      600: '#d97706',
      700: '#b45309',
      800: '#92400e',
      900: '#78350f',
      950: '#451a03'
    },
    hof: ['#fef08a', '#fbbf24', '#ea580c', '#dc2626']
  },
  {
    id: 'christmas_winter',
    name: '🎄 Giáng Sinh An Lành',
    category: 'event',
    icon: '🎄',
    badge: 'WINTER WONDERLAND & NOEL',
    desc: 'Xanh thông Noel & Tuyết trắng — Giáng sinh ấm áp, săn quà Ông già Noel',
    bannerEnabled: true,
    bannerTitle: '🎄 Merry Christmas — Giáng Sinh An Lành & Thử Thách Từ Vựng Mùa Đông!',
    bannerSub: 'Học từ vựng Giáng sinh, viết thiệp chúc mừng & giao tiếp mùa lễ hội cuối năm.',
    ctaText: '🎄 Vào Đấu Trường Game Noel',
    ctaHref: '/games',
    particlesEnabled: true,
    particles: ['❄️', '🎄', '⛄', '🎁', '🦌', '🔔'],
    c: {
      50: '#ecfdf5',
      100: '#d1fae5',
      200: '#a7f3d0',
      300: '#6ee7b7',
      400: '#34d399',
      500: '#10b981',
      600: '#15803d',
      700: '#166534',
      800: '#14532d',
      900: '#064e3b',
      950: '#022c22'
    },
    hof: ['#a7f3d0', '#34d399', '#15803d', '#dc2626']
  },
  {
    id: 'cambridge_exam',
    name: '🏆 Mùa Thi Cambridge & IELTS',
    category: 'event',
    icon: '🏆',
    badge: 'CAMBRIDGE KET / PET / IELTS SEASON',
    desc: 'Xanh Navy học thuật & Vàng huy chương — Tăng tốc luyện đề Học kỳ, KET/PET & IELTS',
    bannerEnabled: true,
    bannerTitle: '🏆 Chiến Dịch Tăng Tốc Phòng Thi Cambridge KET/PET, Học Kỳ & IELTS!',
    bannerSub: 'Luyện đề bấm giờ 15 phút • 45 phút • Học kỳ chuẩn Bộ GD&ĐT 2026 & Cambridge Assessment.',
    ctaText: '🏆 Vào Phòng Thi Số Hóa',
    ctaHref: '/exam',
    particlesEnabled: true,
    particles: ['🏆', '🥇', '🎓', '⭐', '📚', '🔥'],
    c: {
      50: '#f0f9ff',
      100: '#e0f2fe',
      200: '#bae6fd',
      300: '#7dd3fc',
      400: '#38bdf8',
      500: '#0284c7',
      600: '#0369a1',
      700: '#1d4ed8',
      800: '#1e40af',
      900: '#1e3a8a',
      950: '#172554'
    },
    hof: ['#fde68a', '#fbbf24', '#0284c7', '#1d4ed8']
  },

  // =========================================================================
  // NHÓM 2: BẢNG MÀU HỌC ĐƯỜNG CƠ BẢN (CLASSIC ACADEMIC THEMES)
  // =========================================================================
  {
    id: 'lavie_aqua',
    name: 'Lavie Aqua',
    category: 'classic',
    icon: '💧',
    badge: 'DEFAULT ACADEMIC',
    desc: 'Màu xanh ngọc học đường mặc định — Dịu mắt, tập trung cao độ',
    bannerEnabled: false,
    particlesEnabled: false,
    particles: [],
    c: { 50:'#ecfeff',100:'#cffafe',200:'#a5f3fc',300:'#67e8f9',400:'#22d3ee',500:'#06b6d4',600:'#0891b2',700:'#0e7490',800:'#155e75',900:'#164e63',950:'#083344' },
    hof: ['#a5f3fc','#67e8f9','#22d3ee','#06b6d4']
  },
  {
    id: 'doublemint_mint',
    name: 'Doublemint Mint',
    category: 'classic',
    icon: '🌿',
    badge: 'FRESH MINT',
    desc: 'Xanh bạc hà tươi mát, nhẹ nhàng cho mắt khi đọc tài liệu dài',
    bannerEnabled: false,
    particlesEnabled: false,
    particles: [],
    c: { 50:'#ecfdf5',100:'#d1fae5',200:'#a7f3d0',300:'#6ee7b7',400:'#34d399',500:'#10b981',600:'#059669',700:'#047857',800:'#065f46',900:'#064e3b',950:'#022c22' },
    hof: ['#a7f3d0','#6ee7b7','#34d399','#059669']
  },
  {
    id: 'xanh_duong',
    name: 'Xanh Duong',
    category: 'classic',
    icon: '💠',
    badge: 'OCEAN BLUE',
    desc: 'Xanh dương chuẩn mực, thanh lịch và hiện đại',
    bannerEnabled: false,
    particlesEnabled: false,
    particles: [],
    c: { 50:'#f0f9ff',100:'#e0f2fe',200:'#bae6fd',300:'#7dd3fc',400:'#38bdf8',500:'#0ea5e9',600:'#0284c7',700:'#0369a1',800:'#075985',900:'#0c4a6e',950:'#082f49' },
    hof: ['#7dd3fc','#38bdf8','#0ea5e9','#0284c7']
  },
  {
    id: 'tim_violet',
    name: 'Tim Violet',
    category: 'classic',
    icon: '🔮',
    badge: 'ROYAL VIOLET',
    desc: 'Tím sáng tạo, truyền cảm hứng nghệ thuật và tư duy',
    bannerEnabled: false,
    particlesEnabled: false,
    particles: [],
    c: { 50:'#f5f3ff',100:'#ede9fe',200:'#ddd6fe',300:'#c4b5fd',400:'#a78bfa',500:'#8b5cf6',600:'#7c3aed',700:'#6d28d9',800:'#5b21b6',900:'#4c1d95',950:'#2e1065' },
    hof: ['#ddd6fe','#c4b5fd','#a78bfa','#7c3aed']
  },
  {
    id: 'cam_san_ho',
    name: 'Cam San Ho',
    category: 'classic',
    icon: '🪸',
    badge: 'WARM CORAL',
    desc: 'Cam ấm áp, tràn đầy năng lượng tích cực',
    bannerEnabled: false,
    particlesEnabled: false,
    particles: [],
    c: { 50:'#fff7ed',100:'#ffedd5',200:'#fed7aa',300:'#fdba74',400:'#fb923c',500:'#f97316',600:'#ea580c',700:'#c2410c',800:'#9a3412',900:'#7c2d12',950:'#431407' },
    hof: ['#fed7aa','#fdba74','#fb923c','#ea580c']
  },
  {
    id: 'hong_rose',
    name: 'Hong Rose',
    category: 'classic',
    icon: '🌹',
    badge: 'ROSE BLOSSOM',
    desc: 'Hồng phấn trang nhã, thân thiện với học sinh tiểu học & THCS',
    bannerEnabled: false,
    particlesEnabled: false,
    particles: [],
    c: { 50:'#fff1f2',100:'#ffe4e6',200:'#fecdd3',300:'#fda4af',400:'#fb7185',500:'#f43f5e',600:'#e11d48',700:'#be123c',800:'#9f1239',900:'#881337',950:'#4c0519' },
    hof: ['#fecdd3','#fda4af','#fb7185','#e11d48']
  }
];

export const EVENT_THEMES = PRESETS.filter((p) => p.category === 'event');
export const CLASSIC_THEMES = PRESETS.filter((p) => p.category === 'classic');

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
export function isHex(h){ return typeof h === 'string' && HEX_RE.test(h); }

export function hx(h){
  h = h.replace('#','');
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}
export function toHex(r,g,b){
  return '#'+[r,g,b].map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('');
}
export function mix(h1,h2,t){
  const a=hx(h1), b=hx(h2);
  return toHex(a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t);
}
export function rgbStr(h){ const [r,g,b]=hx(h); return `${r} ${g} ${b}`; }

export function findPresetByNameOrId(key) {
  if (!key) return null;
  const q = String(key).trim().toLowerCase();
  return PRESETS.find((p) => p.id?.toLowerCase() === q || p.name.toLowerCase() === q) || null;
}

// Áp theme trực tiếp lên <html> qua CSS biến (ghi đè toàn bộ biến màu và nền trang)
export function applyThemeVars(cScaleOrTheme, hofStops, metaOverride = null){
  if (typeof document === 'undefined') return;
  const el = document.documentElement;
  let cs = cScaleOrTheme || {};
  let hof = hofStops;
  let themeMeta = metaOverride || {};

  // Cho phép truyền nguyên object theme { name, c, hof, ... } vào tham số đầu
  if (cScaleOrTheme && typeof cScaleOrTheme === 'object' && cScaleOrTheme.c && !cScaleOrTheme[500]) {
    cs = cScaleOrTheme.c;
    hof = hofStops || cScaleOrTheme.hof || [];
    themeMeta = { ...cScaleOrTheme, ...(metaOverride || {}) };
  }

  for (const s of SHADES){
    if (!isHex(cs[s])) continue;
    el.style.setProperty('--c-'+s, cs[s]);
    el.style.setProperty('--c-'+s+'-rgb', rgbStr(cs[s]));
  }
  const map = {
    'brand-500': cs[500],
    'brand-600': cs[600],
    'brand-700': cs[700],
    'brand-50': cs[50],
    'brand-200': cs[200]
  };
  for (const [k,v] of Object.entries(map)){
    if (!isHex(v)) continue;
    el.style.setProperty('--'+k, v);
    el.style.setProperty('--'+k+'-rgb', rgbStr(v));
  }

  // Đồng bộ biến nền, viền và primary để toàn bộ trang chuyển màu rõ nét theo chủ đề
  if (isHex(cs[600])) el.style.setProperty('--primary', cs[600]);
  if (isHex(cs[700])) el.style.setProperty('--primary-hover', cs[700]);
  if (isHex(cs[50])) {
    el.style.setProperty('--primary-light', cs[50]);
    el.style.setProperty('--bg-page', cs[50]);
    el.style.setProperty('--surface-1', cs[50]);
    if (document.body) document.body.style.backgroundColor = cs[50];
  }
  if (isHex(cs[100])) {
    el.style.setProperty('--bg-surface', cs[100]);
  }
  if (isHex(cs[200])) {
    el.style.setProperty('--primary-border', cs[200]);
    el.style.setProperty('--border-color', cs[200]);
    el.style.setProperty('--line', cs[200]);
  }

  (hof||[]).forEach((h,i)=>{ if (isHex(h)) el.style.setProperty('--hof-'+(i+1), h); });

  if (themeMeta?.id || themeMeta?.name) {
    el.dataset.siteTheme = String(themeMeta.id || themeMeta.name);
  }

  try {
    window.dispatchEvent(new CustomEvent('tienganh:site-theme-updated', {
      detail: { c: cs, hof: hof || [], ...themeMeta }
    }));
  } catch {}
}

// Dựng scale đầy đủ từ 4 màu custom cơ bản
export function deriveScale(p600, p700, p50, p200){
  const b = isHex(p600) ? p600 : '#0891b2';
  return {
    50: isHex(p50)?p50:mix(b,'#ffffff',0.93),
    100: mix(b,'#ffffff',0.85),
    200: isHex(p200)?p200:mix(b,'#ffffff',0.70),
    300: mix(b,'#ffffff',0.50), 400: mix(b,'#ffffff',0.30), 500: mix(b,'#ffffff',0.12),
    600: b,
    700: isHex(p700)?p700:mix(b,'#000000',0.15),
    800: mix(b,'#000000',0.30), 900: mix(b,'#000000',0.45), 950: mix(b,'#000000',0.60)
  };
}

export function buildCssText(name, c, hof){
  let out = `/* Theme: ${name} — paste vao :root trong src/app.css */\n:root{\n`;
  for (const s of SHADES) out += `  --c-${s}: ${c[s]}; --c-${s}-rgb: ${rgbStr(c[s])};\n`;
  out += `  --brand-600: ${c[600]}; --brand-600-rgb: ${rgbStr(c[600])};\n`;
  out += `  --brand-700: ${c[700]}; --brand-700-rgb: ${rgbStr(c[700])};\n`;
  out += `  --brand-50: ${c[50]}; --brand-50-rgb: ${rgbStr(c[50])};\n`;
  out += `  --brand-200: ${c[200]}; --brand-200-rgb: ${rgbStr(c[200])};\n`;
  (hof||[]).forEach((h,i)=>{ out += `  --hof-${i+1}: ${h};\n`; });
  return out + `}`;
}

export function saveLocal(name, c, hof, extra = {}){
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ name, c, hof, ...extra })); } catch(e){}
}
export function loadLocal(){
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s?.c && SHADES.every(x=>isHex(s.c[x]))) return s;
  } catch(e){}
  return null;
}
export function clearLocal(){
  try { localStorage.removeItem(STORE_KEY); } catch(e){}
}

// Xóa toàn bộ inline vars đã áp -> về CSS mặc định (khi hủy xem trước hoặc khôi phục gốc)
export function removeThemeVars(){
  if (typeof document === 'undefined') return;
  const el = document.documentElement;
  const keys = [
    '--primary', '--primary-hover', '--primary-light', '--primary-border',
    '--bg-page', '--bg-surface', '--surface-1', '--border-color', '--line'
  ];
  for (const s of SHADES){ keys.push('--c-'+s, '--c-'+s+'-rgb'); }
  for (const k of ['brand-500','brand-600','brand-700','brand-50','brand-200']) keys.push('--'+k, '--'+k+'-rgb');
  for (let i=1;i<=4;i++) keys.push('--hof-'+i);
  keys.forEach(k=>el.style.removeProperty(k));
  if (document.body) document.body.style.removeProperty('background-color');
  delete el.dataset.siteTheme;
  try {
    window.dispatchEvent(new CustomEvent('tienganh:site-theme-updated', { detail: null }));
  } catch {}
}

// Validate payload từ client trước khi lưu DB (dùng chung client/server)
export function validateThemePayload(t){
  if (!t || typeof t !== 'object') return 'Payload khong hop le.';
  if (typeof t.name !== 'string' || t.name.length < 1 || t.name.length > 90) return 'Ten theme khong hop le.';
  if (!t.c || typeof t.c !== 'object') return 'Thieu bang mau.';
  for (const s of SHADES) if (!isHex(t.c[s])) return `Mau c-${s} khong hop le.`;
  if (!Array.isArray(t.hof) || t.hof.length !== 4 || !t.hof.every(isHex)) return 'Gradient Hall of Fame khong hop le.';
  return null;
}
