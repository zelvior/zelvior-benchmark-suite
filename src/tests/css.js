import { metric, Confidence, now } from '../metrics.js';

export const cssBenchmarkTest = {
  id: 'css-benchmark',
  name: 'CSS Benchmark',
  async run(ctx) {
    const { stage, rng, forcedParams, log } = ctx;
    const ruleCount = forcedParams?.ruleCount ?? 6000;
    const elementCount = forcedParams?.elementCount ?? 1500;
    stage.innerHTML = '';
    const styleEl = document.createElement('style');
    document.head.appendChild(styleEl);
    const sheet = styleEl.sheet;

    const t0 = now();
    for (let i = 0; i < ruleCount; i++) {
      const rule = `.zbs-css-${i} { color: ${rng.color()}; padding: ${rng.int(0, 10)}px; border-radius: ${rng.int(0, 12)}px; }`;
      sheet.insertRule(rule, sheet.cssRules.length);
    }
    const insertTime = now() - t0;

    const frag = document.createDocumentFragment();
    for (let i = 0; i < elementCount; i++) {
      const el = document.createElement('div');
      el.className = `zbs-css-${i % ruleCount}`;
      el.textContent = '.';
      frag.appendChild(el);
    }
    const t1 = now();
    stage.appendChild(frag);
    let probe = 0;
    for (const el of stage.children) probe += el.offsetWidth;
    const recalcTime = now() - t1;

    log(`CSS benchmark: ${ruleCount} rules, ${elementCount} elements`);
    stage.innerHTML = '';
    document.head.removeChild(styleEl);
    return {
      params: { ruleCount, elementCount },
      results: {
        ruleInsertTime: metric(+insertTime.toFixed(2), 'ms', Confidence.MEASURED),
        styleRecalcTime: metric(+recalcTime.toFixed(2), 'ms', Confidence.ESTIMATED, 'forced via offsetWidth reads, approximates recalculation cost'),
        checksum: metric(probe, 'px', Confidence.MEASURED),
      },
    };
  },
};
