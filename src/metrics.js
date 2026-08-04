// Shared measurement primitives. Every metric is tagged with a confidence
// level so the report can state whether it is measured, estimated, or inferred.

export const Confidence = { MEASURED: 'measured', ESTIMATED: 'estimated', INFERRED: 'inferred' };

export function metric(value, unit, confidence, note = '') {
  return { value, unit, confidence, note };
}

export class FPSMonitor {
  constructor() {
    this.frames = [];
    this._running = false;
    this._last = 0;
    this._raf = null;
  }
  start() {
    this._running = true;
    this._last = performance.now();
    const loop = (t) => {
      if (!this._running) return;
      const dt = t - this._last;
      this._last = t;
      if (dt > 0) this.frames.push(dt);
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }
  stop() {
    this._running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    return this.summary();
  }
  summary() {
    if (this.frames.length === 0) return null;
    const fps = this.frames.map(dt => 1000 / dt);
    const avg = fps.reduce((a, b) => a + b, 0) / fps.length;
    const min = Math.min(...fps);
    const max = Math.max(...fps);
    const mean = this.frames.reduce((a, b) => a + b, 0) / this.frames.length;
    const variance = this.frames.reduce((a, b) => a + (b - mean) ** 2, 0) / this.frames.length;
    const dropped = this.frames.filter(dt => dt > 1000 / 30).length;
    const jankPct = (dropped / this.frames.length) * 100;
    return {
      avgFps: metric(+avg.toFixed(1), 'fps', Confidence.MEASURED),
      minFps: metric(+min.toFixed(1), 'fps', Confidence.MEASURED),
      maxFps: metric(+max.toFixed(1), 'fps', Confidence.MEASURED),
      frameTime: metric(+mean.toFixed(2), 'ms', Confidence.MEASURED),
      frameVariance: metric(+Math.sqrt(variance).toFixed(2), 'ms(stdev)', Confidence.MEASURED),
      droppedFrames: metric(dropped, 'frames', Confidence.MEASURED, 'threshold <30fps'),
      jankPercent: metric(+jankPct.toFixed(2), '%', Confidence.MEASURED),
      sampleCount: this.frames.length,
    };
  }
}

export function memorySnapshot() {
  const m = performance.memory;
  if (m) {
    return metric(Math.round(m.usedJSHeapSize / 1048576), 'MB', Confidence.ESTIMATED,
      'performance.memory is Chromium-only and coarse-grained');
  }
  return metric(null, 'MB', Confidence.INFERRED, 'performance.memory unavailable in this browser');
}

export async function withLongTaskObserver(fn) {
  const tasks = [];
  let observer = null;
  try {
    observer = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) tasks.push(e.duration);
    });
    observer.observe({ type: 'longtask', buffered: false });
  } catch { /* longtask API unsupported */ }
  const result = await fn();
  if (observer) observer.disconnect();
  return {
    result,
    longTasks: metric(tasks.length, 'count', observer ? Confidence.MEASURED : Confidence.INFERRED),
    longTaskTime: metric(+tasks.reduce((a, b) => a + b, 0).toFixed(2), 'ms',
      observer ? Confidence.MEASURED : Confidence.INFERRED),
  };
}

export function now() { return performance.now(); }

export function mark(name) { performance.mark(name); }

export function measureBetween(name, startMark, endMark) {
  performance.mark(endMark);
  performance.measure(name, startMark, endMark);
  const entries = performance.getEntriesByName(name, 'measure');
  const dur = entries.length ? entries[entries.length - 1].duration : 0;
  performance.clearMarks(startMark);
  performance.clearMarks(endMark);
  performance.clearMeasures(name);
  return dur;
}

export function nextFrame() {
  return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
}

export function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
