// Verifies the core promise of the replay system end-to-end: running the
// same RunScript twice produces identical generated params (not just
// identical shapes) for every test — the thing that actually matters for a
// scientifically fair before/after comparison.
import { JSDOM } from 'jsdom';
import 'fake-indexeddb/auto';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true, writable: true });
global.screen = dom.window.screen;
global.CSSStyleSheet = dom.window.CSSStyleSheet;
global.localStorage = dom.window.localStorage;
global.MouseEvent = dom.window.MouseEvent;
global.KeyboardEvent = dom.window.KeyboardEvent;
global.Event = dom.window.Event;
global.Blob = dom.window.Blob;
global.URL = dom.window.URL;
global.requestAnimationFrame = (cb) => { setTimeout(() => cb(performance.now()), 0); return 0; };
global.cancelAnimationFrame = () => {};
window.requestAnimationFrame = global.requestAnimationFrame;
window.cancelAnimationFrame = global.cancelAnimationFrame;
const stub2dCtx = {
  clearRect(){}, fillRect(){}, beginPath(){}, arc(){}, fill(){}, stroke(){}, moveTo(){}, lineTo(){},
  closePath(){}, drawImage(){}, createLinearGradient(){ return { addColorStop(){} }; },
  set fillStyle(v){}, get fillStyle(){ return '#000'; }, set strokeStyle(v){}, get strokeStyle(){ return '#000'; },
  set lineWidth(v){}, set lineJoin(v){}, set font(v){}, set textAlign(v){}, fillText(){}, measureText(){ return {width:0}; }, setTransform(){},
};
dom.window.HTMLCanvasElement.prototype.getContext = (type) => (type === '2d' ? stub2dCtx : null);
dom.window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
global.Image = dom.window.Image;
const imgProto = dom.window.HTMLImageElement.prototype;
const nativeSrcDesc = Object.getOwnPropertyDescriptor(imgProto, 'src');
Object.defineProperty(imgProto, 'src', {
  configurable: true,
  get() { return nativeSrcDesc.get.call(this); },
  set(v) { nativeSrcDesc.set.call(this, v); Promise.resolve().then(() => this.onload && this.onload()); },
});

const { BenchmarkEngine, ALL_TESTS } = await import('../src/engine.js');
const { RunScript } = await import('../src/replay.js');

const stage1 = document.createElement('div'); document.body.appendChild(stage1);
const stage2 = document.createElement('div'); document.body.appendChild(stage2);

const SMALL = {
  'dom-create': { sizes: [10] }, 'dom-update': { count: 20, updates: 10 }, 'dom-remove': { count: 10 },
  'massive-list': { sizes: [10] }, 'scroll-stress': { speeds: ['slow'] }, 'image-rendering': { counts: [3] },
  'animation-stress': { durationMs: 30, elementCount: 4 }, 'js-performance': { n: 200 },
  'event-stress': { perType: 10 }, 'layout-stress': { iterations: 10, elementCount: 5 },
  'resize-stress': { steps: 5 }, 'search-benchmark': { sizes: [10] }, 'canvas-benchmark': { counts: [10], durationMs: 30 },
  'svg-benchmark': { count: 10 }, 'css-benchmark': { ruleCount: 10, elementCount: 5 }, 'idle-benchmark': { samples: 1 },
  'cpu-throughput': { budgetMs: 10 }, 'browser-capability': {}, 'rendering-benchmark': { cycles: 2 },
  'memory-benchmark': { chunks: 1, chunkSize: 500 },
};

const seed = 555111;
const testOrder = ALL_TESTS.map(t => t.id);

const runA = await new BenchmarkEngine({ stage: stage1, onProgress(){}, onLog(){}, onLiveMetric(){} })
  .run(new RunScript(seed, testOrder, SMALL));
const runB = await new BenchmarkEngine({ stage: stage2, onProgress(){}, onLog(){}, onLiveMetric(){} })
  .run(new RunScript(seed, testOrder, SMALL));

let failures = 0;
for (const id of testOrder) {
  const a = runA.report.tests[id]?.params;
  const b = runB.report.tests[id]?.params;
  const aJson = JSON.stringify(a);
  const bJson = JSON.stringify(b);
  if (aJson !== bJson) {
    failures++;
    console.error(`FAIL - "${id}" params differ between two runs of the same seed`);
    console.error(`  A: ${aJson.slice(0, 200)}`);
    console.error(`  B: ${bJson.slice(0, 200)}`);
  } else {
    console.log(`  ok  - "${id}" params identical across replay`);
  }
}
console.log(`\n${failures === 0 ? 'All' : failures} replay-determinism checks ${failures === 0 ? 'passed' : 'FAILED'}.`);
process.exit(failures === 0 ? 0 : 1);
