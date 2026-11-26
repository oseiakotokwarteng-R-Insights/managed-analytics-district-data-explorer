// Turns the raw downloads into the small data files the page reads.
//   raw/acs-<state>.json          the Census numbers
//   raw/cb_2024_..._sldl_500k.zip  the district shapes
// becomes
//   site/data/<state>.json         one row per district: each measure, its margin of error, its rank
//   site/data/<state>-map.json     the district shapes, simplified so the page stays fast
//   site/data/indicators.json      what each measure means
//
// It refuses to write anything if the checks fail (missing districts, impossible values,
// or district populations that don't add up to the state's).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import AdmZip from "adm-zip";
import * as shapefile from "shapefile";
import { topology } from "topojson-server";
import { presimplify, simplify, quantile } from "topojson-simplify";
import { feature } from "topojson-client";
import { ROOT } from "./lib/env.mjs";
import { ACS_YEAR, BOUNDARY_YEAR, INDICATORS, STATES } from "./lib/config.mjs";
import { cleanValue, cleanMargin, sumMoe, shareMoe, cv, reliability, ranks, percentiles, round } from "./lib/calc.mjs";

const outDir = join(ROOT, "site", "data");
mkdirSync(outDir, { recursive: true });

const SIMPLIFY_KEEP = 0.55; // keep the shapes this far along the simplification ladder (0 = rough, 1 = full detail)
const COORD_DECIMALS = 4;   // about 10 metres

// ------------------------------------------------------------------ shapes

async function loadShapes(state) {
  const zip = new AdmZip(join(ROOT, "raw", `cb_${BOUNDARY_YEAR}_${state.fips}_sldl_500k.zip`));
  const shp = zip.getEntries().find((e) => e.entryName.endsWith(".shp")).getData();
  const dbf = zip.getEntries().find((e) => e.entryName.endsWith(".dbf")).getData();
  const fc = await shapefile.read(shp, dbf);
  return fc.features.map((f) => ({
    type: "Feature",
    id: f.properties.SLDLST,
    properties: { id: f.properties.SLDLST },
    geometry: f.geometry,
  }));
}

function roundCoords(coords) {
  if (typeof coords[0] === "number") return coords.map((c) => round(c, COORD_DECIMALS));
  return coords.map(roundCoords);
}

function simplifyShapes(features) {
  const topo = topology({ districts: { type: "FeatureCollection", features } });
  const pre = presimplify(topo);
  // quantile(p) is the weight below which p of all points fall. Dropping points under it
  // keeps the biggest bends and removes the tiny wiggles, without opening gaps between neighbours.
  const small = simplify(pre, quantile(pre, 1 - SIMPLIFY_KEEP));
  const fc = feature(small, small.objects.districts);
  return fc.features.map((f) => ({
    type: "Feature",
    id: f.id,
    properties: { id: f.id },
    geometry: { type: f.geometry.type, coordinates: roundCoords(f.geometry.coordinates) },
  }));
}

function bounds(features) {
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  const walk = (c) => {
    if (typeof c[0] === "number") {
      w = Math.min(w, c[0]); e = Math.max(e, c[0]); s = Math.min(s, c[1]); n = Math.max(n, c[1]);
    } else c.forEach(walk);
  };
  features.forEach((f) => walk(f.geometry.coordinates));
  return [w, s, e, n].map((x) => round(x, 3));
}

// ------------------------------------------------------------------ numbers

function readAcs(state) {
  const raw = JSON.parse(readFileSync(join(ROOT, "raw", `acs-${state.slug}.json`), "utf8"));
  const col = Object.fromEntries(raw.header.map((h, i) => [h, i]));
  const districtCol = "state legislative district (lower chamber)";
  const rows = raw.rows.filter((r) => !/Z/.test(r[col[districtCol]]));
  return { raw, col, districtCol, rows };
}

// One variable for one district: { est, moe }, or null if the Census didn't give a usable estimate.
// moe can be null when the estimate is fine but its margin can't be worked out (see cleanMargin).
function cell(row, col, code) {
  const est = cleanValue(row[col[code + "E"]]);
  if (est === null) return null;
  return { est, moe: cleanMargin(row[col[code + "M"]]) };
}

// The Census tops out median household income at this value. Anything shown as this or
// more means "this much or more", not an exact figure.
const INCOME_TOP_CODE = 250001;

function measure(row, col, spec) {
  if (spec.kind === "value") {
    const c = cell(row, col, spec.variable);
    if (!c) return null;
    const topCoded = spec.variable === "B19013_001" && c.est >= INCOME_TOP_CODE;
    return { est: c.est, moe: c.moe, topCoded };
  }
  const parts = spec.parts.map((p) => cell(row, col, p));
  const whole = spec.whole.map((p) => cell(row, col, p));
  const minus = (spec.wholeMinus || []).map((p) => cell(row, col, p));
  // A share needs a margin on every piece. If one is missing, there's no honest margin to give.
  if ([...parts, ...whole, ...minus].some((c) => c === null || c.moe === null)) return null;

  const partEst = parts.reduce((t, c) => t + c.est, 0);
  const partMoe = sumMoe(parts.map((c) => c.moe));
  const wholeEst = whole.reduce((t, c) => t + c.est, 0) - minus.reduce((t, c) => t + c.est, 0);
  const wholeMoe = sumMoe([...whole, ...minus].map((c) => c.moe)); // a difference's margin is built the same way as a sum's
  if (wholeEst <= 0) return null;
  return {
    est: (partEst / wholeEst) * 100,
    moe: shareMoe(partEst, wholeEst, partMoe, wholeMoe) * 100,
  };
}

function buildDistricts(state) {
  const { raw, col, districtCol, rows } = readAcs(state);
  const names = Object.keys(INDICATORS);

  const districts = rows
    .map((r) => {
      const id = r[col[districtCol]];
      const values = {};
      for (const key of names) {
        const m = measure(r, col, INDICATORS[key]);
        const decimals = INDICATORS[key].kind === "share" ? 1 : 0;
        values[key] = m
          ? {
              est: round(m.est, decimals),
              moe: m.moe === null ? null : round(m.moe, decimals),
              // A margin of 0 means the figure is pinned to an official count, so it's solid.
              rel: m.moe === null ? "unknown" : m.moe === 0 ? "good" : reliability(cv(m.est, m.moe)),
              ...(m.topCoded ? { topCoded: true } : {}),
            }
          : null;
      }
      return { id, number: Number(id), name: `District ${Number(id)}`, values };
    })
    .sort((a, b) => a.number - b.number);

  // Where each district stands among the state's districts, per measure.
  for (const key of names) {
    const vals = districts.map((d) => (d.values[key] ? d.values[key].est : null));
    const rk = ranks(vals);
    const pc = percentiles(vals);
    districts.forEach((d, i) => {
      if (d.values[key]) {
        d.values[key].rank = rk[i];
        d.values[key].pct = pc[i];
      }
    });
  }
  return { districts, raw };
}

// ------------------------------------------------------------------ checks

function check(state, districts, features, raw) {
  const problems = [];
  if (districts.length !== state.expectedDistricts) problems.push(`expected ${state.expectedDistricts} districts of data, found ${districts.length}`);
  if (features.length !== state.expectedDistricts) problems.push(`expected ${state.expectedDistricts} district shapes, found ${features.length}`);

  const dataIds = new Set(districts.map((d) => d.id));
  const shapeIds = new Set(features.map((f) => f.id));
  for (const id of dataIds) if (!shapeIds.has(id)) problems.push(`district ${id} has numbers but no shape`);
  for (const id of shapeIds) if (!dataIds.has(id)) problems.push(`district ${id} has a shape but no numbers`);

  for (const d of districts) {
    for (const [key, spec] of Object.entries(INDICATORS)) {
      const v = d.values[key];
      if (!v) { problems.push(`${state.name} ${d.name}: no ${key}`); continue; }
      if (spec.kind === "share" && (v.est < 0 || v.est > 100)) problems.push(`${d.name} ${key} is ${v.est}, outside 0 to 100`);
      if (spec.kind === "value" && v.est < 0) problems.push(`${d.name} ${key} is negative`);
      if (v.moe !== null && v.moe < 0) problems.push(`${d.name} ${key} has a negative margin of error`);
      // A missing margin is only expected for a top coded income. Anything else would be a surprise.
      if (v.moe === null && !v.topCoded) problems.push(`${d.name} ${key} has no margin of error`);
    }
  }

  const total = districts.reduce((t, d) => t + d.values.population.est, 0);
  const off = Math.abs(total - raw.stateTotalPopulation) / raw.stateTotalPopulation;
  if (off > 0.005) problems.push(`district populations add up to ${total}, but the state total is ${raw.stateTotalPopulation}`);

  if (problems.length) throw new Error(`${state.name} failed its checks:\n  ` + problems.join("\n  "));
  return { total, off };
}

// ------------------------------------------------------------------ go

const built = new Date().toISOString().slice(0, 10);

for (const state of STATES) {
  const features = simplifyShapes(await loadShapes(state));
  const { districts, raw } = buildDistricts(state);
  const { total } = check(state, districts, features, raw);

  const meta = {
    state: state.name,
    slug: state.slug,
    fips: state.fips,
    chamber: "State House",
    source: `American Community Survey 5-year estimates, 2020 to ${ACS_YEAR}`,
    boundaries: `Census Bureau cartographic boundary files, ${BOUNDARY_YEAR}, 1:500,000`,
    acsFetched: raw.fetched,
    built,
    stateTotalPopulation: raw.stateTotalPopulation,
    bounds: bounds(features),
  };

  writeFileSync(join(outDir, `${state.slug}.json`), JSON.stringify({ ...meta, districts }));
  writeFileSync(join(outDir, `${state.slug}-map.json`), JSON.stringify({ type: "FeatureCollection", features }));

  const kb = (name) => Math.round(readFileSync(join(outDir, name)).length / 1024);
  const low = Object.keys(INDICATORS).map((k) => `${k} ${districts.filter((d) => d.values[k].rel === "low").length}`).join(", ");
  console.log(`${state.name}: ${districts.length} districts, population ${total.toLocaleString("en-US")} (matches the state total)`);
  console.log(`  ${state.slug}.json ${kb(state.slug + ".json")} KB, ${state.slug}-map.json ${kb(state.slug + "-map.json")} KB`);
  console.log(`  districts with a shaky estimate (low reliability): ${low}`);
}

// What each measure means, written once.
const indicators = Object.fromEntries(
  Object.entries(INDICATORS).map(([k, v]) => [k, { label: v.label, unit: v.unit, kind: v.kind, what: v.what }])
);
writeFileSync(join(outDir, "indicators.json"), JSON.stringify(indicators, null, 1));
console.log("indicators.json written");
