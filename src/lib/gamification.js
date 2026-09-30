// src/lib/gamification.js
// Academic Warmth Phase 4 (2026-09-30): gom streak / xp / badges vao mot store.
// Persist: localStorage ngay lap tuc + dong bo D1 qua API (defensive: khong bao gio throw).
import { writable } from 'svelte/store';

const LS_KEY = 'tienganh_gamification_v1';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function loadLocal() {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(LS_KEY) : null;
    if (raw) return JSON.parse(raw);
  } catch {}
  return { streak_days: 0, last_active_date: null, xp_total: 0, badges: [] };
}

function createStore() {
  const { subscribe, update, set } = writable(loadLocal());

  function persist(state) {
    try {
      if (typeof window !== 'undefined') localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch {}
    // Dong bo D1 (best-effort, khong bao gio throw — migration 0008 chua apply tren production)
    try {
      if (typeof window !== 'undefined') {
        const token = localStorage.getItem('tienganh_token') || localStorage.getItem('tienganh_auth_token');
        if (token) {
          fetch('/api/gamification', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(state)
          }).catch(() => {});
        }
      }
    } catch {}
  }

  return {
    subscribe,
    /** Ghi nhan 1 ngay co hoat dong hoc (games/quiz/flashcards/dictionary). */
    recordActivity(xpGain = 10) {
      update((s) => {
        const today = todayStr();
        let streak = s.streak_days || 0;
        if (s.last_active_date === today) {
          // da tinh hom nay
        } else if (s.last_active_date === yesterdayStr()) {
          streak += 1;
        } else {
          streak = 1;
        }
        const next = { ...s, streak_days: streak, last_active_date: today, xp_total: (s.xp_total || 0) + xpGain };
        persist(next);
        return next;
      });
    },
    addXp(amount) {
      update((s) => {
        const next = { ...s, xp_total: (s.xp_total || 0) + amount };
        persist(next);
        return next;
      });
    },
    awardBadge(badgeId) {
      update((s) => {
        if ((s.badges || []).includes(badgeId)) return s;
        const next = { ...s, badges: [...(s.badges || []), badgeId] };
        persist(next);
        return next;
      });
    },
    reset: () => set({ streak_days: 0, last_active_date: null, xp_total: 0, badges: [] })
  };
}

export const gamification = createStore();

/** Muc CEFR -> badge goi y */
export const CEFR_BADGES = [
  { id: 'cefr-a1', level: 'A1', icon: '🌱', label: 'Nền tảng A1' },
  { id: 'cefr-a2', level: 'A2', icon: '🌿', label: 'Vững vàng A2' },
  { id: 'cefr-b1', level: 'B1', icon: '🚀', label: 'Bứt phá B1' },
  { id: 'cefr-b2', level: 'B2', icon: '⭐', label: 'Chinh phục B2' },
  { id: 'cefr-c1', level: 'C1', icon: '👑', label: 'Đỉnh cao C1' }
];
