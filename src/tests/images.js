import { metric, Confidence, now } from '../metrics.js';

const COUNTS = [50, 100, 250, 500, 1000];

function svgDataUri(rng, size) {
  const c1 = rng.color(), c2 = rng.color();
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'>
    <rect width='100%' height='100%' fill='${c1}'/>
    <circle cx='${size / 2}' cy='${size / 2}' r='${size / 3}' fill='${c2}'/>
  </svg>`;
  return 'data:image/svg+xml;base64,' + btoa(svg);
}

function canvasDataUri(rng, size, type) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = rng.color();
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 6; i++) {
    g.fillStyle = rng.color();
    g.beginPath();
    g.arc(rng.int(0, size), rng.int(0, size), rng.int(4, size / 4), 0, Math.PI * 2);
    g.fill();
  }
  return c.toDataURL(type);
}

export const imageRenderingTest = {
  id: 'image-rendering',
  name: 'Image Rendering Test',
  async run(ctx) {
    const { stage, rng, forcedParams, log } = ctx;
    const counts = forcedParams?.counts || COUNTS;
    const results = [];
    const sourcesByCount = {};
    for (const count of counts) {
      stage.innerHTML = '';
      const grid = document.createElement('div');
      grid.className = 'zbs-image-grid';
      stage.appendChild(grid);

      const sources = forcedParams?.sources?.[count] || Array.from({ length: count }, () => {
        const size = rng.pick([64, 128, 256]);
        const kind = rng.pick(['svg', 'png', 'jpeg', 'webp']);
        const lazy = rng.bool(0.5);
        const uri = kind === 'svg' ? svgDataUri(rng, size) : canvasDataUri(rng, size, `image/${kind === 'jpeg' ? 'jpeg' : kind}`);
        return { size, kind, lazy, uri };
      });
      sourcesByCount[count] = sources;

      const memBefore = performance.memory ? performance.memory.usedJSHeapSize : null;
      const t0 = now();
      const loadPromises = sources.map(src => new Promise((resolve) => {
        const img = new Image();
        img.loading = src.lazy ? 'lazy' : 'eager';
        img.width = src.size; img.height = src.size;
        img.onload = () => resolve(now());
        img.onerror = () => resolve(now());
        img.src = src.uri;
        grid.appendChild(img);
      }));
      const decodeTimes = await Promise.all(loadPromises);
      const decodeTime = decodeTimes.reduce((a, b) => Math.max(a, b), 0) - t0;
      await new Promise(r => requestAnimationFrame(r));
      const paintTime = now() - t0;
      const memAfter = performance.memory ? performance.memory.usedJSHeapSize : null;

      log(`Images ${count}: decode ${decodeTime.toFixed(1)}ms, paint ${paintTime.toFixed(1)}ms`);
      results.push({
        count,
        decodeTime: metric(+decodeTime.toFixed(2), 'ms', Confidence.MEASURED),
        paintTime: metric(+paintTime.toFixed(2), 'ms', Confidence.ESTIMATED, 'via rAF, not real paint timing'),
        memoryDelta: memBefore != null
          ? metric(Math.round((memAfter - memBefore) / 1024), 'KB', Confidence.ESTIMATED)
          : metric(null, 'KB', Confidence.INFERRED),
      });
      stage.innerHTML = '';
    }
    return { params: { counts, sources: sourcesByCount }, results };
  },
};
