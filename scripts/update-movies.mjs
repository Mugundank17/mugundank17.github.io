#!/usr/bin/env node
/*
 * Builds the site's data from TMDB (https://www.themoviedb.org).
 *
 * Output (all generated — not committed to git; the GitHub Action builds and deploys it):
 *   movies.js                  index of every movie: titles, per-country release dates
 *                              and ratings, artwork, colours, "most anticipated" ranks
 *   data/movies/<tmdb>.json    full details for one movie: synopsis, cast, trailers…
 *   data/people/<id>.json      profile for each cast member / director
 *   data/people-index.json     names + photos for search
 *   data/i18n/<lang>.json      translated titles, taglines and overviews
 *
 * Movies come from:
 *   - watchlist.json "movies" (always included)
 *   - for each country in "regions": the most popular films releasing there, plus
 *     the most popular upcoming films made there (local cinema)
 *   - the worldwide most anticipated films, in any language
 *   - classic films returning to cinemas (re-releases)
 *
 * Auth (either one):
 *   TMDB_TOKEN    TMDB "API Read Access Token" (v4, sent as a Bearer header)
 *   TMDB_API_KEY  TMDB "API Key" (v3, sent as ?api_key=)
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
const REGIONS = config.regions || [REGION];
const LANG = config.language || "en-US";
const TODAY = new Date().toISOString().slice(0, 10);
const isoDaysFromNow = (n) => new Date(Date.now() + n * DAY).toISOString().slice(0, 10);

// ---------- helpers ----------
let calls = 0;
async function tmdb(route, params = {}) {
  const url = new URL(API + route);
  for (const [k, v] of Object.entries({ language: LANG, ...params })) url.searchParams.set(k, v);
  if (KEY && !TOKEN) url.searchParams.set("api_key", KEY);
  const headers = { accept: "application/json" };
  if (TOKEN) headers.authorization = `Bearer ${TOKEN}`;

  for (let attempt = 0; attempt < 6; attempt++) {
    calls++;
    let res;
    try { res = await fetch(url, { headers }); } catch {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      continue;
    }
    if (!res.ok) throw new Error(`TMDB ${res.status} for ${route}: ${await res.text()}`);
    return res.json();
  }
  throw new Error(`TMDB kept failing for ${route}`);
}

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

const slugify = (s) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "movie";
const img = (size, p) => (p ? `${IMG}/${size}${p}` : null);
const topImages = (list, n) => (list || []).slice()
  .sort((a, b) => b.vote_average - a.vote_average || b.width - a.width).slice(0, n)
  .map((i) => [i.file_path, i.width, i.height]);
const bestImage = (list) =>
  (list || []).slice().sort((a, b) => b.vote_average - a.vote_average || b.width - a.width)[0]?.file_path || null;

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

async function discover(params, count) {
  const ids = [];
  for (let page = 1; ids.length < count && page <= 3; page++) {
    const { results, total_pages } = await tmdb("/discover/movie", {
      sort_by: "popularity.desc", include_adult: "false", page, ...params,
    });
    for (const r of results) if (ids.length < count && r.poster_path && !ids.includes(r.id)) ids.push(r.id);
    if (page >= total_pages) break;
  }
  return ids;
}

// Popular films with a cinema date coming up in a country (new films only).
const releasingIn = (region, n) => discover({
  region, "release_date.gte": TODAY, "release_date.lte": isoDaysFromNow(730),
  "primary_release_date.gte": isoDaysFromNow(-365), with_release_type: "2|3",
}, n);

// Films with a streaming (digital) release coming up — or just out — in a country.
const streamingIn = (region, n) => discover({
  region, "release_date.gte": isoDaysFromNow(-21), "release_date.lte": isoDaysFromNow(365),
  "primary_release_date.gte": isoDaysFromNow(-365), with_release_type: "4",
}, n);

// Popular upcoming films made in a country.
const madeIn = (region, n) => discover({
  with_origin_country: region,
  "primary_release_date.gte": TODAY, "primary_release_date.lte": isoDaysFromNow(730),
}, n);

const worldwide = (n) => discover({
  "primary_release_date.gte": TODAY, "primary_release_date.lte": isoDaysFromNow(730),
}, n);

// Classic films with a new cinema date coming up.
const rereleasesIn = (region, n) => discover({
  region, "release_date.gte": isoDaysFromNow(-7), "release_date.lte": isoDaysFromNow(150),
  "primary_release_date.lte": isoDaysFromNow(-730), with_release_type: "2|3",
}, n);

// Merge two ranked lists, alternating, without duplicates.
function interleave(a, b) {
  const out = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    for (const id of [a[i], b[i]]) if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

// ---------- per-country dates ----------
const TYPE_ORDER = [3, 2, 4, 1]; // theatrical, limited, digital, premiere

function datesByCountry(d, rerelease) {
  const primary = d.release_date || "";
  const dates = {}, certs = {}, theatrical = {}, digital = {};
  let premiere = null; // [date, note, country] — earliest premiere anywhere
  for (const r of d.release_dates?.results || []) {
    let entries = r.release_dates.map((x) => ({ ...x, day: x.release_date.slice(0, 10) }));
    const cert = entries.find((x) => x.certification)?.certification;
    if (cert) certs[r.iso_3166_1] = cert;
    if (rerelease) {
      entries = entries.filter((x) => (x.type === 3 || x.type === 2) && x.day >= isoDaysFromNow(-30) &&
        (!primary || new Date(x.day) - new Date(primary) > 365 * DAY));
    }
    for (const type of TYPE_ORDER) {
      const days = entries.filter((x) => x.type === type).map((x) => x.day).sort();
      if (days.length) { dates[r.iso_3166_1] = days[0]; break; }
    }
    const first = (types) => entries.filter((x) => types.includes(x.type)).map((x) => x.day).sort()[0];
    const th = first([3, 2]);
    if (th) theatrical[r.iso_3166_1] = th;
    if (!rerelease) {
      const dg = first([4]);
      if (dg) digital[r.iso_3166_1] = dg;
      for (const x of entries) {
        if (x.type === 1 && (!premiere || x.day < premiere[0])) premiere = [x.day, (x.note || "").slice(0, 60), r.iso_3166_1];
      }
    }
  }
  // Local films often have no regional dates yet: use the primary date for their home country.
  if (!rerelease && primary) {
    for (const c of d.origin_country || []) {
      if (!dates[c]) { dates[c] = primary; theatrical[c] ||= primary; }
    }
  }
  return { dates, certs, theatrical, digital, premiere };
}

// "US20261218IN20261217…" — compact, since there can be 100+ countries per film.
const packDates = (dates) => Object.entries(dates).sort().map(([c, d]) => c + d.replace(/-/g, "")).join("");

function translations(d) {
  const out = {};
  for (const t of d.translations?.translations || []) {
    const lang = t.iso_639_1;
    if (lang === "en" || out[lang]) continue;
    const { title = "", overview = "", tagline = "" } = t.data || {};
    if (!title && !overview) continue;
    out[lang] = Object.fromEntries(Object.entries({ title, overview, tagline }).filter(([, v]) => v));
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
      if (max < 0.18 || c / max < 0.25) continue;
      let h = max === r ? ((g - b) / c) % 6 : max === g ? (b - r) / c + 2 : (r - g) / c + 4;
      h = (h * 60 + 360) % 360;
      const w = (c / max) * max * max;
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
    return [h1, second ? hueOf(second[1]) : (h1 + 345) % 360];
  } catch {
    return null;
  }
}

// ---------- one movie ----------
async function buildMovie(id, kind) {
  const d = await tmdb(`/movie/${id}`, {
    append_to_response: "videos,credits,release_dates,images,translations,watch/providers",
    include_video_language: "en,null",
    include_image_language: "en,null",
  });
  if (!d.poster_path && !d.backdrop_path) return null;
  const { dates, certs, theatrical, digital, premiere } = datesByCountry(d, kind === "rerelease");
  // Streaming services per country (only the countries we rank, to keep the index small).
  const ott = {};
  for (const [cc, w] of Object.entries(d["watch/providers"]?.results || {})) {
    if (!REGIONS.includes(cc)) continue;
    const names = [...new Set((w.flatrate || []).map((p) => p.provider_name.replace(/ (Standard )?with Ads$/, "").replace(/ Amazon Channel$/, "")))];
    if (names.length) ott[cc] = names.slice(0, 4);
  }
  const sorted = Object.values(dates).sort();
  const date = kind === "rerelease" ? (dates[REGION] || sorted[0]) : (d.release_date || sorted[0]);
  if (!date) return null;

  const textless = bestImage(d.images?.backdrops?.filter((b) => b.iso_639_1 === null));
  const backdropPath = textless || d.backdrop_path;
  const posterPath = bestImage(d.images?.posters?.filter((p) => p.iso_639_1 === "en")) || d.poster_path;
  const logoPath = bestImage(d.images?.logos?.filter((l) => l.iso_639_1 === "en" && !l.file_path.endsWith(".svg")));
  const directors = (d.credits?.crew || []).filter((c) => c.job === "Director").slice(0, 2);
  const cast = (d.credits?.cast || []).slice(0, 12);
  const vids = trailers(d);
  const overview = d.overview || "";

  const index = {
    id: `${slugify(d.title)}-${d.id}`,
    tmdb: d.id,
    kind,
    title: d.title,
    ...(d.original_title && d.original_title !== d.title ? { originalTitle: d.original_title } : {}),
    lang: d.original_language,
    origin: d.origin_country || [],
    date,
    dates: packDates(dates),
    th: packDates(theatrical),
    dg: packDates(digital),
    ...(premiere ? { premiere } : {}),
    ...(Object.keys(ott).length ? { ott } : {}),
    certs,
    ...(kind === "rerelease" && d.release_date ? { originalDate: d.release_date } : {}),
    genres: (d.genres || []).map((g) => g.name),
    runtime: d.runtime || null,
    poster: img("w342", posterPath),
    card: img("w780", backdropPath),
    backdrop: img("w1280", backdropPath),
    logo: img("w500", logoPath),
    artHasTitle: !textless && !!backdropPath,
    hue: (await palette(img("w300", backdropPath))) || (await palette(img("w185", posterPath))) || [20, 40],
    blurb: overview.length > 240 ? overview.slice(0, 237).replace(/\s+\S*$/, "") + "…" : overview,
    director: directors.map((c) => c.name).join(" & "),
    people: cast.slice(0, 4).map((c) => c.name),
    video: vids[0] ? vids[0].type : null,
    trailerDate: vids.map((v) => v.published).filter(Boolean).sort().pop() || null,
    hot: {},
  };
  const detail = {
    tmdb: d.id,
    tagline: d.tagline || "",
    synopsis: overview,
    directors: directors.map((c) => ({ name: c.name, id: c.id })),
    cast: cast.map((c) => ({ actor: c.name, role: c.character || "", photo: img("w185", c.profile_path), tmdb: c.id })),
    trailers: vids,
    official: d.homepage || null,
    // Official artwork for the download section (TMDB file paths).
    artwork: {
      posters: topImages(d.images?.posters, 12),
      backdrops: topImages(d.images?.backdrops, 12),
      logos: topImages(d.images?.logos?.filter((l) => !l.file_path.endsWith(".svg")), 6),
    },
  };
  return { index, detail, i18n: translations(d), people: [...cast.map((c) => c.id), ...directors.map((c) => c.id)] };
}

// ---------- one person ----------
const CREW_JOBS = new Set(["Director", "Screenplay", "Writer", "Story", "Novel", "Producer",
  "Original Music Composer", "Director of Photography", "Editor"]);

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
    id: p.id, name: p.name, bio: p.biography || "",
    birthday: p.birthday || null, deathday: p.deathday || null,
    place: p.place_of_birth || null, dept: p.known_for_department || null,
    photo: img("h632", p.profile_path),
    thumb: img("w185", p.profile_path),
    photos: (p.images?.profiles || []).slice(0, 8).map((x) => img("w342", x.file_path)),
    hue, knownFor, credits,
  };
}

// ---------- main ----------
const started = Date.now();
const kinds = new Map(); // tmdb id -> kind (first one wins)
const hot = {};          // region -> ranked ids
const want = (id, kind) => { if (!kinds.has(id)) kinds.set(id, kind); };

for (const entry of config.movies || []) {
  const id = await findId(entry);
  if (id) want(id, "pinned"); else console.warn(`! Not found on TMDB: ${entry.title}`);
}

const perRegion = config.perRegion ?? 15;
await pool(REGIONS, 4, async (region) => {
  const [rel, local, stream] = await Promise.all([
    releasingIn(region, perRegion), madeIn(region, perRegion), streamingIn(region, config.perRegionStreaming ?? 10),
  ]);
  hot[region] = interleave(local, rel);
  for (const id of stream) want(id, "auto");
  console.log(`  ${region}: ${rel.length} releasing there, ${local.length} made there, ${stream.length} streaming`);
});
hot.WW = await worldwide(config.worldwide ?? 30);
for (const r of [...REGIONS, "WW"]) for (const id of hot[r] || []) want(id, "auto");

const rr = await pool(config.reReleaseRegions || [REGION], 4, (r) => rereleasesIn(r, 6));
const rrIds = [...new Set(rr.flat().filter(Boolean))].filter((id) => !kinds.has(id));
for (const id of rrIds.slice(0, config.reReleases ?? 12)) want(id, "rerelease");

console.log(`Building ${kinds.size} movies…`);
const cutoff = Date.now() - (config.keepReleasedDays ?? 45) * DAY;
const built = (await pool([...kinds], 8, ([id, kind]) => buildMovie(id, kind)))
  .filter(Boolean)
  .filter(({ index: m }) => m.kind === "pinned" ||
    new Date(m.date).getTime() >= (m.kind === "rerelease" ? Date.now() - 21 * DAY : cutoff));

// "Most anticipated" ranks per region (1 = most anticipated).
const byId = new Map(built.map((b) => [b.index.tmdb, b.index]));
for (const [region, ids] of Object.entries(hot)) {
  let rank = 0;
  for (const id of ids) { const m = byId.get(id); if (m && m.kind !== "rerelease") m.hot[region] = ++rank; }
}

// Write everything into a fresh data folder.
const DATA_DIR = path.join(ROOT, "data");
await rm(DATA_DIR, { recursive: true, force: true });
for (const sub of ["movies", "people", "i18n"]) await mkdir(path.join(DATA_DIR, sub), { recursive: true });

const byLang = {};
for (const b of built) {
  await writeFile(path.join(DATA_DIR, "movies", `${b.index.tmdb}.json`), JSON.stringify(b.detail));
  for (const [lang, t] of Object.entries(b.i18n)) (byLang[lang] ||= {})[b.index.tmdb] = t;
}
for (const [lang, table] of Object.entries(byLang)) {
  await writeFile(path.join(DATA_DIR, "i18n", `${lang}.json`), JSON.stringify(table));
}

// People: everyone in a cast list plus directors, coloured like their first movie.
const people = new Map();
for (const b of built) for (const id of b.people) if (!people.has(id)) people.set(id, b.index.hue);
console.log(`Building ${people.size} people…`);
const peopleIndex = [];
await pool([...people], 10, async ([id, hue]) => {
  const p = await buildPerson(id, hue);
  await writeFile(path.join(DATA_DIR, "people", `${id}.json`), JSON.stringify(p));
  peopleIndex.push([p.id, p.name, p.thumb ? p.thumb.slice(`${IMG}/w185`.length) : "", p.dept || ""]);
});
peopleIndex.sort((a, b) => a[1].localeCompare(b[1]));
await writeFile(path.join(DATA_DIR, "people-index.json"), JSON.stringify(peopleIndex));

const movies = built.map((b) => b.index).sort((a, b) => a.date.localeCompare(b.date) || a.tmdb - b.tmdb);
await writeFile(
  path.join(ROOT, "movies.js"),
  `// Generated by scripts/update-movies.mjs from TMDB — do not edit by hand.\n` +
  `window.MOVIE_DATA = ${JSON.stringify({ updated: new Date().toISOString(), region: REGION, regions: REGIONS, movies })};\n`
);
console.log(`\nWrote ${movies.length} movies and ${people.size} people (${calls} API calls, ${Math.round((Date.now() - started) / 1000)}s)`);
