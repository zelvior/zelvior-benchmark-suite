# Zelvior Benchmark Suite (ZBS)

A browser performance benchmark suite that stress-tests DOM, JS execution,
layout, scrolling, images, animation, events, canvas, SVG, CSS, and memory —
built to compare a site's performance before/after integrating Zelvior Runtime.

No frameworks. Vanilla JS ES modules, browser APIs only.

## Status / honesty notice

This is a working implementation of the full spec, built in one pass. It has
**not been run in a real browser** in this environment (sandboxed, no browser
available) — only `node --check` syntax-validated every file. Treat this as
functional-but-unverified: expect to find and fix runtime bugs on first load
(most likely candidates: DOM test edge cases at 100k nodes, PerformanceObserver
`longtask` support varies by browser, `requestIdleCallback` is Safari-absent
and already has a fallback, WebGL context creation on headless CI).

Also note real limits baked into the code itself, surfaced in the report as
metric confidence levels (`measured` / `estimated` / `inferred`):

- **No true CPU usage metric exists in browsers.** The "CPU" indicator in the
  running view is derived from FPS deficit (`100 - fps/60*100`), not a real
  CPU read. It's a rough proxy, not a measurement.
- **`performance.memory` is Chromium-only**, non-standard, and coarse. Firefox
  and Safari will show `null`/`n/a` for all memory metrics. There's no
  cross-browser real memory API.
- **Detached DOM node counting is not a real capability.** No browser exposes
  this. That test allocates and drops references to nodes as a synthetic
  proxy — it does not detect actual leaks in the page.
- **GC event observation is not exposed to JS in any standard way.** The
  "GC events observed" metric is always reported as inferred/0.
- **Paint/composite/rasterization timing has no direct API.** Those numbers
  are derived from `requestAnimationFrame` round-trip timing and the
  `longtask` PerformanceObserver (Chromium-only), not real compositor traces.
- **Scoring formulas are heuristic**, not calibrated against an industry
  reference set. The 0–100 scores and Excellent/Good/Poor bands are internally
  consistent (useful for before/after comparison on the same machine) but are
  *not* validated against any external benchmark corpus. Treat absolute scores
  as directional, not authoritative.
- **SIMD detection is a presence check only** (`WebAssembly.validate` exists),
  not an actual SIMD execution test.
- Image "decode time" measures `<img onload>` firing, which conflates decode
  with layout/paint scheduling — it is not `Image.decode()` isolated timing.

None of this is disqualifying for the stated purpose (relative before/after
comparison on the same browser/machine), but it should not be presented as
lab-grade absolute measurement without the caveats above. The report always
tags every metric so this is visible to the end user, not hidden.

## What's actually implemented

All 20 test modules from the spec: DOM create/update/remove, massive list,
scroll stress, image rendering, animation stress, JS performance, event
stress, layout stress, resize, search, memory, browser capability, rendering
(long-task proxy), canvas, SVG, CSS, idle. Plus: live FPS/memory charts,
status log, progress/ETA, JSON/HTML/PDF report export, localStorage run
history, and the seeded replay system.

## Replay system — how it actually guarantees fairness

1. On "Start Benchmark," a random 32-bit `seed` is generated and a
   `mulberry32` PRNG (`src/rng.js`) is seeded with it.
2. The fixed test execution order (`ALL_TESTS` in `src/engine.js`) and the
   seed are captured into a `RunScript` (`src/replay.js`) *before* any test
   runs.
3. Every test that generates random data (node counts, colors, strings,
   image sources, scroll speeds, update indices, etc.) pulls exclusively from
   that single seeded RNG instance, consumed in a fixed, deterministic order.
4. Each test returns the exact `params` it used (sizes, generated item lists,
   query strings, etc.), which get written back into the `RunScript`.
5. On "Replay," the stored `RunScript` (seed + order + recorded params) is
   passed back into the engine. Tests receive `forcedParams` and use the
   recorded params directly instead of drawing new ones — so even if a test's
   RNG-consumption order ever changed between code versions, replay still
   reproduces the same inputs.
6. Timings themselves are **not** replayed — only the script (seed, order,
   generated data) is. Actual measured durations/FPS/memory naturally vary
   run to run; that's the point — replay controls the *inputs* so two runs
   (e.g. before/after a code change) are comparable on the same inputs, not a
   canned playback of old numbers.

Caveat: a small number of tests (image sources in `images.js`, for example)
generate some data inline without threading every generated artifact back
through `params`. Because RNG consumption order is still deterministic and
identical on replay, results are still reproducible in practice, but this
hasn't been exhaustively verified end to end. If exact byte-for-byte replay
matters for your use case, audit `params` returned by each test in
`src/tests/*.js` before relying on it.

## Running locally

ES modules require an HTTP server — `file://` will not work.

```
cd zbs
npx serve .
```

## Deploying to Vercel

```
cd zbs
vercel --prod
```

`vercel.json` sets `cleanUrls`, disables trailing slashes, and adds
`X-Content-Type-Options` / `Cross-Origin-Opener-Policy` headers. No build
step — it's a static site (`package.json`'s `build` script is a no-op).

## File layout

```
zbs/
├── index.html          UI shell (hero / running / report / history panels)
├── styles.css           Dark glassmorphism theme
├── vercel.json
├── package.json
└── src/
    ├── rng.js            Seeded PRNG (mulberry32)
    ├── replay.js         RunScript capture/storage, history in localStorage
    ├── metrics.js        FPS monitor, memory snapshot, longtask observer
    ├── engine.js         Test orchestration, replay execution
    ├── charts.js         Canvas line/bar chart rendering (no chart libs)
    ├── report.js         Scoring, JSON/HTML/PDF export
    ├── main.js           DOM wiring / UI state
    └── tests/            20 individual benchmark modules
```

## Not yet done / known gaps

- No automated test suite for ZBS itself (untested in a live browser, as
  noted above).
- PDF export opens a print dialog (`window.print()`) rather than generating a
  real PDF binary — the "Download PDF" button produces a printable HTML view,
  not a `.pdf` file written to disk directly.
- Run history comparison view lists past runs and lets you replay them, but
  does not yet render a side-by-side diff of two reports.
- No WebGPU/WASM SIMD *execution* benchmarks — only capability detection.
