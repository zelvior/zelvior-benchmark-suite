// Replay system: captures the exact run script (seed, test order, params —
// including generated data like image sources) so a benchmark can be
// re-executed identically for scientifically fair before/after comparison.
//
// Storage: IndexedDB, not localStorage. Report payloads can legitimately run
// into several MB (image-rendering test params embed generated data-URI
// images so decode workload replays exactly) — localStorage's ~5-10MB total
// quota would silently fail or throw QuotaExceededError under normal use.
// IndexedDB has a much higher, browser-managed quota and is the correct
// tool for this amount of structured data.

const DB_NAME = 'zbs-storage';
const DB_VERSION = 1;
const STORE = 'runs';
const LAST_RUN_KEY = 'lastRun';
const HISTORY_LIMIT = 30;

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this browser/context.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('byType', 'type', { unique: false });
        store.createIndex('bySavedAt', 'savedAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(storeName, mode) {
  return openDB().then(db => db.transaction(storeName, mode).objectStore(storeName));
}

function promisifyRequest(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export class RunScript {
  constructor(seed, testOrder, paramsByTest) {
    this.version = 1;
    this.seed = seed;
    this.createdAt = new Date().toISOString();
    this.testOrder = testOrder;       // [testId, ...] fixed execution order
    this.params = paramsByTest;       // { testId: {...deterministic params} }
  }
  static fromJSON(json) {
    const o = typeof json === 'string' ? JSON.parse(json) : json;
    const rs = new RunScript(o.seed, o.testOrder, o.params);
    rs.createdAt = o.createdAt;
    rs.version = o.version;
    return rs;
  }
}

export async function saveLastRun(runScript, report) {
  const savedAt = new Date().toISOString();
  const entry = { runScript, report, savedAt };
  try {
    const store = await tx(STORE, 'readwrite');
    store.put({ id: LAST_RUN_KEY, type: 'lastRun', ...entry });
    const histId = `history:${savedAt}:${runScript.seed}`;
    store.put({ id: histId, type: 'history', ...entry });
    await pruneHistory();
  } catch (err) {
    console.error('ZBS: failed to persist run to IndexedDB', err);
  }
  return entry;
}

export async function loadLastRun() {
  try {
    const store = await tx(STORE, 'readonly');
    const result = await promisifyRequest(store.get(LAST_RUN_KEY));
    return result || null;
  } catch (err) {
    console.error('ZBS: failed to load last run from IndexedDB', err);
    return null;
  }
}

export async function loadHistory() {
  try {
    const store = await tx(STORE, 'readonly');
    const index = store.index('byType');
    const all = await promisifyRequest(index.getAll(IDBKeyRange.only('history')));
    return all.sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
  } catch (err) {
    console.error('ZBS: failed to load history from IndexedDB', err);
    return [];
  }
}

async function pruneHistory() {
  const hist = await loadHistory();
  if (hist.length <= HISTORY_LIMIT) return;
  const store = await tx(STORE, 'readwrite');
  for (const entry of hist.slice(HISTORY_LIMIT)) store.delete(entry.id);
}

export async function clearHistory() {
  try {
    const store = await tx(STORE, 'readwrite');
    const index = store.index('byType');
    const all = await promisifyRequest(index.getAllKeys(IDBKeyRange.only('history')));
    for (const key of all) store.delete(key);
  } catch (err) {
    console.error('ZBS: failed to clear history from IndexedDB', err);
  }
}
