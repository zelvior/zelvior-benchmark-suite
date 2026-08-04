import { metric, Confidence, now, sleep } from '../metrics.js';

export const memoryBenchmarkTest = {
  id: 'memory-benchmark',
  name: 'Memory Benchmark',
  async run(ctx) {
    const { stage, forcedParams, log } = ctx;
    const chunks = forcedParams?.chunks ?? 20;
    const chunkSize = forcedParams?.chunkSize ?? 500000;
    const hasMemAPI = !!performance.memory;
    const peakSamples = [];
    const start = hasMemAPI ? performance.memory.usedJSHeapSize : null;
    let peak = start ?? 0;

    let holder = [];
    for (let i = 0; i < chunks; i++) {
      holder.push(new Float64Array(chunkSize / 8).fill(i));
      if (hasMemAPI) {
        const cur = performance.memory.usedJSHeapSize;
        peak = Math.max(peak, cur);
        peakSamples.push(cur);
      }
      await sleep(5);
    }

    // detached DOM estimation: create+detach nodes without releasing refs
    const detached = [];
    for (let i = 0; i < 5000; i++) detached.push(document.createElement('div'));
    const detachedCount = detached.length;

    const beforeRelease = hasMemAPI ? performance.memory.usedJSHeapSize : null;
    holder = null;
    detached.length = 0;
    await sleep(50);
    const afterRelease = hasMemAPI ? performance.memory.usedJSHeapSize : null;

    log(`Memory benchmark: ${chunks} chunks x ${chunkSize} bytes allocated`);
    return {
      params: { chunks, chunkSize },
      results: {
        current: hasMemAPI
          ? metric(Math.round(afterRelease / 1048576), 'MB', Confidence.ESTIMATED)
          : metric(null, 'MB', Confidence.INFERRED, 'performance.memory unavailable'),
        peak: hasMemAPI
          ? metric(Math.round(peak / 1048576), 'MB', Confidence.ESTIMATED)
          : metric(null, 'MB', Confidence.INFERRED),
        growth: hasMemAPI
          ? metric(Math.round((peak - start) / 1048576), 'MB', Confidence.ESTIMATED)
          : metric(null, 'MB', Confidence.INFERRED),
        released: hasMemAPI && beforeRelease != null
          ? metric(Math.round((beforeRelease - afterRelease) / 1048576), 'MB', Confidence.ESTIMATED,
            'not a real GC trigger; browser may defer collection')
          : metric(null, 'MB', Confidence.INFERRED),
        detachedNodesEstimate: metric(detachedCount, 'nodes', Confidence.INFERRED,
          'no direct API for detached-node counting; this is a synthetic probe, not a measurement of real leaks'),
        gcEventsObserved: metric(0, 'count', Confidence.INFERRED, 'no reliable cross-browser GC event API'),
      },
    };
  },
};
