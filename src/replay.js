// Replay system: captures the exact run script (seed, test order, params,
// generated-data descriptors) so a benchmark can be re-executed identically
// for scientifically fair before/after comparison.

const STORAGE_KEY = 'zbs.history.v1';
const REPLAY_KEY = 'zbs.lastRun.v1';

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

export function saveLastRun(runScript, report) {
  const entry = { runScript, report, savedAt: new Date().toISOString() };
  localStorage.setItem(REPLAY_KEY, JSON.stringify(entry));
  pushHistory(entry);
  return entry;
}

export function loadLastRun() {
  const raw = localStorage.getItem(REPLAY_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function pushHistory(entry) {
  const hist = loadHistory();
  hist.unshift({ savedAt: entry.savedAt, runScript: entry.runScript, report: entry.report });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(hist.slice(0, 30)));
}

export function loadHistory() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : [];
}

export function clearHistory() {
  localStorage.removeItem(STORAGE_KEY);
}
