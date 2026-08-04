import { metric, Confidence, now } from '../metrics.js';

export const layoutStressTest = {
  id: 'layout-stress',
  name: 'Layout Stress Test',
  async run(ctx) {
    const { stage, rng, forcedParams, log } = ctx;
    const iterations = forcedParams?.iterations ?? 3000;
    const elementCount = forcedParams?.elementCount ?? 200;
    stage.innerHTML = '';
    const els = [];
    for (let i = 0; i < elementCount; i++) {
      const el = document.createElement('div');
      el.className = 'zbs-layout-el';
      stage.appendChild(el);
      els.push(el);
    }
    const displays = ['block', 'inline-block', 'flex', 'none', 'grid'];
    const positions = ['static', 'relative', 'absolute'];

    const t0 = now();
    let reflowProbe = 0;
    for (let i = 0; i < iterations; i++) {
      const el = els[i % els.length];
      el.style.width = rng.int(10, 200) + 'px';
      el.style.height = rng.int(10, 100) + 'px';
      el.style.margin = rng.int(0, 20) + 'px';
      el.style.padding = rng.int(0, 20) + 'px';
      el.style.fontSize = rng.int(8, 32) + 'px';
      el.style.position = positions[i % positions.length];
      el.style.visibility = i % 7 === 0 ? 'hidden' : 'visible';
      el.style.display = displays[i % displays.length];
      reflowProbe += el.offsetHeight; // forces synchronous layout
    }
    const totalTime = now() - t0;
    log(`Layout stress: ${iterations} mutations across ${elementCount} elements`);
    stage.innerHTML = '';
    return {
      params: { iterations, elementCount },
      results: {
        totalTime: metric(+totalTime.toFixed(2), 'ms', Confidence.MEASURED),
        avgPerMutation: metric(+(totalTime / iterations).toFixed(4), 'ms', Confidence.MEASURED),
        forcedReflowChecksum: metric(reflowProbe, 'px', Confidence.MEASURED, 'sum of offsetHeight reads'),
      },
    };
  },
};

export const resizeTest = {
  id: 'resize-stress',
  name: 'Resize Test',
  async run(ctx) {
    const { stage, forcedParams, log } = ctx;
    const steps = forcedParams?.steps ?? 200;
    stage.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'zbs-resize-box';
    box.textContent = 'resize probe';
    stage.appendChild(box);

    const t0 = now();
    let probe = 0;
    for (let i = 0; i < steps; i++) {
      const w = 100 + (i % 50) * 6;
      const h = 60 + (i % 30) * 4;
      box.style.width = w + 'px';
      box.style.height = h + 'px';
      probe += box.getBoundingClientRect().width;
    }
    const totalTime = now() - t0;
    log(`Resize test: ${steps} resizes`);
    stage.innerHTML = '';
    return {
      params: { steps },
      results: {
        totalTime: metric(+totalTime.toFixed(2), 'ms', Confidence.MEASURED),
        avgPerResize: metric(+(totalTime / steps).toFixed(4), 'ms', Confidence.MEASURED),
        checksum: metric(+probe.toFixed(1), 'px', Confidence.MEASURED),
      },
    };
  },
};
