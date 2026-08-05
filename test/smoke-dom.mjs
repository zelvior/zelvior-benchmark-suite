// Runs the actual browser-facing code (engine, every test module, replay,
// report) inside jsdom + fake-indexeddb. This is NOT a substitute for a real
// browser: jsdom does not do real layout, real paint, real rAF timing, or
// real canvas/WebGL rendering (canvas.getContext returns null). What it DOES
// catch: reference errors, wrong API usage, broken control flow, unhandled
// promise rejections, and anything that would throw before a real browser
// even gets to the parts jsdom can't simulate. Not exhaustive, but it moves
// this from "syntax-checked only" to "actually executed at least once."
import { JSDOM } from 'jsdom';
import 'fake-indexeddb/auto';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
});

global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true, writable: true });
global.screen = dom.window.screen;
// jsdom does not implement real image loading/decoding — real Image.onload
// never fires for data: URIs, which would hang the image-rendering test's
// Promise.all forever. Stub a minimal Image that fires onload on a
// microtask, so the test's own logic (not image decoding, which jsdom can't
// do) gets exercised.
// jsdom does not implement real image loading/decoding — real Image.onload
// never fires for data: URIs, which would hang the image-rendering test's
// Promise.all forever. Patch the src setter on jsdom's real HTMLImageElement
// to fire onload on a microtask, so the test's own logic (not the decoding
// jsdom can't do) gets exercised, while the element stays a real DOM node
// appendChild can accept.
global.Image = dom.window.Image;
const imgProto = dom.window.HTMLImageElement.prototype;
const nativeSrcDesc = Object.getOwnPropertyDescriptor(imgProto, 'src');
Object.defineProperty(imgProto, 'src', {
  configurable: true,
  get() { return nativeSrcDesc.get.call(this); },
  set(v) { nativeSrcDesc.set.call(this, v); Promise.resolve().then(() => this.onload && this.onload()); },
});
// Deliberately NOT overriding global.performance with jsdom's — this jsdom
// version has a self-recursive bug in PerformanceImpl.now(). Node's own
// built-in `performance` global (from perf_hooks) already supports
// now/mark/measure/getEntriesByName, which is all this codebase uses.
global.CSSStyleSheet = dom.window.CSSStyleSheet;
global.localStorage = dom.window.localStorage;
global.indexedDB = global.indexedDB || dom.window.indexedDB;
global.MouseEvent = dom.window.MouseEvent;
global.KeyboardEvent = dom.window.KeyboardEvent;
global.Event = dom.window.Event;
global.Blob = dom.window.Blob || class { constructor(parts, opts) { this.parts = parts; this.type = opts?.type; } };
global.URL = dom.window.URL;

// jsdom has no rAF; polyfill with a microtask-fast timer so tests complete quickly.
let rafId = 0;
global.requestAnimationFrame = (cb) => { const id = ++rafId; setTimeout(() => cb(performance.now()), 0); return id; };
global.cancelAnimationFrame = (id) => {};
window.requestAnimationFrame = global.requestAnimationFrame;
window.cancelAnimationFrame = global.cancelAnimationFrame;

// jsdom throws "not implemented" on canvas 2d context by default (no canvas backend).
// Stub a minimal 2D context so canvas/animation/image tests can execute their code paths.
const stub2dCtx = {
  clearRect(){}, fillRect(){}, beginPath(){}, arc(){}, fill(){}, stroke(){},
  moveTo(){}, lineTo(){}, closePath(){}, drawImage(){}, createLinearGradient(){ return { addColorStop(){} }; },
  set fillStyle(v){}, get fillStyle(){ return '#000'; },
  set strokeStyle(v){}, get strokeStyle(){ return '#000'; },
  set lineWidth(v){}, set lineJoin(v){}, set font(v){}, set textAlign(v){},
  fillText(){}, measureText(){ return { width: 0 }; }, setTransform(){},
};
dom.window.HTMLCanvasElement.prototype.getContext = function (type) {
  if (type === '2d') return stub2dCtx;
  return null; // webgl/webgl2 correctly unavailable -> exercises the "unsupported" branches
};
dom.window.HTMLCanvasElement.prototype.toDataURL = function () { return 'data:image/png;base64,AAAA'; };

let failures = 0;
function report(name, err) {
  if (err) { failures++; console.error(`FAIL - ${name}\n       ${err.stack || err}`); }
  else console.log(`  ok  - ${name}`);
}

const { BenchmarkEngine, ALL_TESTS } = await import('../src/engine.js');
const { RunScript, saveLastRun, loadLastRun, loadHistory } = await import('../src/replay.js');
const { reportToJSON, reportToHTML } = await import('../src/report.js');

console.log(`Discovered ${ALL_TESTS.length} test modules.\n`);

const stage = document.createElement('div');
document.body.appendChild(stage);

// Shrink every test's workload via forcedParams so the smoke run finishes in
// seconds instead of minutes, while still exercising every code path.
const SMALL = {
  'dom-create': { sizes: [10, 50] },
  'dom-update': { count: 50, updates: 20 },
  'dom-remove': { count: 50 },
  'massive-list': { sizes: [10, 50] },
  'scroll-stress': { speeds: ['slow'] },
  'image-rendering': { counts: [3] },
  'animation-stress': { durationMs: 60, elementCount: 6 },
  'js-performance': { n: 500 },
  'event-stress': { perType: 20 },
  'layout-stress': { iterations: 30, elementCount: 10 },
  'resize-stress': { steps: 10 },
  'search-benchmark': { sizes: [10, 50] },
  'canvas-benchmark': { counts: [10], durationMs: 60 },
  'svg-benchmark': { count: 20 },
  'css-benchmark': { ruleCount: 20, elementCount: 10 },
  'idle-benchmark': { samples: 2 },
  'cpu-throughput': { budgetMs: 20 },
  'browser-capability': {},
  'rendering-benchmark': { cycles: 3 },
  'memory-benchmark': { chunks: 2, chunkSize: 1000 },
};

const engine = new BenchmarkEngine({
  stage,
  onProgress: () => {},
  onLog: () => {},
  onLiveMetric: () => {},
});

const seed = 12345;
const testOrder = ALL_TESTS.map(t => t.id);
const runScript = new RunScript(seed, testOrder, SMALL);

let outcome;
try {
  outcome = await engine.run(runScript);
  report('engine.run() completes without throwing, for every registered test');
} catch (err) {
  report('engine.run() completes without throwing, for every registered test', err);
}

if (outcome) {
  for (const testId of testOrder) {
    const t = outcome.report.tests[testId];
    if (!t) { report(`test "${testId}" produced a result entry`, new Error('missing from report.tests')); continue; }
    if (t.error) { report(`test "${testId}" ran without an internal error`, new Error(t.error)); continue; }
    report(`test "${testId}" produced a result entry`);
  }

  try {
    const json = reportToJSON(outcome.report);
    JSON.parse(json);
    report('report is valid, round-trippable JSON');
  } catch (err) { report('report is valid, round-trippable JSON', err); }

  try {
    const html = reportToHTML(outcome.report);
    if (!html.includes('<html')) throw new Error('HTML report missing <html> root');
    report('reportToHTML produces well-formed output');
  } catch (err) { report('reportToHTML produces well-formed output', err); }

  try {
    await saveLastRun(outcome.runScript, outcome.report);
    const last = await loadLastRun();
    if (!last || last.runScript.seed !== seed) throw new Error('saved/loaded run mismatch');
    report('replay storage: save + load last run round-trips');
  } catch (err) { report('replay storage: save + load last run round-trips', err); }

  try {
    const hist = await loadHistory();
    if (!Array.isArray(hist) || hist.length < 1) throw new Error('history empty after save');
    report('replay storage: history contains the saved run');
  } catch (err) { report('replay storage: history contains the saved run', err); }
}

console.log(`\n${failures === 0 ? 'All' : failures + ' FAILING,'} smoke checks ${failures === 0 ? 'passed' : 'out of ' + (ALL_TESTS.length + 5)}.`);
process.exit(failures === 0 ? 0 : 1);
