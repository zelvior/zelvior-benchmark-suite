import { metric, Confidence, now, FPSMonitor } from '../metrics.js';

const SPEEDS = { slow: 2, medium: 6, fast: 16, extreme: 40 };

export const scrollStressTest = {
  id: 'scroll-stress',
  name: 'Scroll Stress Test',
  async run(ctx) {
    const { stage, rng, forcedParams, log } = ctx;
    const speeds = forcedParams?.speeds || Object.keys(SPEEDS);
    stage.innerHTML = '';
    const container = document.createElement('div');
    container.className = 'zbs-list-viewport';
    const frag = document.createDocumentFragment();
    for (let i = 0; i < 8000; i++) {
      const row = document.createElement('div');
      row.className = 'zbs-list-row';
      row.textContent = `row ${i} :: ${rng.string(20)}`;
      frag.appendChild(row);
    }
    container.appendChild(frag);
    stage.appendChild(container);
    await new Promise(r => requestAnimationFrame(r));

    const results = {};
    for (const speedName of speeds) {
      const step = SPEEDS[speedName];
      container.scrollTop = 0;
      const fps = new FPSMonitor();
      const latencies = [];
      fps.start();
      const maxScroll = container.scrollHeight - container.clientHeight;
      let pos = 0;
      while (pos < maxScroll) {
        const t0 = now();
        pos += step * 20;
        container.scrollTop = pos;
        await new Promise(r => requestAnimationFrame(r));
        latencies.push(now() - t0);
      }
      const summary = fps.stop();
      const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      log(`Scroll ${speedName}: avg ${summary?.avgFps.value ?? 'n/a'}fps`);
      results[speedName] = {
        ...summary,
        scrollLatency: metric(+avgLatency.toFixed(2), 'ms', Confidence.MEASURED),
      };
    }
    stage.innerHTML = '';
    return { params: { speeds }, results };
  },
};
