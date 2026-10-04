const DB_NAME = 'tienganh-quiz-offline-v1';
const DB_VERSION = 1;

function openDb() {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDBUnavailable'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('attempts')) db.createObjectStore('attempts', { keyPath: 'queueId' });
      if (!db.objectStoreNames.contains('quizCache')) db.createObjectStore('quizCache', { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function storePut(name, value) {
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const request = db.transaction(name, 'readwrite').objectStore(name).put(value);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}

export async function cacheQuizData(key, value) {
  await storePut('quizCache', { key, value, cachedAt: new Date().toISOString() });
}

export async function getCachedQuizData(key) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('quizCache', 'readonly').objectStore('quizCache').get(key);
      request.onsuccess = () => resolve(request.result?.value ?? null);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}

export async function queueQuizAttempt({ quizId, attemptId, attemptToken = null, answers, action = 'submit', deferredQuestionIds = [] }) {
  if (!quizId || !attemptId || !answers || typeof answers !== 'object') throw new Error('InvalidQueuedAttempt');
  const queueId = `${quizId}:${attemptId}`;
  await storePut('attempts', { queueId, quizId, attemptId, attemptToken, answers, action, deferredQuestionIds, queuedAt: new Date().toISOString() });
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.ready.catch(() => null);
    await registration?.sync?.register('quiz-attempt-sync').catch(() => {});
  }
  return queueId;
}

export async function flushQuizAttempts({ authToken = null } = {}) {
  const db = await openDb();
  const items = await new Promise((resolve, reject) => {
    const request = db.transaction('attempts', 'readonly').objectStore('attempts').getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
  let synced = 0;
  try {
    for (const item of items) {
      if (!item.attemptToken && !authToken) continue;
      try {
        const response = await fetch(`/api/quiz-menu/${encodeURIComponent(item.quizId)}/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
          body: JSON.stringify({ action: item.action || 'submit', attempt_id: item.attemptId, attempt_token: item.attemptToken, answers: item.answers, deferred_question_ids: item.deferredQuestionIds || [] })
        });
        if (response.ok || response.status === 409) {
          await new Promise((resolve, reject) => {
            const request = db.transaction('attempts', 'readwrite').objectStore('attempts').delete(item.queueId);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
          });
          synced++;
        }
      } catch {}
    }
  } finally { db.close(); }
  return { synced, pending: items.length - synced };
}

export function installQuizOnlineSync(getAuthToken = () => null) {
  if (typeof window === 'undefined') return () => {};
  const handler = () => flushQuizAttempts({ authToken: getAuthToken() }).catch(() => {});
  window.addEventListener('online', handler);
  return () => window.removeEventListener('online', handler);
}
