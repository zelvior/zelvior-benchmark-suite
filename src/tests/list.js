import { metric, Confidence, now, FPSMonitor, sleep } from '../metrics.js';

const SIZES = [100, 1000, 10000, 50000];

export const massiveListTest = {
  id: 'massive-list',
  name: 'Massive List Test',
  async run(ctx) {
    const { stage, rng, forcedParams, log } = ctx;
    const sizes = forcedParams?.sizes || SIZES;
    const results = [];
    for (const size of sizes) {
      stage.innerHTML = '';
      const container = document.createElement('div');
      container.className = 'zbs-list-viewport';
      const memBefore = performance.memory ? performance.memory.usedJSHeapSize : null;
      const t0 = now();
      const frag = document.createDocumentFragment();
      for (let i = 0; i < size; i++) {
        const row = document.createElement('div');
        row.className = 'zbs-list-row';
        row.textContent = `#${i} — ${rng.string(12)}`;
        frag.appendChild(row);
      }
      container.appendChild(frag);
      stage.appendChild(container);
      const renderTime = now() - t0;
      await new Promise(r => requestAnimationFrame(r));
      const memAfter = performance.memory ? performance.memory.usedJSHeapSize : null;

      const fps = new FPSMonitor();
      fps.start();
      const steps = 40;
      const maxScroll = container.scrollHeight - container.clientHeight;
      for (let i = 0; i < steps; i++) {
        container.scrollTop = (maxScroll * i) / steps;
        await new Promise(r => requestAnimationFrame(r));
      }
      const fpsSummary = fps.stop();
      log(`Massive list ${size}: render ${renderTime.toFixed(1)}ms, scroll avg ${fpsSummary?.avgFps.value ?? 'n/a'}fps`);
      results.push({
        size,
        renderTime: metric(+renderTime.toFixed(2), 'ms', Confidence.MEASURED),
        scrollFps: fpsSummary,
        memoryDelta: memBefore != null
          ? metric(Math.round((memAfter - memBefore) / 1024), 'KB', Confidence.ESTIMATED)
          : metric(null, 'KB', Confidence.INFERRED),
      });
      stage.innerHTML = '';
    }
    return { params: { sizes }, results };
  },
};
