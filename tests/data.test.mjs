// Checks on the finished data files in site/data. These run without a Census key.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));
const size = (p) => readFileSync(join(root, p)).length;

const STATES = [
  { slug: "va", name: "Virginia", count: 100, lon: [-84, -75], lat: [36, 40] },
  { slug: "tx", name: "Texas", count: 150, lon: [-107, -93], lat: [25, 37] },
];
const indicators = read("site/data/indicators.json");
const keys = Object.keys(indicators);

test("there are seven measures, each explained in plain words", () => {
  assert.deepEqual(keys.sort(), ["electric", "income", "novehicle", "population", "renters", "rentstress", "transit"]);
  for (const k of keys) {
    assert.ok(indicators[k].label && indicators[k].unit && indicators[k].what.length > 20, `${k} needs a label, unit and explanation`);
  }
});

for (const s of STATES) {
  const data = read(`site/data/${s.slug}.json`);
  const map = read(`site/data/${s.slug}-map.json`);

  test(`${s.name}: every district has both numbers and a shape, and no extras`, () => {
    assert.equal(data.districts.length, s.count);
    assert.equal(map.features.length, s.count);
    const ids = data.districts.map((d) => d.id);
    assert.equal(new Set(ids).size, s.count, "ids are unique");
    assert.deepEqual([...ids].sort(), map.features.map((f) => f.id).sort());
  });

  test(`${s.name}: every measure is present and sensible for every district`, () => {
    for (const d of data.districts) {
      for (const k of keys) {
        const v = d.values[k];
        assert.ok(v, `${d.name} is missing ${k}`);
        assert.ok(Number.isFinite(v.est) && v.est >= 0, `${d.name} ${k} estimate`);
        if (indicators[k].kind === "share") assert.ok(v.est <= 100, `${d.name} ${k} is over 100`);
        if (v.moe !== null) assert.ok(Number.isFinite(v.moe) && v.moe >= 0, `${d.name} ${k} margin`);
        assert.ok(["good", "caution", "low", "unknown"].includes(v.rel));
        assert.ok(v.rank >= 1 && v.rank <= s.count, `${d.name} ${k} rank`);
        assert.ok(v.pct >= 0 && v.pct <= 100);
      }
    }
  });

  test(`${s.name}: ranks agree with the values (a higher value never ranks lower)`, () => {
    for (const k of keys) {
      const sorted = [...data.districts].sort((a, b) => b.values[k].est - a.values[k].est);
      for (let i = 1; i < sorted.length; i++) {
        assert.ok(sorted[i - 1].values[k].rank <= sorted[i].values[k].rank, `${k}: ${sorted[i - 1].name} vs ${sorted[i].name}`);
      }
    }
  });

  test(`${s.name}: district populations add up to the state's own total`, () => {
    const total = data.districts.reduce((t, d) => t + d.values.population.est, 0);
    assert.equal(total, data.stateTotalPopulation);
  });

  test(`${s.name}: a missing margin only ever means a top coded income, and it's flagged`, () => {
    for (const d of data.districts) {
      for (const k of keys) {
        const v = d.values[k];
        if (v.moe === null) {
          assert.equal(k, "income");
          assert.equal(v.topCoded, true);
          assert.ok(v.est >= 250001);
          assert.equal(v.rel, "unknown");
        }
      }
    }
  });

  test(`${s.name}: the shapes are real polygons, inside the state, and closed`, () => {
    for (const f of map.features) {
      assert.ok(["Polygon", "MultiPolygon"].includes(f.geometry.type));
      const rings = f.geometry.type === "Polygon" ? f.geometry.coordinates : f.geometry.coordinates.flat();
      assert.ok(rings.length > 0);
      for (const ring of rings) {
        assert.ok(ring.length >= 4, `${f.id} has a ring with too few points`);
        assert.deepEqual(ring[0], ring[ring.length - 1], `${f.id} has a ring that isn't closed`);
        for (const [lon, lat] of ring) {
          assert.ok(lon > s.lon[0] && lon < s.lon[1] && lat > s.lat[0] && lat < s.lat[1], `${f.id} has a point outside ${s.name}: ${lon}, ${lat}`);
        }
      }
    }
  });

  test(`${s.name}: outer edges wind clockwise and holes counterclockwise, the way D3 draws them`, () => {
    // Without this the map is drawn as "everything except the district", many thousands of pixels tall.
    const area = (ring) => {
      let sum = 0;
      for (let i = 0; i < ring.length - 1; i++) sum += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
      return sum / 2;
    };
    for (const f of map.features) {
      const polygons = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
      for (const rings of polygons) {
        rings.forEach((ring, i) => {
          if (i === 0) assert.ok(area(ring) < 0, `${f.id} has an outer edge wound the wrong way`);
          else assert.ok(area(ring) > 0, `${f.id} has a hole wound the wrong way`);
        });
      }
    }
  });

  test(`${s.name}: the files are small enough to load fast on a phone`, () => {
    assert.ok(size(`site/data/${s.slug}.json`) < 120 * 1024, "numbers file under 120 KB");
    assert.ok(size(`site/data/${s.slug}-map.json`) < 800 * 1024, "map file under 800 KB");
  });

  test(`${s.name}: the file says where its numbers came from`, () => {
    assert.match(data.source, /American Community Survey/);
    assert.match(data.source, /2020 to 2024/);
    assert.match(data.boundaries, /2024/);
    assert.ok(data.built && data.acsFetched);
  });

  // The strongest check: work every measure out again from the raw Census download, with
  // separate, plainly written formulas, and compare with what the build produced.
  const rawPath = join(root, "raw", `acs-${s.slug}.json`);
  test(`${s.name}: every measure matches an independent recalculation from the raw download`, { skip: !existsSync(rawPath) && "raw Census download not on this computer" }, () => {
    const raw = JSON.parse(readFileSync(rawPath, "utf8"));
    const col = Object.fromEntries(raw.header.map((h, i) => [h, i]));
    const dcol = "state legislative district (lower chamber)";
    for (const row of raw.rows) {
      const g = (c) => Number(row[col[c]]);
      const d = data.districts.find((x) => x.id === row[col[dcol]]);
      assert.ok(d, `no built district for ${row[col[dcol]]}`);
      const expected = {
        transit: (g("B08301_010E") / g("B08301_001E")) * 100,
        novehicle: ((g("B25044_003E") + g("B25044_010E")) / g("B25044_001E")) * 100,
        renters: (g("B25003_003E") / g("B25003_001E")) * 100,
        rentstress: ((g("B25070_007E") + g("B25070_008E") + g("B25070_009E") + g("B25070_010E")) / (g("B25070_001E") - g("B25070_011E"))) * 100,
        electric: (g("B25040_004E") / g("B25040_001E")) * 100,
        income: g("B19013_001E"),
        population: g("B01003_001E"),
      };
      for (const [k, v] of Object.entries(expected)) {
        assert.ok(Math.abs(d.values[k].est - v) <= 0.051, `${d.name} ${k}: built ${d.values[k].est}, recalculated ${v}`);
      }
    }
  });
}
