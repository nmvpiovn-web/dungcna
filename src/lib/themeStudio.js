// src/lib/themeStudio.js — logic dung chung cho Theme Studio
// (panel noi ?studio=1 va tab Giao dien trong Admin CP)
export const STORE_KEY = 'tienganh_studio_theme';
export const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

export const PRESETS = [
  {
    name: 'Lavie Aqua',
    c: { 50:'#ecfeff',100:'#cffafe',200:'#a5f3fc',300:'#67e8f9',400:'#22d3ee',500:'#06b6d4',600:'#0891b2',700:'#0e7490',800:'#155e75',900:'#164e63',950:'#083344' },
    hof: ['#a5f3fc','#67e8f9','#22d3ee','#06b6d4']
  },
  {
    name: 'Doublemint Mint',
    c: { 50:'#ecfdf5',100:'#d1fae5',200:'#a7f3d0',300:'#6ee7b7',400:'#34d399',500:'#10b981',600:'#059669',700:'#047857',800:'#065f46',900:'#064e3b',950:'#022c22' },
    hof: ['#a7f3d0','#6ee7b7','#34d399','#059669']
  },
  {
    name: 'Xanh Duong',
    c: { 50:'#f0f9ff',100:'#e0f2fe',200:'#bae6fd',300:'#7dd3fc',400:'#38bdf8',500:'#0ea5e9',600:'#0284c7',700:'#0369a1',800:'#075985',900:'#0c4a6e',950:'#082f49' },
    hof: ['#7dd3fc','#38bdf8','#0ea5e9','#0284c7']
  },
  {
    name: 'Tim Violet',
    c: { 50:'#f5f3ff',100:'#ede9fe',200:'#ddd6fe',300:'#c4b5fd',400:'#a78bfa',500:'#8b5cf6',600:'#7c3aed',700:'#6d28d9',800:'#5b21b6',900:'#4c1d95',950:'#2e1065' },
    hof: ['#ddd6fe','#c4b5fd','#a78bfa','#7c3aed']
  },
  {
    name: 'Cam San Ho',
    c: { 50:'#fff7ed',100:'#ffedd5',200:'#fed7aa',300:'#fdba74',400:'#fb923c',500:'#f97316',600:'#ea580c',700:'#c2410c',800:'#9a3412',900:'#7c2d12',950:'#431407' },
    hof: ['#fed7aa','#fdba74','#fb923c','#ea580c']
  },
  {
    name: 'Hong Rose',
    c: { 50:'#fff1f2',100:'#ffe4e6',200:'#fecdd3',300:'#fda4af',400:'#fb7185',500:'#f43f5e',600:'#e11d48',700:'#be123c',800:'#9f1239',900:'#881337',950:'#4c0519' },
    hof: ['#fecdd3','#fda4af','#fb7185','#e11d48']
  }
];

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

// Ap theme truc tiep len <html> qua CSS bien (ghi de moi theme)
export function applyThemeVars(cScale, hofStops){
  if (typeof document === 'undefined') return;
  const el = document.documentElement;
  const cs = cScale || {};
  for (const s of SHADES){
    if (!isHex(cs[s])) continue;
    el.style.setProperty('--c-'+s, cs[s]);
    el.style.setProperty('--c-'+s+'-rgb', rgbStr(cs[s]));
  }
  const map = { 'brand-600': cs[600], 'brand-700': cs[700], 'brand-50': cs[50], 'brand-200': cs[200] };
  for (const [k,v] of Object.entries(map)){
    if (!isHex(v)) continue;
    el.style.setProperty('--'+k, v);
    el.style.setProperty('--'+k+'-rgb', rgbStr(v));
  }
  (hofStops||[]).forEach((h,i)=>{ if (isHex(h)) el.style.setProperty('--hof-'+(i+1), h); });
}

// Dung scale day du tu 4 mau custom co ban
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

export function saveLocal(name, c, hof){
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ name, c, hof })); } catch(e){}
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

// Validate payload tu client truoc khi luu DB (dung chung client/server)
export function validateThemePayload(t){
  if (!t || typeof t !== 'object') return 'Payload khong hop le.';
  if (typeof t.name !== 'string' || t.name.length > 60) return 'Ten theme khong hop le.';
  if (!t.c || typeof t.c !== 'object') return 'Thieu bang mau.';
  for (const s of SHADES) if (!isHex(t.c[s])) return `Mau c-${s} khong hop le.`;
  if (!Array.isArray(t.hof) || t.hof.length !== 4 || !t.hof.every(isHex)) return 'Gradient Hall of Fame khong hop le.';
  return null;
}
