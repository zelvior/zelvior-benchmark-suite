import { metric, Confidence, now } from '../metrics.js';

export const jsPerformanceTest = {
  id: 'js-performance',
  name: 'JavaScript Performance Test',
  async run(ctx) {
    const { rng, forcedParams, log } = ctx;
    const n = forcedParams?.n ?? 200000;
    const results = {};

    let t0 = now();
    const objs = [];
    for (let i = 0; i < n; i++) objs.push({ id: i, v: rng.float(), name: 'o' + i });
    results.objectCreation = metric(+(now() - t0).toFixed(2), 'ms', Confidence.MEASURED);

    t0 = now();
    const arr = [];
    for (let i = 0; i < n; i++) arr.push(i);
    arr.sort((a, b) => b - a);
    const mapped = arr.map(x => x * 2).filter(x => x % 3 === 0);
    void mapped.reduce((a, b) => a + b, 0);
    results.arrayOps = metric(+(now() - t0).toFixed(2), 'ms', Confidence.MEASURED);

    t0 = now();
    const map = new Map();
    const set = new Set();
    for (let i = 0; i < n; i++) { map.set(i, i * i); set.add(i % 1000); }
    results.mapSetOps = metric(+(now() - t0).toFixed(2), 'ms', Confidence.MEASURED);

    t0 = now();
    let sum = 0;
    for (let i = 0; i < n; i++) sum += Math.sqrt(i) * Math.sin(i);
    results.loops = metric(+(now() - t0).toFixed(2), 'ms', Confidence.MEASURED, `checksum:${sum.toFixed(2)}`);

    t0 = now();
    const json = JSON.stringify(objs.slice(0, Math.min(n, 20000)));
    JSON.parse(json);
    results.jsonRoundtrip = metric(+(now() - t0).toFixed(2), 'ms', Confidence.MEASURED);

    t0 = now();
    let str = '';
    for (let i = 0; i < Math.min(n, 50000); i++) str += rng.string(4);
    void str.split('').reverse().join('');
    results.stringOps = metric(+(now() - t0).toFixed(2), 'ms', Confidence.MEASURED);

    t0 = now();
    const promises = Array.from({ length: 500 }, (_, i) => Promise.resolve(i));
    await Promise.all(promises);
    results.promiseOps = metric(+(now() - t0).toFixed(2), 'ms', Confidence.MEASURED);

    t0 = now();
    const loopStart = now();
    await new Promise(r => setTimeout(r, 0));
    results.eventLoopLatency = metric(+(now() - loopStart).toFixed(2), 'ms', Confidence.MEASURED,
      'setTimeout(0) scheduling delay');

    log(`JS perf complete: n=${n}`);
    return { params: { n }, results };
  },
};
