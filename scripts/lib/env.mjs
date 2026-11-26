// Reads the Census key from the .env file in the project folder (or from the environment).
// The key is never printed, and never part of an error message.
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(here, "..", "..");

export function censusKey() {
  const file = join(ROOT, ".env");
  if (existsSync(file) && !process.env.CENSUS_API_KEY) process.loadEnvFile(file);
  const key = (process.env.CENSUS_API_KEY || "").trim();
  if (!key) {
    throw new Error("No Census API key found. Put CENSUS_API_KEY=your-key in a file named .env in the project folder.");
  }
  return key;
}
