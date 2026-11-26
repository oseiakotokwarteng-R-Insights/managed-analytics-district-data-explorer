// Downloads the Census Bureau's state House district boundary files (public, no key needed).
// They go in raw/, which Git ignores, and they're skipped if already there.
import { existsSync, mkdirSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./lib/env.mjs";
import { BOUNDARY_YEAR, STATES } from "./lib/config.mjs";

const rawDir = join(ROOT, "raw");
mkdirSync(rawDir, { recursive: true });

for (const s of STATES) {
  const name = `cb_${BOUNDARY_YEAR}_${s.fips}_sldl_500k.zip`;
  const dest = join(rawDir, name);
  if (existsSync(dest)) {
    console.log(`${name}: already downloaded (${Math.round(statSync(dest).size / 1024)} KB)`);
    continue;
  }
  const url = `https://www2.census.gov/geo/tiger/GENZ${BOUNDARY_YEAR}/shp/${name}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Couldn't download ${name}: HTTP ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  writeFileSync(dest, bytes);
  console.log(`${name}: downloaded ${Math.round(bytes.length / 1024)} KB from www2.census.gov`);
}
