import { metric, Confidence, now } from '../metrics.js';

const SIZES = [100, 1000, 10000, 50000];
const WORDS = ['forge','vortex','pulse','grid','nexus','apex','zero','trace','runtime','render','frame','node'];

export const searchBenchmarkTest = {
  id: 'search-benchmark',
  name: 'Search Benchmark',
  async run(ctx) {
    const { stage, rng, forcedParams, log } = ctx;
    const sizes = forcedParams?.sizes || SIZES;
    const results = [];
    const itemsBySize = {};
    const query = forcedParams?.query || rng.pick(WORDS);
    for (const size of sizes) {
      const items = forcedParams?.items?.[size] || Array.from({ length: size }, (_, i) => ({
        id: i, label: `${rng.pick(WORDS)}-${rng.string(5)}-${i}`,
      }));
      itemsBySize[size] = items;

      const t0 = now();
      const filtered = items.filter(it => it.label.includes(query));
      const filterTime = now() - t0;

      stage.innerHTML = '';
      const list = document.createElement('div');
      list.className = 'zbs-list-viewport';
      const t1 = now();
      const frag = document.createDocumentFragment();
      for (const it of filtered.slice(0, 2000)) {
        const row = document.createElement('div');
        row.className = 'zbs-list-row';
        row.textContent = it.label;
        frag.appendChild(row);
      }
      list.appendChild(frag);
      stage.appendChild(list);
      await new Promise(r => requestAnimationFrame(r));
      const renderTime = now() - t1;
      const searchLatency = now() - t0;

      log(`Search ${size} items for "${query}": ${filtered.length} matches, ${searchLatency.toFixed(1)}ms`);
      results.push({
        size, query, matches: filtered.length,
        filterTime: metric(+filterTime.toFixed(2), 'ms', Confidence.MEASURED),
        renderTime: metric(+renderTime.toFixed(2), 'ms', Confidence.MEASURED),
        searchLatency: metric(+searchLatency.toFixed(2), 'ms', Confidence.MEASURED),
      });
      stage.innerHTML = '';
    }
    return { params: { sizes, query, items: itemsBySize }, results };
  },
};
