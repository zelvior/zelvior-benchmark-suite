import { metric, Confidence, FPSMonitor, sleep } from '../metrics.js';

const COUNTS = [10000, 50000, 100000];

export const canvasBenchmarkTest = {
  id: 'canvas-benchmark',
  name: 'Canvas Benchmark',
  async run(ctx) {
    const { stage, rng, forcedParams, log } = ctx;
    const counts = forcedParams?.counts || COUNTS;
    const durationMs = forcedParams?.durationMs ?? 1500;
    const results = [];
    for (const count of counts) {
      stage.innerHTML = '';
      const canvas = document.createElement('canvas');
      canvas.width = 640; canvas.height = 360;
      canvas.className = 'zbs-bench-canvas';
      stage.appendChild(canvas);
      const g = canvas.getContext('2d');
      const objs = Array.from({ length: count }, () => ({
        x: rng.int(0, 640), y: rng.int(0, 360),
        vx: rng.float() * 2 - 1, vy: rng.float() * 2 - 1,
        color: rng.color(),
      }));
      const fps = new FPSMonitor();
      let active = true;
      const start = performance.now();
      function loop(t) {
        if (!active) return;
        g.clearRect(0, 0, canvas.width, canvas.height);
        g.fillStyle = 'rgba(0,0,0,0.15)';
        g.fillRect(0, 0, canvas.width, canvas.height);
        for (const o of objs) {
          o.x += o.vx; o.y += o.vy;
          if (o.x < 0 || o.x > canvas.width) o.vx *= -1;
          if (o.y < 0 || o.y > canvas.height) o.vy *= -1;
          g.fillStyle = o.color;
          g.fillRect(o.x, o.y, 2, 2);
        }
        if (t - start < durationMs) requestAnimationFrame(loop);
        else active = false;
      }
      fps.start();
      requestAnimationFrame(loop);
      await sleep(durationMs + 50);
      const summary = fps.stop();
      log(`Canvas ${count} objects: avg ${summary?.avgFps.value ?? 'n/a'}fps`);
      results.push({ count, fps: summary });
      stage.innerHTML = '';
    }
    return { params: { counts, durationMs }, results };
  },
};
