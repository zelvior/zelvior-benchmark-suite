// Scoring and report generation. Scores are 0-100, derived from measured
// metrics against reference baselines. Every score notes its inputs.

function clampScore(x) { return Math.max(0, Math.min(100, Math.round(x))); }

function fpsScore(summary, target = 60) {
  if (!summary || !summary.avgFps || typeof summary.avgFps.value !== 'number') return null;
  const avg = summary.avgFps.value;
  const jank = summary.jankPercent?.value ?? 0;
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
  const resultsOf = (id) => byTestId[id]?.results;

  const domCreate = resultsOf('dom-create');
  if (Array.isArray(domCreate) && domCreate.length) {
    const worst = domCreate[domCreate.length - 1];
    scores.dom = timeScore(worst.createTime.value, 200, 4000);
  }

  const scroll = resultsOf('scroll-stress');
  if (scroll) {
    const vals = Object.values(scroll).map(r => fpsScore(r)).filter(v => v != null);
    scores.scrolling = vals.length ? clampScore(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  }

  const anim = resultsOf('animation-stress');
  if (anim) scores.animation = fpsScore(anim);

  const jsperf = resultsOf('js-performance');
  if (jsperf) {
    const total = Object.values(jsperf)
      .filter(m => typeof m?.value === 'number')
      .reduce((a, m) => a + m.value, 0);
    scores.javascript = timeScore(total, 300, 5000);
  }

  const mem = resultsOf('memory-benchmark');
  if (mem && mem.growth?.value != null) {
    scores.memory = timeScore(mem.growth.value, 20, 400);
  }

  const images = resultsOf('image-rendering');
  if (Array.isArray(images) && images.length) {
    const worst = images[images.length - 1];
    scores.image = timeScore(worst.decodeTime.value, 100, 2000);
  }

  const layout = resultsOf('layout-stress');
  if (layout) scores.layout = timeScore(layout.avgPerMutation.value, 0.05, 2);

  const search = resultsOf('search-benchmark');
  if (Array.isArray(search) && search.length) {
    const worst = search[search.length - 1];
    scores.search = timeScore(worst.searchLatency.value, 20, 500);
  }

  const canvas = resultsOf('canvas-benchmark');
  if (Array.isArray(canvas) && canvas.length) {
    const worst = canvas[canvas.length - 1];
    scores.canvas = fpsScore(worst.fps);
  }

  const svg = resultsOf('svg-benchmark');
  if (svg) scores.svg = timeScore(svg.renderTime.value, 50, 1500);

  const cpu = resultsOf('cpu-throughput');
  if (cpu) {
    // Reference baseline ~80M ops/sec on a mid-tier 2024 laptop core.
    // This is a relative throughput score, not a CPU-usage percentage.
    scores.cpu = clampScore((cpu.opsPerSecond.value / 80_000_000) * 100);
  }

  const rendering = resultsOf('rendering-benchmark');
  if (rendering) scores.rendering = timeScore(rendering.longTaskTime.value, 0, 1000);

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

export function buildReport({ runScript, byTestId, log, startedAt, finishedAt }) {
  const { scores, overall } = scoreRun(byTestId);
  const capability = byTestId['browser-capability']?.results;

  const resultsOf = (id) => byTestId[id]?.results;
  const paramsOf = (id) => byTestId[id]?.params;

  const domCreateResults = resultsOf('dom-create');
  const imageResults = resultsOf('image-rendering');
  const searchResults = resultsOf('search-benchmark');
  const canvasResults = resultsOf('canvas-benchmark');

  const counts = {
    testsRun: runScript.testOrder.length,
    domNodes:
      (Array.isArray(domCreateResults) ? domCreateResults.reduce((a, r) => a + (r.size || 0), 0) : 0) +
      (paramsOf('dom-update')?.count || 0),
    images: Array.isArray(imageResults) ? imageResults.reduce((a, r) => a + (r.count || 0), 0) : 0,
    animations: paramsOf('animation-stress')?.elementCount || 0,
    domUpdates: paramsOf('dom-update')?.updates || 0,
    scrollEvents: Object.keys(resultsOf('scroll-stress') || {}).length,
    searchOperations: Array.isArray(searchResults) ? searchResults.length : 0,
    canvasObjects: Array.isArray(canvasResults) ? canvasResults.reduce((a, r) => a + (r.count || 0), 0) : 0,
    svgElements: paramsOf('svg-benchmark')?.count || 0,
  };

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      durationMs: finishedAt - startedAt,
      seed: runScript.seed,
      testOrder: runScript.testOrder,
      browser: capability?.userAgent?.value,
      platform: capability?.platform?.value,
      hardware: {
        cpuCores: capability?.cpuCores?.value,
        ramEstimateGB: capability?.ramEstimateGB?.value,
        gpuRenderer: capability?.gpuRenderer?.value,
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
  const jsPDFCtor = window.jspdf?.jsPDF;
  if (!jsPDFCtor) {
    // Fallback if the CDN script failed to load (e.g. offline / blocked).
    const html = reportToHTML(report);
    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
    return;
  }
  const doc = new jsPDFCtor({ unit: 'pt', format: 'a4' });
  const marginX = 40;
  let y = 50;

  doc.setFont('courier', 'bold'); doc.setFontSize(20);
  doc.text('Zelvior Benchmark Suite — Report', marginX, y); y += 30;

  doc.setFont('courier', 'normal'); doc.setFontSize(11);
  doc.text(`Overall score: ${report.overall ?? '—'} / 100  (${report.rating})`, marginX, y); y += 18;
  doc.text(`Seed: ${report.meta.seed}`, marginX, y); y += 16;
  doc.text(`Duration: ${(report.meta.durationMs / 1000).toFixed(1)}s`, marginX, y); y += 16;
  doc.text(`Generated: ${report.meta.generatedAt}`, marginX, y); y += 16;
  const browserLine = doc.splitTextToSize(`Browser: ${report.meta.browser || 'n/a'}`, 500);
  doc.text(browserLine, marginX, y); y += 16 * browserLine.length + 10;

  doc.setFont('courier', 'bold'); doc.text('Category Scores', marginX, y); y += 18;
  doc.setFont('courier', 'normal');
  for (const [k, v] of Object.entries(report.scores)) {
    doc.text(`${k.padEnd(14, ' ')} ${v ?? '—'}`, marginX, y);
    y += 15;
    if (y > 760) { doc.addPage(); y = 50; }
  }

  y += 10;
  doc.setFont('courier', 'bold'); doc.text('Counts', marginX, y); y += 18;
  doc.setFont('courier', 'normal');
  for (const [k, v] of Object.entries(report.counts)) {
    doc.text(`${k.padEnd(16, ' ')} ${v}`, marginX, y);
    y += 15;
    if (y > 760) { doc.addPage(); y = 50; }
  }

  doc.save(`zbs-report-${report.meta.seed}.pdf`);
}

export function compareReports(a, b) {
  const keys = new Set([...Object.keys(a.scores), ...Object.keys(b.scores)]);
  const rows = [...keys].map((k) => {
    const av = a.scores[k] ?? null;
    const bv = b.scores[k] ?? null;
    const delta = (av != null && bv != null) ? bv - av : null;
    return { category: k, a: av, b: bv, delta };
  });
  return {
    overallDelta: (a.overall != null && b.overall != null) ? b.overall - a.overall : null,
    rows,
  };
}
