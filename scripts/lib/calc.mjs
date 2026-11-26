// The arithmetic behind the numbers. Kept in one place, with no side effects, so it can be tested.
//
// Census margins of error are at the 90 percent confidence level, which is a z value of 1.645.

export const Z = 1.645;

// The Census marks missing or suppressed values with large negative codes, such as -666666666.
export function cleanValue(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= -111111111) return null;
  return n;
}

// A margin of error needs its own reading, because two of the Census's special codes mean
// something real:
//   -555555555  the estimate is "controlled": it's pinned to an official count, so it has no
//               sampling error. (District populations are like this.) The margin is 0.
//   -333333333  the estimate falls in the open ended top or bottom group, such as "$250,000
//               or more", so a margin can't be worked out. The margin is unknown (null).
// Any other special code also means unknown.
export function cleanMargin(v) {
  if (Number(v) === -555555555) return 0;
  return cleanValue(v);
}

// Adding counts together: add the squares of their margins, then take the square root.
export function sumMoe(moes) {
  return Math.sqrt(moes.reduce((total, m) => total + m * m, 0));
}

// The margin of error for a share, where the top is a part of the bottom.
// This is the Census's published method. If the number under the square root would be
// negative, the Census says to use the ratio formula instead.
export function shareMoe(part, whole, partMoe, wholeMoe) {
  if (!whole) return null;
  const p = part / whole;
  let inside = partMoe * partMoe - p * p * wholeMoe * wholeMoe;
  if (inside < 0) inside = partMoe * partMoe + p * p * wholeMoe * wholeMoe;
  return Math.sqrt(inside) / whole;
}

// Coefficient of variation: how big the uncertainty is compared with the estimate itself.
export function cv(estimate, moe) {
  if (!estimate || moe === null || moe === undefined) return null;
  return moe / Z / Math.abs(estimate);
}

// A plain label for how much to trust an estimate. These cutoffs are a common rule of thumb
// for survey estimates, not a Census rule: under 15 percent is solid, 15 to 30 is usable
// with care, and over 30 is shaky.
export function reliability(cvValue) {
  if (cvValue === null || cvValue === undefined) return "unknown";
  if (cvValue <= 0.15) return "good";
  if (cvValue <= 0.3) return "caution";
  return "low";
}

// Rank from highest to lowest. Rank 1 is the highest value. Equal values share a rank,
// and the next rank skips ahead (1, 2, 2, 4). Missing values get no rank.
export function ranks(values) {
  const valid = values.filter((v) => v !== null && v !== undefined);
  return values.map((v) => {
    if (v === null || v === undefined) return null;
    return 1 + valid.filter((other) => other > v).length;
  });
}

// What share of the other districts have a lower value, from 0 to 100.
export function percentiles(values) {
  const valid = values.filter((v) => v !== null && v !== undefined);
  return values.map((v) => {
    if (v === null || v === undefined || valid.length < 2) return null;
    const below = valid.filter((other) => other < v).length;
    return Math.round((below / (valid.length - 1)) * 100);
  });
}

// Round to a given number of decimals without leaving things like 12.300000000001.
export function round(value, decimals = 1) {
  if (value === null || value === undefined) return null;
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}
