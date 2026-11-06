#!/usr/bin/env node
/*
 * Builds movies.js from TMDB (https://www.themoviedb.org).
 *
 * For every movie in watchlist.json — plus the most popular upcoming releases —
 * it fetches the release date, overview, director, cast photos, official posters
 * and backdrops, official YouTube trailers/teasers, and links (official site,
 * IMDb, Letterboxd). It also samples each backdrop to pick background colours.
 *
 * Auth (either one):
 *   TMDB_TOKEN    TMDB "API Read Access Token" (v4, sent as a Bearer header)
 *   TMDB_API_KEY  TMDB "API Key" (v3, sent as ?api_key=)
 *
 * Usage: node scripts/update-movies.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import jpeg from "jpeg-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const API = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p";
const TOKEN = process.env.TMDB_TOKEN;
const KEY = process.env.TMDB_API_KEY;

if (!TOKEN && !KEY) {
  console.error("Set TMDB_TOKEN or TMDB_API_KEY. Get one free at https://www.themoviedb.org/settings/api");
  process.exit(1);
}

const config = JSON.parse(await readFile(path.join(ROOT, "watchlist.json"), "utf8"));
const REGION = config.region || "US";
const LANG = config.language || "en-US";

// ---------- TMDB ----------
async function tmdb(route, params = {}) {
  const url = new URL(API + route);
  for (const [k, v] of Object.entries({ language: LANG, ...params })) url.searchParams.set(k, v);
  if (KEY && !TOKEN) url.searchParams.set("api_key", KEY);
  const headers = { accept: "application/json" };
  if (TOKEN) headers.authorization = `Bearer ${TOKEN}`;

  for (let attempt = 0; attempt < 4; attempt++) {
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

async function findId(entry) {
  if (entry.tmdb) return entry.tmdb;
  const params = { query: entry.title, include_adult: "false" };
  let { results } = await tmdb("/search/movie", entry.year ? { ...params, primary_release_year: entry.year } : params);
  if (!results.length && entry.year) ({ results } = await tmdb("/search/movie", params));
  if (!results.length) return null;
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const exact = results.find((r) => norm(r.title) === norm(entry.title));
  return (exact || results[0]).id;
}

async function discoverUpcoming(count) {
  if (!count) return [];
  const today = new Date().toISOString().slice(0, 10);
  const ids = [];
  for (let page = 1; ids.length < count && page <= 3; page++) {
    const { results } = await tmdb("/discover/movie", {
      region: REGION,
      "release_date.gte": today,
      with_release_type: "2|3",
      sort_by: "popularity.desc",
      include_adult: "false",
      page,
    });
    for (const r of results) if (ids.length < count && r.poster_path && r.backdrop_path) ids.push(r.id);
  }
  return ids;
}

// ---------- picking fields ----------
function releaseDate(d) {
  const pick = (iso) => {
    const r = d.release_dates?.results?.find((x) => x.iso_3166_1 === iso);
    if (!r) return null;
    for (const type of [3, 2, 1, 4]) {
      const dates = r.release_dates.filter((x) => x.type === type).map((x) => x.release_date.slice(0, 10)).sort();
      if (dates.length) return dates[0];
    }
    return null;
  };
  return pick(REGION) || d.release_date || pick("US") || null;
}

function trailers(d) {
  const rank = { Trailer: 0, Teaser: 1 };
  return (d.videos?.results || [])
    .filter((v) => v.site === "YouTube" && v.type in rank)
    .sort((a, b) =>
      (b.official - a.official) ||
      (rank[a.type] - rank[b.type]) ||
      (new Date(b.published_at) - new Date(a.published_at)))
    .slice(0, 8)
    .map((v) => ({ key: v.key, name: v.name, type: v.type, published: v.published_at?.slice(0, 10) }));
}

function bestImage(list, fallback) {
  const en = (list || []).filter((i) => i.iso_639_1 === "en" || i.iso_639_1 === null);
  const top = en.sort((a, b) => b.vote_average - a.vote_average || b.width - a.width)[0];
  return top?.file_path || fallback || null;
}

const slugify = (s) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// ---------- colours from the backdrop ----------
async function palette(url) {
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
    // Smooth neighbouring bins so a colour isn't split in two.
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
    const h2 = second ? hueOf(second[1]) : (h1 + 30) % 360;
    return [h1, h2];
  } catch {
    return null;
  }
}

// ---------- build one movie ----------
async function build(id, pinned) {
  const d = await tmdb(`/movie/${id}`, {
    append_to_response: "videos,credits,release_dates,images,external_ids",
    include_video_language: "en,null",
    include_image_language: "en,null",
  });
  const date = releaseDate(d);
  if (!date) return null;

  const backdropPath = bestImage(d.images?.backdrops?.filter((b) => b.iso_639_1 === null), d.backdrop_path) || d.backdrop_path;
  const posterPath = bestImage(d.images?.posters, d.poster_path);
  const logoPath = bestImage(d.images?.logos?.filter((l) => !l.file_path.endsWith(".svg")), null);
  const directors = (d.credits?.crew || []).filter((c) => c.job === "Director").map((c) => c.name);

  return {
    id: `${slugify(d.title)}-${d.id}`,
    tmdb: d.id,
    pinned,
    title: d.title,
    date,
    director: directors.slice(0, 2).join(" & "),
    tagline: d.tagline || "",
    synopsis: d.overview || "",
    genres: (d.genres || []).map((g) => g.name),
    runtime: d.runtime || null,
    status: d.status,
    poster: posterPath ? `${IMG}/w500${posterPath}` : null,
    backdrop: backdropPath ? `${IMG}/w1280${backdropPath}` : null,
    card: backdropPath ? `${IMG}/w780${backdropPath}` : null,
    logo: logoPath ? `${IMG}/w500${logoPath}` : null,
    hue: (backdropPath && (await palette(`${IMG}/w300${backdropPath}`))) ||
         (posterPath && (await palette(`${IMG}/w185${posterPath}`))) || [20, 40],
    trailers: trailers(d),
    cast: (d.credits?.cast || []).slice(0, 12).map((c) => ({
      actor: c.name,
      role: c.character || "",
      photo: c.profile_path ? `${IMG}/w185${c.profile_path}` : null,
      tmdb: c.id,
    })),
    links: {
      official: d.homepage || null,
      imdb: d.external_ids?.imdb_id ? `https://www.imdb.com/title/${d.external_ids.imdb_id}/` : null,
      letterboxd: `https://letterboxd.com/tmdb/${d.id}/`,
      tmdb: `https://www.themoviedb.org/movie/${d.id}`,
    },
  };
}

// ---------- main ----------
const pinnedIds = [];
for (const entry of config.movies || []) {
  const id = await findId(entry);
  if (id) pinnedIds.push(id);
  else console.warn(`! Not found on TMDB: ${entry.title}`);
}
const autoIds = (await discoverUpcoming(config.autoUpcoming ?? 12)).filter((id) => !pinnedIds.includes(id));

const cutoff = Date.now() - (config.keepReleasedDays ?? 60) * 86400000;
const movies = [];
for (const [id, pinned] of [...pinnedIds.map((i) => [i, true]), ...autoIds.map((i) => [i, false])]) {
  try {
    const m = await build(id, pinned);
    if (!m) continue;
    if (!pinned && new Date(m.date).getTime() < cutoff) continue;
    movies.push(m);
    console.log(`✓ ${m.title} — ${m.date} — ${m.trailers.length} videos — hue ${m.hue.join("/")}`);
  } catch (err) {
    console.warn(`! ${id}: ${err.message}`);
  }
}
movies.sort((a, b) => a.date.localeCompare(b.date));

const out = {
  updated: new Date().toISOString(),
  region: REGION,
  source: "TMDB",
  movies,
};
await writeFile(
  path.join(ROOT, "movies.js"),
  `// Generated by scripts/update-movies.mjs from TMDB — do not edit by hand.\n` +
  `// Edit watchlist.json instead, then run: npm run update\n` +
  `window.MOVIE_DATA = ${JSON.stringify(out, null, 2)};\n`
);
console.log(`\nWrote ${movies.length} movies to movies.js`);
