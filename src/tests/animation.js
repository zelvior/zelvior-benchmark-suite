import { metric, Confidence, FPSMonitor, sleep } from '../metrics.js';

export const animationStressTest = {
  id: 'animation-stress',
  name: 'Animation Stress Test',
  async run(ctx) {
    const { stage, rng, forcedParams, log } = ctx;
    const duration = forcedParams?.durationMs ?? 4000;
    const elementCount = forcedParams?.elementCount ?? 120;
    stage.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'zbs-anim-wrap';
    stage.appendChild(wrap);

    const types = ['transform', 'opacity', 'scale', 'rotate', 'blur', 'gradient'];
    for (let i = 0; i < elementCount; i++) {
      const el = document.createElement('div');
      el.className = `zbs-anim-el zbs-anim-${types[i % types.length]}`;
      el.style.left = rng.int(0, 90) + '%';
      el.style.top = rng.int(0, 90) + '%';
      el.style.animationDuration = rng.int(600, 1800) + 'ms';
      wrap.appendChild(el);
    }

    const canvas = document.createElement('canvas');
    canvas.width = 300; canvas.height = 150; canvas.className = 'zbs-anim-canvas';
    wrap.appendChild(canvas);
    const g = canvas.getContext('2d');

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 300 150');
    svg.classList.add('zbs-anim-svg');
    const svgCircle = document.createElementNS(svgNS, 'circle');
    svgCircle.setAttribute('r', '20'); svgCircle.setAttribute('fill', rng.color());
    svg.appendChild(svgCircle);
    wrap.appendChild(svg);

    const fps = new FPSMonitor();
    let rafActive = true;
    const start = performance.now();
    function rafLoop(t) {
      if (!rafActive) return;
      const p = (t - start) / duration;
      g.clearRect(0, 0, 300, 150);
      g.fillStyle = `hsl(${(t / 5) % 360},70%,55%)`;
      g.beginPath();
      g.arc(150 + Math.sin(t / 200) * 100, 75 + Math.cos(t / 300) * 50, 12, 0, Math.PI * 2);
      g.fill();
      svgCircle.setAttribute('cx', 150 + Math.sin(t / 250) * 120);
      svgCircle.setAttribute('cy', 75 + Math.cos(t / 250) * 60);
      requestAnimationFrame(rafLoop);
    }
    fps.start();
    requestAnimationFrame(rafLoop);
    await sleep(duration);
    rafActive = false;
    const summary = fps.stop();
    log(`Animation stress: avg ${summary?.avgFps.value ?? 'n/a'}fps over ${elementCount} elements`);
    stage.innerHTML = '';
    return { params: { durationMs: duration, elementCount }, results: summary };
  },
};
