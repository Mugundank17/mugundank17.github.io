/*
 * Games section (build-time): merges the Steam and IGDB providers.
 *   Steam – primary for PC games (store details, PC release date, prices per storefront, DLC).
 *   IGDB  – PlayStation / Xbox / Nintendo, cross-platform metadata, regional & platform release dates,
 *           franchises and related titles, non-Steam releases.
 *   SteamDB is NOT used (no scraping, no unofficial APIs).
 *
 * Matching: Steam app id stored on the IGDB record (external_games, source "Steam") — verified.
 * Without an external id, records merge only on an exact normalised title AND the same release
 * year AND IGDB listing PC — otherwise they stay separate.
 * One game = one record; every platform / region date is kept in `releaseDates`.
 */
import { pool } from "../lib/http.mjs";
import { discoverUpcoming, fetchGame } from "./steam.mjs";
import { igdbConfigured, upcomingGames, gamesBySteamIds } from "./igdb.mjs";

const normTitle = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[™®©]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const yearOf = (d) => (d ? d.slice(0, 4) : null);
const today = () => new Date().toISOString().slice(0, 10);

/** Pick the countdown target: earliest upcoming exact (day) date; otherwise the best estimate. */
function primaryRelease(dates) {
  const t = today();
  const up = dates.filter((d) => d.date && d.date >= t);
  const exact = up.filter((d) => d.precision === "day").sort((a, b) => a.date.localeCompare(b.date));
  if (exact.length) return { ...exact[0], confirmed: true };
  const est = up.sort((a, b) => a.date.localeCompare(b.date))[0];
  if (est) return { ...est, confirmed: false };
  const tba = dates.find((d) => !d.date);
  return tba ? { ...tba, confirmed: false } : null;
}

function fromSteam(s) {
  const dates = [{
    date: s.release.date, precision: s.release.precision, label: s.release.label,
    platform: "PC", family: "PC", region: "Steam (all storefronts)", status: s.release.comingSoon ? "Coming soon" : "Released", source: "steam",
  }];
  return {
    id: `steam-${s.steam}`, steam: s.steam, igdb: null, type: s.type === "dlc" ? "dlc" : "game",
    title: s.name, summary: s.short, about: s.about,
    cover: s.capsule, coverFallback: s.header, banner: s.hero, header: s.header, background: s.background,
    screenshots: s.screenshots, videos: s.videos, trailers: [],
    genres: s.genres, categories: s.categories,
    developers: s.developers, publishers: s.publishers,
    platforms: ["PC"], pcOS: s.platforms,
    releaseDates: dates, stores: s.stores,
    dlc: s.dlc.map((d) => ({ name: d.name, kind: "DLC", steam: d.steam, url: d.url, date: d.release.date, precision: d.release.precision, label: d.release.label })),
    dlcCount: s.dlcCount, parent: s.parent, franchises: [], similar: [],
    links: { steam: s.url, website: s.website }, sources: ["steam"], hypes: 0,
  };
}

function mergeIGDB(game, g) {
  const fam = (p) => p.family || (/(PC|Windows)/i.test(p.name) ? "PC" : null);
  game.igdb = g.igdb;
  game.sources = [...new Set([...game.sources, "igdb"])];
  game.title ||= g.name;
  game.summary ||= g.summary;
  game.storyline = g.storyline;
  if (g.cover) { game.coverFallback = game.cover || game.coverFallback; game.cover = g.cover; } // IGDB covers are reliable portrait art
  if (!game.screenshots?.length) game.screenshots = g.screenshots;
  game.artworks = g.artworks;
  game.trailers = g.videos;
  game.genres = [...new Set([...(game.genres || []), ...g.genres])].slice(0, 10);
  game.developers = game.developers?.length ? game.developers : g.developers;
  game.publishers = game.publishers?.length ? game.publishers : g.publishers;
  game.platforms = [...new Set([...(game.platforms || []), ...g.platforms.map((p) => p.short)])];
  game.families = [...new Set([...(game.families || []), ...g.platforms.map(fam).filter(Boolean)])];
  // Keep every platform/region date; drop IGDB's PC dates only when Steam already gives the PC date.
  const hasSteamPC = game.releaseDates.some((d) => d.source === "steam" && d.date);
  game.releaseDates.push(...g.releaseDates.filter((d) => !(hasSteamPC && d.family === "PC")));
  const seen = new Set(game.dlc.map((d) => normTitle(d.name)));
  for (const d of g.dlcs) if (!seen.has(normTitle(d.name))) game.dlc.push({ ...d, url: null });
  game.franchises = g.franchises;
  game.similar = g.similar;
  game.parent ||= g.parent;
  game.hypes = g.hypes;
  game.links.igdb = g.url;
  return game;
}

function fromIGDB(g) {
  return mergeIGDB({
    id: `igdb-${g.igdb}`, steam: null, igdb: null, type: g.parent ? "dlc" : "game",
    title: g.name, summary: g.summary, about: "", cover: null, coverFallback: null,
    banner: g.artworks[0] || g.screenshots[0]?.full || null, header: null, background: null,
    screenshots: [], videos: [], trailers: [], genres: [], categories: [],
    developers: [], publishers: [], platforms: [], releaseDates: [], stores: {},
    dlc: [], dlcCount: 0, parent: null, franchises: [], similar: [], links: {}, sources: [],
  }, g);
}

export async function buildGames({ countries = ["US", "IN", "GB"], maxSteam = 45, log = console.log } = {}) {
  // 1. Steam: upcoming PC games (Coming Soon lists)
  const steamIds = (await discoverUpcoming(countries[0])).slice(0, maxSteam);
  log(`  Steam: ${steamIds.length} upcoming apps discovered`);

  // 2. IGDB (optional — needs Twitch credentials): most hyped upcoming, all platforms
  let igdbGames = [];
  let igdbOK = false;
  if (igdbConfigured()) {
    try {
      igdbGames = await upcomingGames({ pages: 2, perPage: 100 });
      igdbOK = true;
      log(`  IGDB: ${igdbGames.length} upcoming games`);
      const fromIgdbSteam = igdbGames.map((g) => g.steam).filter(Boolean);
      for (const id of fromIgdbSteam.slice(0, 25)) if (!steamIds.includes(id)) steamIds.push(id);
    } catch (err) {
      log(`! IGDB failed (${err.message.slice(0, 160)}) — continuing with Steam only`);
    }
  } else {
    log("  IGDB: skipped (add TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET secrets to enable consoles)");
  }

  const steamRank = new Map(steamIds.map((id, i) => [id, i + 1])); // Coming Soon "Top Sellers" (most wishlisted) first
  const steam = (await pool(steamIds, 1, (id) => fetchGame(id, { countries }))).filter(Boolean);
  log(`  Steam: ${steam.length} games/DLC fetched`);

  // 3. Merge: by Steam id (verified external id) first
  const games = new Map(steam.map((s) => [s.steam, fromSteam(s)]));
  if (igdbOK) {
    const missing = steam.map((s) => s.steam).filter((id) => !igdbGames.some((g) => g.steam === id));
    if (missing.length) igdbGames.push(...(await gamesBySteamIds(missing).catch(() => [])));
  }
  const unmatched = [];
  for (const g of igdbGames) {
    if (g.steam && games.has(g.steam)) { mergeIGDB(games.get(g.steam), g); continue; }
    // Fallback: exact title + same year + IGDB lists PC
    const pcOnIgdb = g.platforms.some((p) => p.family === "PC" || /PC|Windows/i.test(p.name));
    const gYear = yearOf(g.releaseDates.find((d) => d.date)?.date);
    const match = pcOnIgdb && [...games.values()].find((x) => !x.igdb && normTitle(x.title) === normTitle(g.name) &&
      (!gYear || !x.releaseDates[0]?.date || yearOf(x.releaseDates[0].date) === gYear));
    if (match) mergeIGDB(match, g); else unmatched.push(g);
  }
  const all = [...games.values(), ...unmatched.filter((g) => !games.has(g.steam)).map(fromIGDB)];

  // 4. Finish: primary countdown date, platform families, de-duplicated dates
  for (const g of all) {
    const key = (d) => `${d.platform}|${d.region}|${d.date}|${d.status}`;
    const seen = new Set();
    g.releaseDates = g.releaseDates.filter((d) => (seen.has(key(d)) ? false : seen.add(key(d))))
      .sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"));
    g.families = [...new Set([...(g.families || []), ...(g.platforms.includes("PC") ? ["PC"] : [])])];
    g.primary = primaryRelease(g.releaseDates);
  }
  const index = all
    .filter((g) => !g.primary?.date || g.primary.date >= today() || g.releaseDates.some((d) => d.date && d.date >= today()) ||
      (g.primary?.date && Date.now() - Date.parse(g.primary.date) < 30 * 864e5))
    .map((g) => ({
      id: g.id, steam: g.steam, igdb: g.igdb, type: g.type, title: g.title,
      cover: g.cover, coverFallback: g.coverFallback, header: g.header,
      genres: g.genres.slice(0, 4), developers: g.developers.slice(0, 2), publishers: g.publishers.slice(0, 2),
      platforms: g.platforms, families: g.families, primary: g.primary,
      dateCount: g.releaseDates.length, sources: g.sources, hypes: g.hypes,
      prices: Object.fromEntries(Object.entries(g.stores || {}).map(([cc, s]) => [cc, s.price])),
      parent: g.parent, blurb: (g.summary || "").slice(0, 220), rank: g.steam ? steamRank.get(g.steam) || 999 : 999,
    }));
  log(`  Games: ${index.length} in the index (${index.filter((g) => g.sources.length > 1).length} matched across Steam + IGDB)`);
  return { index, details: new Map(all.map((g) => [g.id, g])) };
}
