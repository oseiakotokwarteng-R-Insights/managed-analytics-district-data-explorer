// The arithmetic, checked against examples worked out by hand.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Z, cleanValue, cleanMargin, sumMoe, shareMoe, cv, reliability, ranks, percentiles, round } from "../scripts/lib/calc.mjs";

const close = (actual, expected, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `expected ${expected}, got ${actual}`);

test("the Census uses 1.645 for its 90 percent margins of error", () => {
  assert.equal(Z, 1.645);
});

test("special codes for missing values become null, real numbers pass through", () => {
  assert.equal(cleanValue("-666666666"), null);
  assert.equal(cleanValue(-222222222), null);
  assert.equal(cleanValue(""), null);
  assert.equal(cleanValue(null), null);
  assert.equal(cleanValue("abc"), null);
  assert.equal(cleanValue("123"), 123);
  assert.equal(cleanValue(0), 0);
});

test("a controlled estimate has a margin of 0, an open ended one has no margin", () => {
  assert.equal(cleanMargin("-555555555"), 0);
  assert.equal(cleanMargin("-333333333"), null);
  assert.equal(cleanMargin("-666666666"), null);
  assert.equal(cleanMargin("2114"), 2114);
});

test("margins of counts add in quadrature: 3 and 4 give 5", () => {
  close(sumMoe([3, 4]), 5);
  close(sumMoe([10]), 10);
  close(sumMoe([]), 0);
});

test("margin of a share: 50 of 100, margins 20 and 20 gives sqrt(400 - 0.25 * 400) / 100", () => {
  // p = 0.5, so the square root holds 20^2 - 0.5^2 * 20^2 = 300, and the margin is sqrt(300) / 100.
  close(shareMoe(50, 100, 20, 20), Math.sqrt(300) / 100);
});

test("margin of a share falls back to the ratio formula when the first would go negative", () => {
  // 5^2 - 0.25 * 40^2 = -375, which can't be square rooted, so use 5^2 + 0.25 * 40^2 = 425.
  close(shareMoe(50, 100, 5, 40), Math.sqrt(425) / 100);
});

test("a share with nothing underneath has no margin", () => {
  assert.equal(shareMoe(0, 0, 1, 1), null);
});

test("coefficient of variation: a margin of 3.29 on an estimate of 10 is 20 percent", () => {
  close(cv(10, 3.29), 0.2);
  assert.equal(cv(0, 5), null);
  assert.equal(cv(10, null), null);
});

test("reliability labels follow the 15 and 30 percent rules of thumb", () => {
  assert.equal(reliability(0.15), "good");
  assert.equal(reliability(0.1500001), "caution");
  assert.equal(reliability(0.3), "caution");
  assert.equal(reliability(0.3000001), "low");
  assert.equal(reliability(null), "unknown");
});

test("ranks put the highest value first, share ties, skip after a tie and ignore missing values", () => {
  assert.deepEqual(ranks([10, 20, 20, 5, null]), [3, 1, 1, 4, null]);
});

test("percentiles run from 0 for the lowest to 100 for the highest", () => {
  assert.deepEqual(percentiles([10, 20, 30]), [0, 50, 100]);
  assert.deepEqual(percentiles([5, null, 5]), [0, null, 0]);
  assert.deepEqual(percentiles([7]), [null]);
});

test("rounding doesn't leave stray digits", () => {
  assert.equal(round(12.300000000001, 1), 12.3);
  assert.equal(round(2.5, 0), 3);
  assert.equal(round(null), null);
});
