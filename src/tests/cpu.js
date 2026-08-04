import { metric, Confidence, now } from '../metrics.js';

// There is no browser API for real CPU utilization. This test instead
// measures relative single-threaded throughput (integer + float ops per
// second in a fixed time budget) as a repeatable, comparable proxy —
// explicitly NOT a percentage of CPU used, which browsers cannot expose.
export const cpuThroughputTest = {
  id: 'cpu-throughput',
  name: 'CPU Throughput Calibration',
  async run(ctx) {
    const { forcedParams, log } = ctx;
    const budgetMs = forcedParams?.budgetMs ?? 400;
    const t0 = now();
    let ops = 0;
    let x = 0.0001;
    while (now() - t0 < budgetMs) {
      for (let i = 0; i < 10000; i++) {
        x = (x * 1.0000001 + Math.sin(x)) % 1000;
        ops++;
      }
    }
    const elapsed = now() - t0;
    const opsPerSec = ops / (elapsed / 1000);
    log(`CPU throughput: ${(opsPerSec / 1e6).toFixed(2)}M ops/sec (checksum ${x.toFixed(4)})`);
    return {
      params: { budgetMs },
      results: {
        opsPerSecond: metric(Math.round(opsPerSec), 'ops/sec', Confidence.MEASURED,
          'relative single-threaded throughput proxy, not a CPU utilization percentage — no such API exists in browsers'),
        checksum: metric(+x.toFixed(6), 'value', Confidence.MEASURED, 'prevents dead-code elimination of the loop'),
      },
    };
  },
};
