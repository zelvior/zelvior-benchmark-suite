import { metric, Confidence, now } from '../metrics.js';

const SIZES = [100, 1000, 10000, 50000, 100000];

export const domCreateTest = {
  id: 'dom-create',
  name: 'DOM Creation Test',
  async run(ctx) {
    const { stage, forcedParams, log } = ctx;
    const sizes = forcedParams?.sizes || SIZES;
    const results = [];
    for (const size of sizes) {
      stage.innerHTML = '';
      const memBefore = performance.memory ? performance.memory.usedJSHeapSize : null;
      const t0 = now();
      const frag = document.createDocumentFragment();
      for (let i = 0; i < size; i++) {
        const el = document.createElement('div');
        el.className = 'zbs-node';
        el.textContent = 'n' + i;
        frag.appendChild(el);
      }
      const createTime = now() - t0;
      const t1 = now();
      stage.appendChild(frag);
      const paintStart = now();
      await new Promise(r => requestAnimationFrame(() => { r(); }));
      const paintDelay = now() - paintStart;
      const renderTime = now() - t1;
      const memAfter = performance.memory ? performance.memory.usedJSHeapSize : null;
      log(`DOM create ${size} nodes: ${createTime.toFixed(1)}ms create, ${renderTime.toFixed(1)}ms render`);
      results.push({
        size,
        createTime: metric(+createTime.toFixed(2), 'ms', Confidence.MEASURED),
        renderTime: metric(+renderTime.toFixed(2), 'ms', Confidence.MEASURED),
        paintDelay: metric(+paintDelay.toFixed(2), 'ms', Confidence.ESTIMATED, 'via double rAF, not true paint timing'),
        memoryDelta: memBefore != null
          ? metric(Math.round((memAfter - memBefore) / 1024), 'KB', Confidence.ESTIMATED)
          : metric(null, 'KB', Confidence.INFERRED, 'performance.memory unavailable'),
      });
    }
    stage.innerHTML = '';
    return { params: { sizes }, results };
  },
};

export const domUpdateTest = {
  id: 'dom-update',
  name: 'DOM Update Test',
  async run(ctx) {
    const { stage, rng, forcedParams, log } = ctx;
    const count = forcedParams?.count ?? 20000;
    const updates = forcedParams?.updates ?? 5000;
    stage.innerHTML = '';
    const frag = document.createDocumentFragment();
    const nodes = [];
    for (let i = 0; i < count; i++) {
      const el = document.createElement('div');
      el.className = 'zbs-node';
      el.textContent = 'n' + i;
      nodes.push(el);
      frag.appendChild(el);
    }
    stage.appendChild(frag);
    await new Promise(r => requestAnimationFrame(r));

    const order = forcedParams?.order || Array.from({ length: updates }, () => rng.int(0, count - 1));
    let dropped = 0;
    const perUpdate = [];
    let lastFrame = now();
    const t0 = now();
    for (let i = 0; i < order.length; i++) {
      const idx = order[i];
      const u0 = now();
      nodes[idx].textContent = 'u' + i;
      nodes[idx].style.background = rng.color();
      perUpdate.push(now() - u0);
      if (i % 200 === 0) {
        await new Promise(r => requestAnimationFrame(r));
        const frameDt = now() - lastFrame;
        lastFrame = now();
        if (frameDt > 1000 / 30) dropped++;
      }
    }
    const totalTime = now() - t0;
    const avgUpdate = perUpdate.reduce((a, b) => a + b, 0) / perUpdate.length;
    log(`DOM update: ${updates} updates over ${count} nodes in ${totalTime.toFixed(1)}ms`);
    stage.innerHTML = '';
    return {
      params: { count, updates, order },
      results: {
        totalTime: metric(+totalTime.toFixed(2), 'ms', Confidence.MEASURED),
        avgUpdateTime: metric(+avgUpdate.toFixed(4), 'ms', Confidence.MEASURED),
        droppedFrames: metric(dropped, 'frames', Confidence.ESTIMATED, 'sampled every 200 updates'),
      },
    };
  },
};

export const domRemoveTest = {
  id: 'dom-remove',
  name: 'DOM Remove Test',
  async run(ctx) {
    const { stage, forcedParams, log } = ctx;
    const count = forcedParams?.count ?? 30000;
    stage.innerHTML = '';
    const frag = document.createDocumentFragment();
    for (let i = 0; i < count; i++) {
      const el = document.createElement('div');
      el.className = 'zbs-node';
      frag.appendChild(el);
    }
    stage.appendChild(frag);
    await new Promise(r => requestAnimationFrame(r));

    const t0 = now();
    while (stage.firstChild) stage.removeChild(stage.firstChild);
    const cleanupTime = now() - t0;
    log(`DOM remove: cleaned ${count} nodes in ${cleanupTime.toFixed(1)}ms`);
    return {
      params: { count },
      results: { cleanupTime: metric(+cleanupTime.toFixed(2), 'ms', Confidence.MEASURED) },
    };
  },
};
