import { metric, Confidence, withLongTaskObserver, now, sleep } from '../metrics.js';

export const renderingBenchmarkTest = {
  id: 'rendering-benchmark',
  name: 'Rendering Benchmark',
  async run(ctx) {
    const { stage, rng, forcedParams, log } = ctx;
    const cycles = forcedParams?.cycles ?? 60;
    stage.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'zbs-render-probe';
    stage.appendChild(box);

    const { result: cycleTime, longTasks, longTaskTime } = await withLongTaskObserver(async () => {
      const t0 = now();
      for (let i = 0; i < cycles; i++) {
        box.style.transform = `translateX(${rng.int(0, 100)}px) rotate(${rng.int(0, 360)}deg)`;
        box.style.background = rng.color();
        box.style.boxShadow = `0 0 ${rng.int(0, 40)}px ${rng.color()}`;
        await new Promise(r => requestAnimationFrame(r));
      }
      return now() - t0;
    });

    log(`Rendering benchmark: ${cycles} paint/composite cycles`);
    stage.innerHTML = '';
    return {
      params: { cycles },
      results: {
        paintCompositeCycleTime: metric(+(cycleTime / cycles).toFixed(2), 'ms/cycle', Confidence.ESTIMATED, 'rAF-to-rAF timing; approximates paint+composite, not a direct measurement'),
        longTasks,
        longTaskTime,
        mainThreadBlocking: longTaskTime,
      },
    };
  },
};
