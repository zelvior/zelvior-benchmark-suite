import { metric, Confidence, now } from '../metrics.js';

export const svgBenchmarkTest = {
  id: 'svg-benchmark',
  name: 'SVG Benchmark',
  async run(ctx) {
    const { stage, rng, forcedParams, log } = ctx;
    const count = forcedParams?.count ?? 8000;
    stage.innerHTML = '';
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 640 360');
    svg.classList.add('zbs-bench-svg');
    stage.appendChild(svg);

    const t0 = now();
    const frag = document.createDocumentFragment();
    for (let i = 0; i < count; i++) {
      const shape = document.createElementNS(svgNS, rng.pick(['circle', 'rect']));
      if (shape.tagName === 'circle') {
        shape.setAttribute('cx', rng.int(0, 640));
        shape.setAttribute('cy', rng.int(0, 360));
        shape.setAttribute('r', rng.int(1, 4));
      } else {
        shape.setAttribute('x', rng.int(0, 640));
        shape.setAttribute('y', rng.int(0, 360));
        shape.setAttribute('width', rng.int(2, 8));
        shape.setAttribute('height', rng.int(2, 8));
      }
      shape.setAttribute('fill', rng.color());
      frag.appendChild(shape);
    }
    svg.appendChild(frag);
    const createTime = now() - t0;
    await new Promise(r => requestAnimationFrame(r));
    const renderTime = now() - t0;
    log(`SVG benchmark: ${count} elements in ${renderTime.toFixed(1)}ms`);
    stage.innerHTML = '';
    return {
      params: { count },
      results: {
        createTime: metric(+createTime.toFixed(2), 'ms', Confidence.MEASURED),
        renderTime: metric(+renderTime.toFixed(2), 'ms', Confidence.MEASURED),
      },
    };
  },
};
