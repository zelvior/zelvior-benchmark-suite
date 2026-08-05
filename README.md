# Zelvior Benchmark Suite (ZBS)

A browser performance benchmark suite that stress-tests DOM, JS execution,
layout, scrolling, images, animation, events, canvas, SVG, CSS, and memory —
built to compare a site's performance before/after integrating Zelvior Runtime.

No frameworks. Vanilla JS ES modules, browser APIs only.

## v1.2.1 — a real live-browser bug, reported by an actual user

The Image Rendering Test hung indefinitely (stuck on "Starting: Image
Rendering Test" forever) the first time this ran in a real browser. This is
exactly the class of bug the honesty notice in prior versions warned was
possible and unverified — jsdom-based smoke testing could not have caught
it, because jsdom doesn't implement real viewport-gated lazy image loading
at all.

**Root cause:** `images.js` set `img.loading = 'lazy'` on roughly half of
the generated images (`rng.bool(0.5)`). Native `loading="lazy"` only starts
fetching/decoding an image once it's near the viewport. The benchmark stage
(`.zbs-stage` in `styles.css`) is deliberately positioned off-screen
(`left: -9999px`) so benchmark DOM never affects visible layout — which
means it never intersects the viewport, which means every `loading="lazy"`
image's `onload` never fires, which means `Promise.all(loadPromises)` in
`images.js` waits forever. A real, silent, total hang, reachable on every
single run with ~50% probability per image (in practice, near-certain to
hit at least one lazy image per run at any tested count ≥ 50).

**Fixes:**
- Removed the `img.loading = ...` assignment. The `lazy` flag is still
  recorded per-image in `params.sources` for reporting/replay purposes, but
  the native browser attribute is no longer set, since it's fundamentally
  incompatible with an intentionally off-screen stage.
- Added a per-image 8-second timeout (`Promise.race`-style, via a
  `setTimeout` fallback resolve) as defense in depth, so any *other* future
  stall in a single image load can't hang the whole test either.
- Added a **global per-test watchdog** in `engine.js` (20-second timeout per
  test, `runWithWatchdog()`): if any test — this one or a future one — ever
  fails to resolve, the engine now logs a timeout error for that test and
  moves on to the next one, rather than freezing the entire benchmark run
  silently with no feedback. This does not (and cannot, in plain JS without
  threading `AbortController` through every test) truly cancel a stalled
  test's background work — it just guarantees the *suite* keeps moving.
- Added a regression test (`test/self-test.mjs`) that scans the source for
  `img.loading =` and fails the build if it reappears, so this exact bug
  can't silently reintroduce itself.

This is the first bug in this project that was found by a real browser
rather than by this sandbox's own testing — which is exactly the gap the
honesty notice below has been flagging all along. It's evidence the warning
was accurate, not evidence the warning is no longer needed.

## v1.2 changes — real bugs found and fixed

This round did something different from prior passes: instead of only
syntax-checking (`node --check`), the entire benchmark engine and all 20 test
modules were **actually executed** end-to-end using jsdom + fake-indexeddb
(`test/smoke-dom.mjs`), and replay determinism was independently verified by
running the same seed twice and diffing every test's generated output
(`test/smoke-replay-determinism.mjs`). This caught real bugs that syntax
checking cannot:

- **Every category score was broken.** `scoreRun()` in `report.js` was
  reading `test.results.xxx` everywhere, but `byTestId[testId]` was already
  the unwrapped results object in most call sites — meaning every single
  score (`dom`, `scrolling`, `animation`, `javascript`, `memory`, `image`,
  `layout`, `search`, `canvas`, `svg`, `rendering`, `cpu`) would either throw
  or silently return `undefined`. This wasn't a display bug — the overall
  score and every category score were non-functional. Root-caused to an
  inconsistent data shape between `engine.js` (which flattened `{params,
  results}` down to just `results` before scoring) and `report.js`'s counts
  section (which still expected `.params` on the same object for things like
  DOM node totals and animation element counts — so those counts always
  silently showed `0`). Fixed by keeping `{params, results}` consistent
  everywhere instead of ad-hoc flattening partway through the pipeline, and
  rewrote every scoring/counting branch to match the real shape.
- **`fpsScore()` could throw on a legitimate zero-frame result** (e.g. a
  scroll test where the container isn't actually scrollable — short content,
  small dataset). `FPSMonitor.summary()` correctly returns `null` in that
  case, but the score function assumed `summary.avgFps` always existed.
  Hardened to return `null` (no score contribution) instead of crashing the
  whole report.
- **Replay architecture rewritten**, and this time the "each test's RNG is
  self-contained" claim is backed by a test that actually proves it: running
  the same seed twice and diffing every test's recorded `params` shows
  byte-identical output for all 20 tests, not just an architectural argument
  for why it should be identical.
- **Storage migrated from localStorage to IndexedDB.** Real motivation, not
  just "more modern": the image-rendering test's `params.sources` embeds
  generated data-URI images so replay reproduces the exact decode workload —
  that payload can run into multiple MB per run, comfortably past
  localStorage's ~5–10MB total quota. IndexedDB has a much larger
  browser-managed quota and is the correct tool here. All storage functions
  in `replay.js` (`saveLastRun`, `loadLastRun`, `loadHistory`, `clearHistory`)
  are now async; `main.js` was updated to await them.

## v1.1 changes

- **CPU Throughput Calibration** (`src/tests/cpu.js`): a fixed-time-budget
  busy loop measuring ops/sec, feeding a `cpu` category score. This replaces
  relying solely on the FPS-deficit proxy for CPU-related scoring. It is
  still explicitly labeled as relative throughput, not a % utilization
  figure — no browser API can produce that.
- **Real PDF export** via jsPDF (loaded from cdnjs in `index.html`), replacing
  the print-dialog-only fallback. Falls back to `window.print()` automatically
  if the CDN script fails to load (e.g. offline).
- **Run comparison view**: select any two runs in History and see a
  side-by-side score delta table (`compareReports` in `src/report.js`).
- Search and image tests record their full generated dataset (item
  lists / image sources) in `params`, not just the requested sizes, so
  match counts and decode workload are identical on replay, not just
  same-shaped.

## Status / honesty notice

There is still no real browser available in this environment (sandboxed;
downloading Chromium/Playwright is blocked by the network allowlist), so
nothing here has been visually verified — no screenshot, no confirmation
that layout looks right, that CSS renders as intended, that a real Chrome/
Firefox/Safari doesn't hit a quirk jsdom's incomplete implementation papers
over. What changed this round is the depth of *logical* verification:

**Now actually verified, not just syntax-checked:**
- All 20 test modules execute successfully end-to-end (`npm run test:dom`).
- Every test's replay output is provably deterministic — same seed, same
  generated data, checked by diffing two independent runs
  (`npm run test:replay`).
- The full pipeline (run → score → build report → serialize to JSON → render
  to HTML → save to IndexedDB → load back) completes without error and the
  round-tripped data matches.
- Core RNG and scoring math (`npm test`, 11 assertions).

**Still NOT verified, and likely sources of real bugs if you hit them:**
- Real rendering, layout, paint timing, and true frame-rate behavior — jsdom
  does not implement a layout engine, so `scrollHeight`/`clientHeight`/
  `offsetWidth` are stubbed/zero, canvas 2D context is a no-op stub in the
  test harness (the real code path calling `getContext('2d')` works, but no
  actual pixels are ever drawn during smoke testing), and WebGL is correctly
  reported unavailable (jsdom has none) rather than tested.
- Visual appearance: the dark/glassmorphism CSS, chart rendering, responsive
  layout at different viewport sizes — none of this can be checked without a
  real browser.
- Cross-browser differences: Safari's `requestIdleCallback` absence has a
  coded fallback but that fallback path itself is untested in a real Safari;
  Firefox's lack of `performance.memory` is handled but untested live;
  `PerformanceObserver({type:'longtask'})` is Chromium-only and the
  try/catch fallback is untested live.
- The jsPDF CDN integration (real network fetch of a third-party script,
  real PDF byte generation) — the fallback code path exists but wasn't
  exercised in a real page load.
- 100,000-node DOM stress tests at real scale — smoke tests use small forced
  sizes (10–50 nodes) to run in seconds; the code path is identical at scale
  but actual browser behavior (GC pressure, real paint cost) at 100k is
  unverified.

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
progress/ETA, JSON/HTML/real-PDF report export, IndexedDB-backed run
history, two-run comparison view, and the per-test-seeded replay system.

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
   future version) reordered. **This is independently verified**, not just
   argued for — `npm run test:replay` runs the same seed twice and asserts
   every one of the 20 tests' generated `params` are byte-identical.
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
7. Runs are persisted to **IndexedDB** (`zbs-storage` database, `runs` object
   store), not localStorage — the image-rendering test's recorded data-URI
   sources alone can exceed localStorage's quota on a run with larger image
   counts. History keeps the most recent 30 runs, pruned automatically on
   save.

Remaining honest caveat: a handful of tests still draw a small amount of
purely cosmetic randomness inline (e.g. row label text in `list.js` /
`scroll.js`, per-cell colors in `dom-update`'s per-update highlight) that
isn't separately captured in `params`. This randomness doesn't affect what's
measured (node count, update count, scroll distance are all fixed/recorded)
— only decorative content — so it doesn't compromise fairness of the
recorded metrics, but it means the *visual* content during a replay run
won't be byte-identical to the original in every pixel. This was a
deliberate size tradeoff: some of these datasets are tens of thousands of
strings, and storing them all per run would bloat every history entry
substantially even under IndexedDB's larger quota.

## Running locally

ES modules require an HTTP server — `file://` will not work.

```
cd zbs
npx serve .
```

## Running the automated tests

```
cd zbs
npm install       # dev-only deps: jsdom, fake-indexeddb (never shipped/deployed)
npm run test:all  # runs all three suites below
```

Or individually:

- `npm test` — pure-logic unit tests (`test/self-test.mjs`): RNG determinism,
  seed derivation, scoring math, and a regression check for the image-loading hang below. 11 assertions.
- `npm run test:dom` — full end-to-end smoke test (`test/smoke-dom.mjs`):
  actually runs every one of the 20 benchmark tests plus the full
  run→score→report→storage pipeline inside jsdom + fake-indexeddb. 25
  checks.
- `npm run test:replay` — replay determinism proof
  (`test/smoke-replay-determinism.mjs`): runs the same seed through the
  engine twice and asserts every test's generated data is byte-identical
  across both runs. 20 checks.

None of these three suites require a real browser — they're dev-only and not
part of the deployed static site. See "Status / honesty notice" above for
exactly what this level of testing does and doesn't prove.

## Deploying to Vercel

```
cd zbs
vercel --prod
```

`vercel.json` sets `cleanUrls`, disables trailing slashes, and adds
`X-Content-Type-Options` / `Cross-Origin-Opener-Policy` headers. No build
step — it's a static site. `index.html` loads jsPDF from cdnjs for PDF
export; if your deployment target blocks third-party scripts, PDF export
falls back to `window.print()` automatically. The `jsdom`/`fake-indexeddb`
devDependencies in `package.json` are dev-only test tooling — Vercel's
`npm install` will fetch them during build but nothing in the deployed
static site (`index.html`, `styles.css`, `src/*`) imports or ships them.

## File layout

```
zbs/
├── index.html          UI shell (hero / running / report / history panels)
├── styles.css           Dark glassmorphism theme
├── vercel.json
├── package.json
├── test/
│   ├── self-test.mjs                  Pure-logic unit tests (rng.js, report.js)
│   ├── smoke-dom.mjs                  Full engine + all tests, run in jsdom
│   └── smoke-replay-determinism.mjs   Proves replay is byte-exact
└── src/
    ├── rng.js            Seeded PRNG (mulberry32) + per-test seed derivation
    ├── replay.js         RunScript capture/storage in IndexedDB, run history
    ├── metrics.js        FPS monitor, memory snapshot, longtask observer
    ├── engine.js         Test orchestration, per-test-seeded replay
    ├── charts.js         Canvas line/bar chart rendering (no chart libs)
    ├── report.js         Scoring, JSON/HTML/PDF export, run comparison
    ├── main.js           DOM wiring / UI state
    └── tests/            21 individual benchmark modules
```

## Not yet done / known gaps

- No real browser has ever loaded this page in this environment. Layout,
  visual appearance, real frame timing, and true cross-browser behavior are
  all unverified — see "Status / honesty notice" above for specifics.
- Comparison view only supports exactly two runs at a time, not multi-run
  trend charts.
- Decorative (non-measurement-affecting) randomness — row label text, update
  highlight colors — is not stored for replay, to keep IndexedDB history
  entries bounded in size. See the replay section above for the reasoning.
- No WebGPU/WASM SIMD *execution* benchmarks — only capability detection.
- The CPU throughput test's reference baseline (80M ops/sec) is a rough
  anchor, not a calibrated cross-device standard — treat category score as
  relative/directional like the others.
- IndexedDB migration itself is verified via fake-indexeddb (a spec-following
  in-memory implementation), which is a reasonable proxy but not the same as
  exercising a real browser's actual IndexedDB implementation and its
  quota/eviction behavior under real storage pressure.
