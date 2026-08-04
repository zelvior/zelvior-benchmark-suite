import { BenchmarkEngine, ALL_TESTS } from './engine.js';
import { LiveChart, drawBarChart } from './charts.js';
import { loadLastRun, loadHistory, RunScript } from './replay.js';
import { reportToJSON, reportToHTML, downloadFile, downloadPDF, ratingLabel, compareReports } from './report.js';

const $ = (id) => document.getElementById(id);

const panels = {
  idle: $('panel-idle'),
  running: $('panel-running'),
  report: $('panel-report'),
  history: $('panel-history'),
};
function showPanel(name) {
  for (const [k, el] of Object.entries(panels)) el.hidden = k !== name;
}

const stage = $('zbs-stage');
let fpsChart, memChart;
let currentEngine = null;
let currentReport = null;
let currentRunScript = null;

function initCharts() {
  fpsChart = new LiveChart($('chart-fps'), { color: '#5CF2A0', min: 0, max: 60, maxPoints: 120 });
  memChart = new LiveChart($('chart-mem'), { color: '#f2b45c', min: 0, max: 200, maxPoints: 120 });
}
initCharts();

function refreshLastRunSummary() {
  const last = loadLastRun();
  const btn = $('btn-replay');
  if (last) {
    $('last-run-summary').textContent =
      `Last run: seed ${last.runScript.seed} · score ${last.report.overall ?? '—'} · ${new Date(last.savedAt).toLocaleString()}`;
    btn.disabled = false;
  } else {
    $('last-run-summary').textContent = 'No previous run stored.';
    btn.disabled = true;
  }
}
refreshLastRunSummary();

async function startBenchmark(replayScript = null) {
  showPanel('running');
  $('log-output').innerHTML = '';
  $('progress-bar').style.width = '0%';
  $('run-seed').textContent = replayScript ? replayScript.seed : '(new)';

  const engine = new BenchmarkEngine({
    stage,
    onProgress: (p) => {
      $('run-testname').textContent = p.testName;
      $('run-index').textContent = p.index;
      $('run-total').textContent = p.total;
      $('run-elapsed').textContent = (p.elapsedMs / 1000).toFixed(1) + 's';
      const pct = p.total ? (p.index / p.total) * 100 : 0;
      $('progress-bar').style.width = pct + '%';
      if (p.index > 0) {
        const avgPerTest = p.elapsedMs / p.index;
        const remaining = avgPerTest * (p.total - p.index);
        $('run-eta').textContent = (remaining / 1000).toFixed(1) + 's';
      }
    },
    onLog: (line) => {
      const out = $('log-output');
      const div = document.createElement('div');
      div.textContent = line;
      out.appendChild(div);
      out.scrollTop = out.scrollHeight;
    },
    onLiveMetric: ({ fps, memory }) => {
      $('stat-fps').textContent = fps ? fps.toFixed(0) : '—';
      $('stat-mem').textContent = memory.value != null ? memory.value + ' MB' : 'n/a';
      $('stat-cpu').textContent = fps ? Math.max(0, Math.min(100, Math.round(100 - (fps / 60) * 100))) + '%' : '—';
      if (fps) fpsChart.push(fps);
      if (memory.value != null) memChart.push(memory.value);
    },
  });
  currentEngine = engine;
  $('run-seed').textContent = replayScript ? replayScript.seed : 'pending';

  const { runScript, report } = await engine.run(replayScript);
  currentRunScript = runScript;
  currentReport = report;
  $('run-seed').textContent = runScript.seed;
  renderReport(report);
  showPanel('report');
  refreshLastRunSummary();
}

function renderReport(report) {
  $('score-value').textContent = report.overall ?? '—';
  $('rating-label').textContent = report.rating;
  $('report-meta').textContent =
    `Seed ${report.meta.seed} · ${(report.meta.durationMs / 1000).toFixed(1)}s · ${new Date(report.meta.generatedAt).toLocaleString()} · ${report.meta.browser?.split(' ').slice(-1)[0] || ''}`;

  const grid = $('score-grid');
  grid.innerHTML = '';
  for (const [k, v] of Object.entries(report.scores)) {
    const div = document.createElement('div');
    div.className = 'zbs-score-item';
    div.innerHTML = `<div class="k">${k}</div><div class="v">${v ?? '—'}</div>`;
    grid.appendChild(div);
  }

  drawBarChart($('chart-scores'), Object.entries(report.scores).map(([label, value]) => ({ label, value: value ?? 0 })));

  const counts = $('counts-card');
  counts.innerHTML = '';
  for (const [k, v] of Object.entries(report.counts)) {
    const div = document.createElement('div');
    div.innerHTML = `<b>${v}</b>${k}`;
    counts.appendChild(div);
  }
}

let historyEntries = [];

function renderHistory() {
  const list = $('history-list');
  list.innerHTML = '';
  $('compare-output').hidden = true;
  historyEntries = loadHistory();
  if (!historyEntries.length) {
    list.innerHTML = '<div class="zbs-run-sub">No history yet.</div>';
    $('btn-compare').disabled = true;
    return;
  }
  historyEntries.forEach((entry, i) => {
    const row = document.createElement('div');
    row.className = 'zbs-history-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'zbs-history-check';
    checkbox.dataset.index = i;
    checkbox.addEventListener('change', updateCompareButtonState);

    const label = document.createElement('span');
    label.textContent = `${new Date(entry.savedAt).toLocaleString()} · seed ${entry.runScript.seed} · score ${entry.report.overall ?? '—'} (${ratingLabel(entry.report.overall)})`;

    const left = document.createElement('label');
    left.style.display = 'flex'; left.style.alignItems = 'center'; left.style.gap = '.6rem';
    left.appendChild(checkbox); left.appendChild(label);
    row.appendChild(left);

    const replayBtn = document.createElement('button');
    replayBtn.className = 'zbs-btn zbs-btn-ghost';
    replayBtn.textContent = 'Replay';
    replayBtn.onclick = () => startBenchmark(RunScript.fromJSON(entry.runScript));
    row.appendChild(replayBtn);
    list.appendChild(row);
  });
  updateCompareButtonState();
}

function updateCompareButtonState() {
  const checked = [...document.querySelectorAll('.zbs-history-check:checked')];
  $('btn-compare').disabled = checked.length !== 2;
}

function renderComparison() {
  const checked = [...document.querySelectorAll('.zbs-history-check:checked')].map(c => historyEntries[+c.dataset.index]);
  if (checked.length !== 2) return;
  const [runA, runB] = checked;
  const diff = compareReports(runA.report, runB.report);
  const out = $('compare-output');
  out.hidden = false;

  const sign = (n) => (n == null ? '—' : n > 0 ? `+${n}` : `${n}`);
  const colorFor = (n) => (n == null ? 'var(--text-dim)' : n > 0 ? 'var(--phosphor)' : n < 0 ? 'var(--danger)' : 'var(--text-dim)');

  out.innerHTML = `
    <div class="zbs-chart-title">Comparison</div>
    <p class="zbs-run-sub">
      Run A: seed ${runA.runScript.seed} · ${new Date(runA.savedAt).toLocaleString()} · score ${runA.report.overall ?? '—'}<br>
      Run B: seed ${runB.runScript.seed} · ${new Date(runB.savedAt).toLocaleString()} · score ${runB.report.overall ?? '—'}
    </p>
    <p style="font-size:1.3rem;margin:.6rem 0;color:${colorFor(diff.overallDelta)}">
      Overall: ${sign(diff.overallDelta)}
    </p>
    <table style="width:100%;border-collapse:collapse;font-size:.82rem">
      <thead><tr>
        <th style="text-align:left;padding:.4rem;border-bottom:1px solid var(--panel-border)">Category</th>
        <th style="text-align:right;padding:.4rem;border-bottom:1px solid var(--panel-border)">A</th>
        <th style="text-align:right;padding:.4rem;border-bottom:1px solid var(--panel-border)">B</th>
        <th style="text-align:right;padding:.4rem;border-bottom:1px solid var(--panel-border)">Δ</th>
      </tr></thead>
      <tbody>
        ${diff.rows.map(r => `<tr>
          <td style="padding:.4rem">${r.category}</td>
          <td style="padding:.4rem;text-align:right">${r.a ?? '—'}</td>
          <td style="padding:.4rem;text-align:right">${r.b ?? '—'}</td>
          <td style="padding:.4rem;text-align:right;color:${colorFor(r.delta)}">${sign(r.delta)}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    <p class="zbs-run-sub" style="margin-top:.8rem">
      Positive Δ = Run B scored higher than Run A on that category. Only compare runs captured on
      the same browser/device for a meaningful before/after read — cross-device comparisons are
      not controlled for hardware differences.
    </p>`;
}

$('btn-compare')?.addEventListener('click', renderComparison);

$('btn-start').addEventListener('click', () => startBenchmark(null));
$('btn-run-again').addEventListener('click', () => startBenchmark(null));
$('btn-cancel').addEventListener('click', () => currentEngine?.cancel());
$('btn-replay').addEventListener('click', () => {
  const last = loadLastRun();
  if (last) startBenchmark(RunScript.fromJSON(last.runScript));
});
$('btn-replay-this').addEventListener('click', () => {
  if (currentRunScript) startBenchmark(RunScript.fromJSON(currentRunScript));
});
$('btn-history').addEventListener('click', () => {
  renderHistory();
  showPanel('history');
});
$('btn-download-json').addEventListener('click', () => {
  if (currentReport) downloadFile(`zbs-report-${currentReport.meta.seed}.json`, reportToJSON(currentReport), 'application/json');
});
$('btn-download-html').addEventListener('click', () => {
  if (currentReport) downloadFile(`zbs-report-${currentReport.meta.seed}.html`, reportToHTML(currentReport), 'text/html');
});
$('btn-download-pdf').addEventListener('click', () => {
  if (currentReport) downloadPDF(currentReport);
});
