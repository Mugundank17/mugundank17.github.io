#!/usr/bin/env node
/*
 * Builds the non-movie sections: TV series, games and music.
 * Run after scripts/update-movies.mjs (which recreates data/).
 *
 * Each section is independent — if one provider fails, the others still build and the
 * failed section keeps the last published copy (restored from _prev/ by the workflow).
 *
 *   node scripts/build-extras.mjs            # all sections
 *   node scripts/build-extras.mjs tv music   # selected sections
 */
import { writeFile, mkdir, cp, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "data");
const PREV = path.join(ROOT, "_prev");
const wanted = process.argv.slice(2);
const want = (s) => !wanted.length || wanted.includes(s);

async function writeSection(name, index, details, meta = {}) {
  const dir = path.join(DATA, name);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "index.json"), JSON.stringify({ updated: new Date().toISOString(), ...meta, items: index }));
  for (const [id, d] of details) await writeFile(path.join(dir, `${String(id).replace(/[^\w.-]/g, "_")}.json`), JSON.stringify(d));
}

async function keepPrevious(name) {
  try {
    await access(path.join(PREV, name));
    await cp(path.join(PREV, name), path.join(DATA, name), { recursive: true });
    console.log(`  ${name}: kept the previously published data`);
  } catch { console.log(`  ${name}: no previous data to keep`); }
}

const sections = {
  async tv() {
    const { buildTV } = await import("./providers/tmdb-tv.mjs");
    const { index, details } = await buildTV({ regions: ["IN", "US", "GB"] });
    await writeSection("tv", index, details, {
      attribution: "Show data from TMDB. Episode schedules from TVmaze (CC BY-SA 4.0).",
    });
  },
  async games() {
    const { buildGames } = await import("./providers/games.mjs");
    const { index, details } = await buildGames({ countries: ["US", "IN", "GB"] });
    await writeSection("games", index, details, {
      attribution: "PC game data from Steam (store.steampowered.com). Console and cross-platform data from IGDB.com.",
    });
  },
};

let failed = 0;
for (const [name, run] of Object.entries(sections)) {
  if (!want(name)) continue;
  const t = Date.now();
  console.log(`Building ${name}…`);
  try {
    await run();
    console.log(`  ${name}: done in ${Math.round((Date.now() - t) / 1000)}s`);
  } catch (err) {
    failed++;
    console.warn(`! ${name} failed: ${err.message}`);
    await keepPrevious(name);
  }
}
process.exitCode = 0; // a failed section never breaks the deploy
if (failed) console.warn(`${failed} section(s) failed — see above.`);
