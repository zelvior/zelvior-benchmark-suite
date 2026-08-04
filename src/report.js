// Scoring and report generation. Scores are 0-100, derived from measured
// metrics against reference baselines. Every score notes its inputs.

function clampScore(x) { return Math.max(0, Math.min(100, Math.round(x))); }

function fpsScore(summary, target = 60) {
  if (!summary) return null;
  const avg = summary.avgFps.value;
  const jank = summary.jankPercent.value;
  return clampScore((avg / target) * 100 - jank * 0.5);
}

function timeScore(ms, goodMs, badMs) {
  if (ms == null) return null;
  if (ms <= goodMs) return 100;
  if (ms >= badMs) return 0;
  return clampScore(100 - ((ms - goodMs) / (badMs - goodMs)) * 100);
}

export function scoreRun(byTestId) {
  const scores = {};

  const domCreate = byTestId['dom-create'];
  if (domCreate) {
    const worst = domCreate.results[domCreate.results.length - 1];
    scores.dom = timeScore(worst.createTime.value, 200, 4000);
  }

  const scroll = byTestId['scroll-stress'];
  if (scroll) {
    const vals = Object.values(scroll.results).map(r => fpsScore(r)).filter(v => v != null);
    scores.scrolling = vals.length ? clampScore(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  }

  const anim = byTestId['animation-stress'];
  if (anim) scores.animation = fpsScore(anim.results);

  const jsperf = byTestId['js-performance'];
  if (jsperf) {
    const total = Object.values(jsperf.results)
      .filter(m => typeof m.value === 'number')
      .reduce((a, m) => a + m.value, 0);
    scores.javascript = timeScore(total, 300, 5000);
  }

  const mem = byTestId['memory-benchmark'];
  if (mem && mem.results.growth.value != null) {
    scores.memory = timeScore(mem.results.growth.value, 20, 400);
  }

  const images = byTestId['image-rendering'];
  if (images) {
    const worst = images.results[images.results.length - 1];
    scores.image = timeScore(worst.decodeTime.value, 100, 2000);
  }

  const layout = byTestId['layout-stress'];
  if (layout) scores.layout = timeScore(layout.results.avgPerMutation.value, 0.05, 2);

  const search = byTestId['search-benchmark'];
  if (search) {
    const worst = search.results[search.results.length - 1];
    scores.search = timeScore(worst.searchLatency.value, 20, 500);
  }

  const canvas = byTestId['canvas-benchmark'];
  if (canvas) {
    const worst = canvas.results[canvas.results.length - 1];
    scores.canvas = fpsScore(worst.fps);
  }

  const svg = byTestId['svg-benchmark'];
  if (svg) scores.svg = timeScore(svg.results.renderTime.value, 50, 1500);

  const rendering = byTestId['rendering-benchmark'];
  if (rendering) scores.rendering = timeScore(rendering.results.longTaskTime.value, 0, 1000);

  const valid = Object.values(scores).filter(v => v != null);
  const overall = valid.length ? clampScore(valid.reduce((a, b) => a + b, 0) / valid.length) : null;

  return { scores, overall };
}

export function ratingLabel(score) {
  if (score == null) return 'Unknown';
  if (score >= 90) return 'Excellent';
  if (score >= 75) return 'Very Good';
  if (score >= 55) return 'Good';
  if (score >= 35) return 'Average';
  return 'Poor';
}

export function buildReport({ runScript, byTestId, log, startedAt, finishedAt, capability }) {
  const { scores, overall } = scoreRun(byTestId);

  const counts = {
    testsRun: runScript.testOrder.length,
    domNodes: sumField(byTestId['dom-create'], 'results', r => r.size, r => true) +
      (byTestId['dom-update']?.params.count || 0),
    images: byTestId['image-rendering']?.results.reduce((a, r) => a + r.count, 0) || 0,
    animations: byTestId['animation-stress']?.params.elementCount || 0,
    domUpdates: byTestId['dom-update']?.params.updates || 0,
    scrollEvents: Object.keys(byTestId['scroll-stress']?.results || {}).length,
    searchOperations: byTestId['search-benchmark']?.results.length || 0,
    canvasObjects: byTestId['canvas-benchmark']?.results.reduce((a, r) => a + r.count, 0) || 0,
    svgElements: byTestId['svg-benchmark']?.params.count || 0,
  };

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      durationMs: finishedAt - startedAt,
      seed: runScript.seed,
      testOrder: runScript.testOrder,
      browser: capability?.results?.userAgent?.value,
      platform: capability?.results?.platform?.value,
      hardware: {
        cpuCores: capability?.results?.cpuCores?.value,
        ramEstimateGB: capability?.results?.ramEstimateGB?.value,
        gpuRenderer: capability?.results?.gpuRenderer?.value,
      },
    },
    scores,
    overall,
    rating: ratingLabel(overall),
    counts,
    tests: byTestId,
    log,
  };
}

function sumField(testResult, key, getter) {
  if (!testResult || !testResult[key]) return 0;
  const arr = testResult[key];
  return Array.isArray(arr) ? arr.reduce((a, r) => a + (getter(r) || 0), 0) : 0;
}

export function reportToJSON(report) {
  return JSON.stringify(report, null, 2);
}

export function reportToHTML(report) {
  const rows = Object.entries(report.scores)
    .map(([k, v]) => `<tr><td>${k}</td><td>${v ?? '—'}</td><td>${ratingLabel(v)}</td></tr>`)
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>ZBS Report</title>
  <style>
    body{font-family:ui-monospace,Menlo,Consolas,monospace;background:#0b0f10;color:#d7fbe8;padding:2rem}
    h1{color:#5CF2A0} table{border-collapse:collapse;width:100%;margin-top:1rem}
    td,th{border:1px solid #1e3a2d;padding:.5rem .75rem;text-align:left}
    .score{font-size:3rem;color:#5CF2A0}
  </style></head><body>
  <h1>Zelvior Benchmark Suite — Report</h1>
  <div class="score">${report.overall ?? '—'} / 100</div>
  <p>${report.rating}</p>
  <p>Seed: ${report.meta.seed} · Duration: ${(report.meta.durationMs / 1000).toFixed(1)}s · ${report.meta.generatedAt}</p>
  <p>Browser: ${report.meta.browser}</p>
  <table><thead><tr><th>Category</th><th>Score</th><th>Rating</th></tr></thead><tbody>${rows}</tbody></table>
  </body></html>`;
}

export function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

export function downloadPDF(report) {
  const html = reportToHTML(report);
  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
}
