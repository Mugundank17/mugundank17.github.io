#!/usr/bin/env node
/*
 * Builds the site's data from TMDB (https://www.themoviedb.org):
 *
 *   movies.js              every movie on the site, with release dates and age
 *                          ratings for every country, translations, artwork,
 *                          cast, official YouTube trailers/teasers and colours
 *   data/people/<id>.json  a profile for every cast member and director:
 *                          bio, photos and filmography
 *   data/i18n/<lang>.json  translated titles, taglines and overviews
 *
 * Movies come from watchlist.json, the most popular upcoming releases, and
 * classic films returning to cinemas (re-releases).
 *
 * Auth (either one):
 *   TMDB_TOKEN    TMDB "API Read Access Token" (v4, sent as a Bearer header)
 *   TMDB_API_KEY  TMDB "API Key" (v3, sent as ?api_key=)
 *
 * Usage: node scripts/update-movies.mjs
 */
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import jpeg from "jpeg-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const API = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p";
const TOKEN = process.env.TMDB_TOKEN;
const KEY = process.env.TMDB_API_KEY;
const DAY = 86400000;

if (!TOKEN && !KEY) {
  console.error("Set TMDB_TOKEN or TMDB_API_KEY. Get one free at https://www.themoviedb.org/settings/api");
  process.exit(1);
}

const config = JSON.parse(await readFile(path.join(ROOT, "watchlist.json"), "utf8"));
const REGION = config.region || "US";
const LANG = config.language || "en-US";
const TODAY = new Date().toISOString().slice(0, 10);
const isoDaysFromNow = (n) => new Date(Date.now() + n * DAY).toISOString().slice(0, 10);

// ---------- helpers ----------
async function tmdb(route, params = {}) {
  const url = new URL(API + route);
  for (const [k, v] of Object.entries({ language: LANG, ...params })) url.searchParams.set(k, v);
  if (KEY && !TOKEN) url.searchParams.set("api_key", KEY);
  const headers = { accept: "application/json" };
  if (TOKEN) headers.authorization = `Bearer ${TOKEN}`;

  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(url, { headers });
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      continue;
    }
    if (!res.ok) throw new Error(`TMDB ${res.status} for ${route}: ${await res.text()}`);
    return res.json();
  }
  throw new Error(`TMDB kept failing for ${route}`);
}

// Run fn over items with limited concurrency, keeping order.
async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      try { out[i] = await fn(items[i], i); } catch (err) { console.warn(`! ${err.message}`); out[i] = null; }
    }
  }));
  return out;
}

const slugify = (s) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const img = (size, p) => (p ? `${IMG}/${size}${p}` : null);

function bestImage(list) {
  const top = (list || []).slice().sort((a, b) => b.vote_average - a.vote_average || b.width - a.width)[0];
  return top?.file_path || null;
}

// ---------- finding movies ----------
async function findId(entry) {
  if (entry.tmdb) return entry.tmdb;
  const params = { query: entry.title, include_adult: "false" };
  let { results } = await tmdb("/search/movie", entry.year ? { ...params, primary_release_year: entry.year } : params);
  if (!results.length && entry.year) ({ results } = await tmdb("/search/movie", params));
  if (!results.length) return null;
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  return (results.find((r) => norm(r.title) === norm(entry.title)) || results[0]).id;
}

async function discoverUpcoming(count) {
  const ids = [];
  for (let page = 1; ids.length < count && page <= 3; page++) {
    const { results } = await tmdb("/discover/movie", {
      region: REGION, "release_date.gte": TODAY, with_release_type: "2|3",
      "primary_release_date.gte": isoDaysFromNow(-365), // old films coming back are re-releases
      sort_by: "popularity.desc", include_adult: "false", page,
    });
    for (const r of results) if (ids.length < count && r.poster_path && r.backdrop_path) ids.push(r.id);
  }
  return ids;
}

// Classic films with a new cinema date coming up in any of the given countries.
async function discoverRereleases(regions, count) {
  if (!count) return [];
  const ids = new Set();
  for (const region of regions) {
    const { results } = await tmdb("/discover/movie", {
      region, "release_date.gte": isoDaysFromNow(-7), "release_date.lte": isoDaysFromNow(150),
      "primary_release_date.lte": isoDaysFromNow(-730), with_release_type: "2|3",
      sort_by: "popularity.desc", include_adult: "false",
    });
    results.filter((r) => r.backdrop_path).slice(0, 6).forEach((r) => ids.add(r.id));
  }
  return [...ids].slice(0, count);
}

// ---------- per-country dates ----------
const TYPE_ORDER = [3, 2, 4, 1]; // theatrical, limited, digital, premiere

function datesByCountry(d, rerelease) {
  const primary = d.release_date || "";
  const dates = {}, certs = {};
  for (const r of d.release_dates?.results || []) {
    let entries = r.release_dates.map((x) => ({ ...x, day: x.release_date.slice(0, 10) }));
    const cert = entries.find((x) => x.certification)?.certification;
    if (cert) certs[r.iso_3166_1] = cert;
    if (rerelease) {
      // Only new cinema dates at least a year after the original release.
      entries = entries.filter((x) => (x.type === 3 || x.type === 2) && x.day >= isoDaysFromNow(-30) &&
        (!primary || new Date(x.day) - new Date(primary) > 365 * DAY));
    }
    for (const type of TYPE_ORDER) {
      const days = entries.filter((x) => x.type === type).map((x) => x.day).sort();
      if (days.length) { dates[r.iso_3166_1] = days[0]; break; }
    }
  }
  return { dates, certs };
}

function translations(d) {
  const out = {};
  for (const t of d.translations?.translations || []) {
    const lang = t.iso_639_1;
    if (lang === "en" || out[lang]) continue;
    const { title = "", overview = "", tagline = "" } = t.data || {};
    if (!title && !overview) continue;
    out[lang] = { title, overview, tagline };
  }
  return out;
}

function trailers(d) {
  const rank = { Trailer: 0, Teaser: 1 };
  return (d.videos?.results || [])
    .filter((v) => v.site === "YouTube" && v.type in rank)
    .sort((a, b) => (b.official - a.official) || (rank[a.type] - rank[b.type]) ||
      (new Date(b.published_at) - new Date(a.published_at)))
    .slice(0, 8)
    .map((v) => ({ key: v.key, name: v.name, type: v.type, published: v.published_at?.slice(0, 10) }));
}

// ---------- colours from an image ----------
async function palette(url) {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const { width, height, data } = jpeg.decode(Buffer.from(await res.arrayBuffer()), { useTArray: true });
    const bins = new Array(36).fill(0);
    const sums = Array.from({ length: 36 }, () => [0, 0]);
    let total = 0;
    for (let i = 0; i < width * height * 4; i += 16) {
      const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b), c = max - min;
      if (max < 0.18 || c / max < 0.25) continue; // skip dark & greyish pixels
      let h = max === r ? ((g - b) / c) % 6 : max === g ? (b - r) / c + 2 : (r - g) / c + 4;
      h = (h * 60 + 360) % 360;
      const w = (c / max) * max * max; // favour vivid, bright pixels
      const bin = Math.floor(h / 10);
      bins[bin] += w; total += w;
      sums[bin][0] += Math.cos((h * Math.PI) / 180) * w;
      sums[bin][1] += Math.sin((h * Math.PI) / 180) * w;
    }
    if (!total) return null;
    const score = bins.map((_, i) => bins[i] + 0.5 * (bins[(i + 35) % 36] + bins[(i + 1) % 36]));
    const hueOf = (i) => {
      const [x, y] = [-1, 0, 1].reduce((acc, o) => {
        const s = sums[(i + o + 36) % 36];
        return [acc[0] + s[0], acc[1] + s[1]];
      }, [0, 0]);
      return Math.round(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360);
    };
    const order = score.map((s, i) => [s, i]).sort((a, b) => b[0] - a[0]);
    const first = order[0][1];
    const dist = (a, b) => Math.min(Math.abs(a - b), 36 - Math.abs(a - b));
    const second = order.find(([s, i]) => dist(i, first) >= 4 && s > order[0][0] * 0.15);
    const h1 = hueOf(first);
    const h2 = second ? hueOf(second[1]) : (h1 + 345) % 360; // no 2nd colour: a warmer neighbour
    return [h1, h2];
  } catch {
    return null;
  }
}

// ---------- one movie ----------
async function buildMovie(id, kind) {
  const d = await tmdb(`/movie/${id}`, {
    append_to_response: "videos,credits,release_dates,images,translations",
    include_video_language: "en,null",
    include_image_language: "en,null",
  });
  const { dates, certs } = datesByCountry(d, kind === "rerelease");
  const sortedDates = Object.values(dates).sort();
  const date = dates[REGION] || (kind === "rerelease" ? sortedDates[0] : d.release_date || sortedDates[0]);
  if (!date) return null;

  const textless = bestImage(d.images?.backdrops?.filter((b) => b.iso_639_1 === null));
  const backdropPath = textless || d.backdrop_path;
  const posterPath = bestImage(d.images?.posters?.filter((p) => p.iso_639_1 === "en")) || d.poster_path;
  const logoPath = bestImage(d.images?.logos?.filter((l) => l.iso_639_1 === "en" && !l.file_path.endsWith(".svg")));
  const directors = (d.credits?.crew || []).filter((c) => c.job === "Director").slice(0, 2);

  return {
    id: `${slugify(d.title)}-${d.id}`,
    tmdb: d.id,
    kind, // "pinned" | "auto" | "rerelease"
    title: d.title,
    date,
    dates,
    certs,
    originalDate: d.release_date || null,
    director: directors.map((c) => c.name).join(" & "),
    directors: directors.map((c) => ({ name: c.name, id: c.id })),
    tagline: d.tagline || "",
    synopsis: d.overview || "",
    i18n: translations(d),
    genres: (d.genres || []).map((g) => g.name),
    runtime: d.runtime || null,
    poster: img("w500", posterPath),
    backdrop: img("w1280", backdropPath),
    card: img("w780", backdropPath),
    logo: img("w500", logoPath),
    artHasTitle: !textless && !!backdropPath,
    hue: (await palette(img("w300", backdropPath))) || (await palette(img("w185", posterPath))) || [20, 40],
    trailers: trailers(d),
    cast: (d.credits?.cast || []).slice(0, 12).map((c) => ({
      actor: c.name, role: c.character || "", photo: img("w185", c.profile_path), tmdb: c.id,
    })),
    links: {
      official: d.homepage || null,
    },
  };
}

// ---------- one person ----------
const CREW_JOBS = new Set(["Director", "Screenplay", "Writer", "Story", "Novel", "Producer",
  "Executive Producer", "Original Music Composer", "Director of Photography", "Editor"]);

async function buildPerson(id, hue) {
  const p = await tmdb(`/person/${id}`, { append_to_response: "movie_credits,images" });
  const films = new Map();
  const add = (c, role, kind) => {
    if (c.adult) return;
    if (!films.has(c.id)) {
      films.set(c.id, {
        id: c.id, title: c.title, date: c.release_date || null,
        poster: img("w342", c.poster_path), backdrop: img("w1280", c.backdrop_path),
        overview: (c.overview || "").slice(0, 320), roles: [], votes: c.vote_count || 0,
      });
    }
    const f = films.get(c.id);
    const label = kind === "cast" ? (role || "Actor") : role;
    if (label && !f.roles.includes(label)) f.roles.push(label);
  };
  for (const c of p.movie_credits?.cast || []) add(c, c.character, "cast");
  for (const c of p.movie_credits?.crew || []) if (CREW_JOBS.has(c.job)) add(c, c.job, "crew");

  const list = [...films.values()].filter((f) => f.poster || f.date);
  const knownFor = list.slice().sort((a, b) => b.votes - a.votes).slice(0, 10).map((f) => f.id);
  const credits = list
    .sort((a, b) => (b.date || "9999").localeCompare(a.date || "9999") || a.id - b.id)
    .slice(0, 100)
    .map(({ votes, ...f }) => f);

  return {
    id: p.id,
    name: p.name,
    bio: p.biography || "",
    birthday: p.birthday || null,
    deathday: p.deathday || null,
    place: p.place_of_birth || null,
    dept: p.known_for_department || null,
    photo: img("h632", p.profile_path),
    photos: (p.images?.profiles || []).slice(0, 8).map((x) => img("w342", x.file_path)),
    hue,
    knownFor,
    credits,
  };
}

// ---------- main ----------
const pinned = [];
for (const entry of config.movies || []) {
  const id = await findId(entry);
  if (id) pinned.push(id); else console.warn(`! Not found on TMDB: ${entry.title}`);
}
const auto = (await discoverUpcoming(config.autoUpcoming ?? 12)).filter((id) => !pinned.includes(id));
const rereleaseIds = (await discoverRereleases(config.reReleaseRegions || [REGION], config.reReleases ?? 10))
  .filter((id) => !pinned.includes(id) && !auto.includes(id));

const jobs = [
  ...pinned.map((id) => [id, "pinned"]),
  ...auto.map((id) => [id, "auto"]),
  ...rereleaseIds.map((id) => [id, "rerelease"]),
];
const cutoff = Date.now() - (config.keepReleasedDays ?? 60) * DAY;
const movies = (await pool(jobs, 6, ([id, kind]) => buildMovie(id, kind)))
  .filter(Boolean)
  .filter((m) => m.kind === "pinned" ||
    new Date(m.date).getTime() >= (m.kind === "rerelease" ? Date.now() - 21 * DAY : cutoff))
  .sort((a, b) => a.date.localeCompare(b.date) || a.tmdb - b.tmdb);
for (const m of movies) {
  console.log(`✓ [${m.kind}] ${m.title} — ${m.date} — ${Object.keys(m.dates).length} countries — ${m.trailers.length} videos`);
}

// People: everyone in the cast lists plus directors, coloured like their first movie.
const people = new Map();
for (const m of movies) {
  for (const c of m.cast) if (!people.has(c.tmdb)) people.set(c.tmdb, m.hue);
  for (const d of m.directors) if (!people.has(d.id)) people.set(d.id, m.hue);
}
const peopleDir = path.join(ROOT, "data", "people");
await rm(peopleDir, { recursive: true, force: true });
await mkdir(peopleDir, { recursive: true });
let written = 0;
await pool([...people], 8, async ([id, hue]) => {
  const person = await buildPerson(id, hue);
  await writeFile(path.join(peopleDir, `${id}.json`), JSON.stringify(person));
  written++;
});

// Translations go in one small file per language, so visitors only load their own.
const i18nDir = path.join(ROOT, "data", "i18n");
await rm(i18nDir, { recursive: true, force: true });
await mkdir(i18nDir, { recursive: true });
const byLang = {};
for (const m of movies) {
  for (const [lang, t] of Object.entries(m.i18n)) (byLang[lang] ||= {})[m.tmdb] = t;
  delete m.i18n;
}
for (const [lang, table] of Object.entries(byLang)) {
  await writeFile(path.join(i18nDir, `${lang}.json`), JSON.stringify(table));
}

await writeFile(
  path.join(ROOT, "movies.js"),
  `// Generated by scripts/update-movies.mjs from TMDB — do not edit by hand.\n` +
  `// Edit watchlist.json instead, then run: npm run update\n` +
  `window.MOVIE_DATA = ${JSON.stringify({ updated: new Date().toISOString(), region: REGION, source: "TMDB", movies })};\n`
);
console.log(`\nWrote ${movies.length} movies to movies.js and ${written} people to data/people/`);
