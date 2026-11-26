// Asks the Census API for the numbers, one state at a time, and saves the raw answers in raw/.
// Needs the free Census key. The key is never printed, and the request address is never
// printed either, because it contains the key.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, censusKey } from "./lib/env.mjs";
import { ACS_YEAR, STATES, VARIABLES } from "./lib/config.mjs";

const key = censusKey();
const rawDir = join(ROOT, "raw");
mkdirSync(rawDir, { recursive: true });

const estimates = VARIABLES;
const margins = VARIABLES.map((v) => v.replace(/E$/, "M"));
const get = ["NAME", ...estimates, ...margins].join(",");

async function ask(query) {
  const url = `https://api.census.gov/data/${ACS_YEAR}/acs/acs5?${query}&key=${key}`;
  const res = await fetch(url, { redirect: "manual" });
  if (res.status !== 200) {
    // A 302 here means the Census didn't accept the key.
    throw new Error(`The Census API answered HTTP ${res.status}. If that's 302, the key isn't active or isn't valid.`);
  }
  return res.json();
}

for (const s of STATES) {
  const districts = await ask(
    `get=${get}&for=state%20legislative%20district%20(lower%20chamber):*&in=state:${s.fips}`
  );
  // The state's own total population, used later as a sanity check on the district numbers.
  const stateRows = await ask(`get=NAME,B01003_001E&for=state:${s.fips}`);

  const out = {
    fetched: new Date().toISOString().slice(0, 10),
    year: ACS_YEAR,
    state: s.name,
    header: districts[0],
    rows: districts.slice(1),
    stateTotalPopulation: Number(stateRows[1][1]),
  };
  writeFileSync(join(rawDir, `acs-${s.slug}.json`), JSON.stringify(out));
  console.log(`${s.name}: ${out.rows.length} districts, ${out.header.length} columns, state population ${out.stateTotalPopulation.toLocaleString("en-US")}`);
}
