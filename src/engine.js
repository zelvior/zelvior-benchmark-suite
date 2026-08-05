import { SeededRandom, makeSeed, deriveSeed } from './rng.js';
import { RunScript, saveLastRun } from './replay.js';
import { buildReport } from './report.js';
import { now, FPSMonitor, memorySnapshot } from './metrics.js';

import { domCreateTest, domUpdateTest, domRemoveTest } from './tests/dom.js';
import { massiveListTest } from './tests/list.js';
import { scrollStressTest } from './tests/scroll.js';
import { imageRenderingTest } from './tests/images.js';
import { animationStressTest } from './tests/animation.js';
import { jsPerformanceTest } from './tests/jsperf.js';
import { eventStressTest } from './tests/events.js';
import { layoutStressTest, resizeTest } from './tests/layout.js';
import { searchBenchmarkTest } from './tests/search.js';
import { memoryBenchmarkTest } from './tests/memory.js';
import { browserCapabilityTest } from './tests/capability.js';
import { renderingBenchmarkTest } from './tests/rendering.js';
import { canvasBenchmarkTest } from './tests/canvas.js';
import { svgBenchmarkTest } from './tests/svg.js';
import { cssBenchmarkTest } from './tests/css.js';
import { idleBenchmarkTest } from './tests/idle.js';
import { cpuThroughputTest } from './tests/cpu.js';

export const ALL_TESTS = [
  browserCapabilityTest,
  cpuThroughputTest,
  domCreateTest,
  domUpdateTest,
  domRemoveTest,
  massiveListTest,
  scrollStressTest,
  imageRenderingTest,
  animationStressTest,
  jsPerformanceTest,
  eventStressTest,
  layoutStressTest,
  resizeTest,
  searchBenchmarkTest,
  canvasBenchmarkTest,
  svgBenchmarkTest,
  cssBenchmarkTest,
  idleBenchmarkTest,
  renderingBenchmarkTest,
  memoryBenchmarkTest,
];

const TEST_BY_ID = Object.fromEntries(ALL_TESTS.map(t => [t.id, t]));

// No single test is allowed to hang the entire suite forever. This is a
// deliberate safety net, not a substitute for fixing real hangs at the
// source (see images.js for a real one that was found and fixed) — it
// exists because a real browser can surface stalls this codebase's own
// jsdom-based testing cannot reproduce (jsdom doesn't implement real
// viewport-gated lazy loading, real network stalls, etc).
const TEST_TIMEOUT_MS = 20000;

function runWithWatchdog(promise, timeoutMs, testName) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs / 1000}s (test likely stalled)`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export class BenchmarkEngine {
  constructor({ stage, onProgress, onLog, onLiveMetric }) {
    this.stage = stage;
    this.onProgress = onProgress || (() => {});
    this.onLog = onLog || (() => {});
    this.onLiveMetric = onLiveMetric || (() => {});
    this._cancel = false;
  }

  cancel() { this._cancel = true; }

  /** Run a fresh benchmark, or replay an exact prior RunScript. */
  async run(replayScript = null) {
    this._cancel = false;
    const seed = replayScript ? replayScript.seed : makeSeed();
    const testOrder = replayScript ? replayScript.testOrder : ALL_TESTS.map(t => t.id);
    const runScript = replayScript || new RunScript(seed, testOrder, {});

    const byTestId = {};
    const log = [];
    const startedAt = now();
    let liveFpsMonitor = null;

    const logFn = (msg) => {
      const line = `[${((now() - startedAt) / 1000).toFixed(2)}s] ${msg}`;
      log.push(line);
      this.onLog(line);
    };

    liveFpsMonitor = new FPSMonitor();
    liveFpsMonitor.start();
    const liveTimer = setInterval(() => {
      const recent = liveFpsMonitor.frames.slice(-30);
      const fps = recent.length ? 1000 / (recent.reduce((a, b) => a + b, 0) / recent.length) : 60;
      this.onLiveMetric({ fps, memory: memorySnapshot() });
    }, 500);

    for (let i = 0; i < testOrder.length; i++) {
      if (this._cancel) { logFn('Benchmark cancelled by user.'); break; }
      const testId = testOrder[i];
      const test = TEST_BY_ID[testId];
      if (!test) { logFn(`Unknown test id ${testId}, skipping.`); continue; }

      this.onProgress({
        index: i, total: testOrder.length, testId, testName: test.name,
        elapsedMs: now() - startedAt,
      });
      logFn(`Starting: ${test.name}`);

      const forcedParams = replayScript ? replayScript.params[testId] : undefined;
      const testRng = new SeededRandom(deriveSeed(seed, testId));
      const t0 = now();
      try {
        const outcome = await runWithWatchdog(
          test.run({ stage: this.stage, rng: testRng, forcedParams, log: logFn }),
          TEST_TIMEOUT_MS,
          test.name,
        );
        byTestId[testId] = outcome; // full {params, results}
        runScript.params[testId] = outcome.params;
        logFn(`Finished: ${test.name} (${((now() - t0) / 1000).toFixed(2)}s)`);
      } catch (err) {
        logFn(`Error in ${test.name}: ${err.message}`);
        byTestId[testId] = { params: forcedParams || {}, results: { error: String(err.message) } };
      }
      this.stage.innerHTML = '';
      await new Promise(r => setTimeout(r, 30));
    }

    clearInterval(liveTimer);
    liveFpsMonitor.stop();
    const finishedAt = now();

    const report = buildReport({ runScript, byTestId, log, startedAt, finishedAt });

    await saveLastRun(runScript, report);
    this.onProgress({ index: testOrder.length, total: testOrder.length, testId: null, testName: 'Complete', elapsedMs: finishedAt - startedAt });
    return { runScript, report };
  }
}
