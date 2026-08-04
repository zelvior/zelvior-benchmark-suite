// Node-runnable self-tests for the pure-logic modules (no DOM required).
// Run: npm test
import assert from 'node:assert/strict';
import { mulberry32, deriveSeed, SeededRandom } from '../src/rng.js';
import { scoreRun, ratingLabel } from '../src/report.js';

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok  - ${name}`);
  } catch (err) {
    console.error(`FAIL  - ${name}`);
    console.error('       ' + err.message);
    process.exitCode = 1;
  }
}

console.log('rng.js');

test('mulberry32 is deterministic for a given seed', () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  const seqA = Array.from({ length: 5 }, () => a());
  const seqB = Array.from({ length: 5 }, () => b());
  assert.deepEqual(seqA, seqB);
});

test('mulberry32 produces different sequences for different seeds', () => {
  const a = mulberry32(1);
  const b = mulberry32(2);
  assert.notEqual(a(), b());
});

test('deriveSeed is deterministic for the same (masterSeed, label)', () => {
  assert.equal(deriveSeed(1234, 'dom-create'), deriveSeed(1234, 'dom-create'));
});

test('deriveSeed produces different sub-seeds for different test ids', () => {
  const s1 = deriveSeed(1234, 'dom-create');
  const s2 = deriveSeed(1234, 'scroll-stress');
  assert.notEqual(s1, s2);
});

test('deriveSeed produces different sub-seeds for different master seeds', () => {
  const s1 = deriveSeed(1, 'dom-create');
  const s2 = deriveSeed(2, 'dom-create');
  assert.notEqual(s1, s2);
});

test('SeededRandom.int stays within [min,max] over many draws', () => {
  const r = new SeededRandom(999);
  for (let i = 0; i < 2000; i++) {
    const v = r.int(3, 9);
    assert.ok(v >= 3 && v <= 9, `int ${v} out of range`);
  }
});

test('SeededRandom replay: same seed -> identical derived sequence', () => {
  const seed = deriveSeed(777, 'search-benchmark');
  const r1 = new SeededRandom(seed);
  const r2 = new SeededRandom(seed);
  const out1 = Array.from({ length: 10 }, () => r1.string(6));
  const out2 = Array.from({ length: 10 }, () => r2.string(6));
  assert.deepEqual(out1, out2);
});

console.log('report.js');

test('ratingLabel boundaries', () => {
  assert.equal(ratingLabel(95), 'Excellent');
  assert.equal(ratingLabel(90), 'Excellent');
  assert.equal(ratingLabel(89), 'Very Good');
  assert.equal(ratingLabel(75), 'Very Good');
  assert.equal(ratingLabel(74), 'Good');
  assert.equal(ratingLabel(55), 'Good');
  assert.equal(ratingLabel(54), 'Average');
  assert.equal(ratingLabel(35), 'Average');
  assert.equal(ratingLabel(34), 'Poor');
  assert.equal(ratingLabel(0), 'Poor');
  assert.equal(ratingLabel(null), 'Unknown');
});

test('scoreRun handles a minimal synthetic byTestId without throwing', () => {
  const synthetic = {
    'dom-create': { results: [{ size: 100, createTime: { value: 5 } }, { size: 100000, createTime: { value: 300 } }] },
    'js-performance': { results: { objectCreation: { value: 100 }, arrayOps: { value: 50 } } },
  };
  const { scores, overall } = scoreRun(synthetic);
  assert.ok(typeof scores.dom === 'number');
  assert.ok(typeof scores.javascript === 'number');
  assert.ok(overall === null || (overall >= 0 && overall <= 100));
});

test('scoreRun returns null overall for empty input', () => {
  const { overall } = scoreRun({});
  assert.equal(overall, null);
});

console.log(`\n${passed} test(s) passed.`);
