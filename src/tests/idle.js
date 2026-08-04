import { metric, Confidence, now, sleep } from '../metrics.js';

export const idleBenchmarkTest = {
  id: 'idle-benchmark',
  name: 'Idle Benchmark',
  async run(ctx) {
    const { forcedParams, log } = ctx;
    const samples = forcedParams?.samples ?? 10;
    const hasIdle = 'requestIdleCallback' in window;
    const deadlines = [];
    for (let i = 0; i < samples; i++) {
      const t0 = now();
      if (hasIdle) {
        await new Promise((resolve) => {
          requestIdleCallback((deadline) => {
            deadlines.push(deadline.timeRemaining());
            resolve();
          }, { timeout: 200 });
        });
      } else {
        await sleep(0);
        deadlines.push(null);
      }
    }
    const avgRemaining = hasIdle ? deadlines.reduce((a, b) => a + b, 0) / deadlines.length : null;
    log(`Idle benchmark: ${samples} idle callbacks sampled`);
    return {
      params: { samples },
      results: {
        avgTimeRemaining: hasIdle
          ? metric(+avgRemaining.toFixed(2), 'ms', Confidence.MEASURED)
          : metric(null, 'ms', Confidence.INFERRED, 'requestIdleCallback unsupported'),
        api: metric(hasIdle ? 'requestIdleCallback' : 'setTimeout fallback', 'string', Confidence.MEASURED),
      },
    };
  },
};
