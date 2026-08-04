# Zelvior Benchmark Suite (ZBS)

A browser performance benchmark suite that stress-tests DOM, JS execution,
layout, scrolling, images, animation, events, canvas, SVG, CSS, and memory —
built to compare a site's performance before/after integrating Zelvior Runtime.

No frameworks. Vanilla JS ES modules, browser APIs only.

## v1.1 changes

- **Replay architecture rewritten.** Previously all tests drew from a single
  shared seeded RNG stream, meaning replay correctness silently depended on
  every test consuming the exact same number of random values in the exact
  same order as the original run — skip or reorder one test and everything
  after it would desync. Now each test gets its own RNG, seeded via
  `deriveSeed(masterSeed, testId)` (`src/rng.js`, an xmur3-based hash). Every
  test's randomness is now fully self-contained: replay is exact regardless
  of execution order, cancellation, or which subset of tests ran. This is a
  real fix, not a cosmetic one — the old design was fragile in a way that
  wouldn't have surfaced until someone hit it.
- Search and image tests now record their full generated dataset (item
  lists / image sources) in `params`, not just the requested sizes, so
  match counts and decode workload are identical on replay, not just
  same-shaped.
- Added **CPU Throughput Calibration** (`src/tests/cpu.js`): a fixed-time-budget
  busy loop measuring ops/sec, feeding a `cpu` category score. This replaces
  relying solely on the FPS-deficit proxy for CPU-related scoring. It is
  still explicitly labeled as relative throughput, not a % utilization
  figure — no browser API can produce that.
- **Real PDF export** via jsPDF (loaded from cdnjs in `index.html`), replacing
  the print-dialog-only fallback. Falls back to `window.print()` automatically
  if the CDN script fails to load (e.g. offline).
- **Run comparison view**: select any two runs in History and see a
  side-by-side score delta table (`compareReports` in `src/report.js`).
- **Node self-test suite** (`test/self-test.mjs`, run via `npm test`) covering
  RNG determinism, per-test seed derivation, and scoring edge cases. 10/10
  passing as of this build. This does not test DOM-touching code (engine.js,
  main.js, the test modules themselves) — see gaps below.

## Status / honesty notice

This is a working implementation of the full spec. Only the pure-logic
modules (`rng.js`, `report.js` scoring/rating functions) have automated
verification (`npm test`, 10 passing assertions). The DOM-dependent code —
every file in `src/tests/*.js`, `engine.js`, `main.js` — has **not been run
in a real browser** in this environment (sandboxed, no browser available):
only `node --check` syntax-validated it. Treat the benchmark tests themselves
as functional-but-unverified: expect to find and fix runtime bugs on first
load (most likely candidates: DOM test edge cases at 100k nodes,
PerformanceObserver `longtask` support varies by browser, `requestIdleCallback`
is Safari-absent and already has a fallback, WebGL context creation on
headless CI, jsPDF CDN load failing offline).

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

All 20 test modules from the spec, plus a CPU throughput calibration test:
DOM create/update/remove, massive list, scroll stress, image rendering,
animation stress, JS performance, event stress, layout stress, resize,
search, memory, browser capability, rendering (long-task proxy), canvas,
SVG, CSS, idle, CPU throughput. Plus: live FPS/memory charts, status log,
progress/ETA, JSON/HTML/real-PDF report export, localStorage run history,
two-run comparison view, and the per-test-seeded replay system.

## Replay system — how it actually guarantees fairness

1. On "Start Benchmark," a random 32-bit `seed` is generated.
2. The fixed test execution order (`ALL_TESTS` in `src/engine.js`) and the
   seed are captured into a `RunScript` (`src/replay.js`) *before* any test
   runs.
3. **Each test gets its own independent PRNG**, seeded with
   `deriveSeed(masterSeed, testId)` — an xmur3-based hash of the master seed
   and the test's id (`src/rng.js`). This is the key correctness property:
   a test's random data depends only on `(masterSeed, testId)`, never on what
   ran before it. Two runs with the same master seed reproduce identical
   per-test inputs even if tests are skipped, cancelled mid-run, or (in a
   future version) reordered.
4. Each test also returns the `params` it generated (sizes, item lists, query
   strings, etc.) into the `RunScript`, for transparency and audit — you can
   inspect exactly what data a run used from the exported JSON report.
   `forcedParams` (recorded values from a prior run) are honored when present,
   as an explicit override path, but are no longer *required* for correctness
   the way they were in the previous single-shared-RNG design.
5. On "Replay," the stored `RunScript` (seed + order) is passed back into the
   engine. Because per-test seeds are pure functions of `(seed, testId)`,
   every test regenerates its exact original inputs automatically.
6. Timings themselves are **not** replayed — only the script (seed, order,
   generated data) is. Actual measured durations/FPS/memory naturally vary
   run to run; that's the point — replay controls the *inputs* so two runs
   (e.g. before/after a code change) are comparable on the same inputs, not a
   canned playback of old numbers.

Remaining honest caveat: a handful of tests still draw a small amount of
purely cosmetic randomness inline (e.g. row label text in `list.js` /
`scroll.js`, per-cell colors in `dom-update`'s per-update highlight) that
isn't separately captured in `params`. This randomness doesn't affect what's
measured (node count, update count, scroll distance are all fixed/recorded)
— only decorative content — so it doesn't compromise fairness of the
recorded metrics, but it means the *visual* content during a replay run
won't be byte-identical to the original in every pixel. Full determinism of
decorative content was traded off deliberately against localStorage size
(some of these datasets are tens of thousands of strings — storing them all
per run would make history entries multi-megabyte).

## Running locally

ES modules require an HTTP server — `file://` will not work.

```
cd zbs
npx serve .
```

## Running the self-tests

```
cd zbs
npm test
```

Covers RNG determinism and scoring logic only (pure functions, no DOM). See
"Status / honesty notice" above for what this does and doesn't cover.

## Deploying to Vercel

```
cd zbs
vercel --prod
```

`vercel.json` sets `cleanUrls`, disables trailing slashes, and adds
`X-Content-Type-Options` / `Cross-Origin-Opener-Policy` headers. No build
step — it's a static site (`package.json`'s `build` script is a no-op).
`index.html` loads jsPDF from cdnjs for PDF export; if your deployment
target blocks third-party scripts, PDF export will fall back to
`window.print()` automatically.

## File layout

```
zbs/
├── index.html          UI shell (hero / running / report / history panels)
├── styles.css           Dark glassmorphism theme
├── vercel.json
├── package.json
├── test/
│   └── self-test.mjs    Node-runnable tests for rng.js / report.js
└── src/
    ├── rng.js            Seeded PRNG (mulberry32) + per-test seed derivation
    ├── replay.js         RunScript capture/storage, history in localStorage
    ├── metrics.js        FPS monitor, memory snapshot, longtask observer
    ├── engine.js         Test orchestration, per-test-seeded replay
    ├── charts.js         Canvas line/bar chart rendering (no chart libs)
    ├── report.js         Scoring, JSON/HTML/PDF export, run comparison
    ├── main.js           DOM wiring / UI state
    └── tests/            21 individual benchmark modules
```

## Not yet done / known gaps

- The DOM-dependent code (every file in `src/tests/*.js`, `engine.js`,
  `main.js`) is untested in a live browser in this environment — see the
  honesty notice above.
- Comparison view only supports exactly two runs at a time, not multi-run
  trend charts.
- Decorative (non-measurement-affecting) randomness — row label text, update
  highlight colors — is not stored for replay, to keep localStorage history
  entries bounded in size. See the replay section above for the reasoning.
- No WebGPU/WASM SIMD *execution* benchmarks — only capability detection.
- The CPU throughput test's reference baseline (80M ops/sec) is a rough
  anchor, not a calibrated cross-device standard — treat category score as
  relative/directional like the others.
