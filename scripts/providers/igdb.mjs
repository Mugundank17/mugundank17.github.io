/*
 * IGDB (build-time only) — PlayStation, Xbox, Nintendo, cross-platform metadata and non-Steam releases.
 *
 * Auth: Twitch app access token (client-credentials) from https://id.twitch.tv/oauth2/token.
 *   - Credentials come from env TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET (GitHub Actions secrets).
 *   - The token is cached in memory until shortly before `expires_in`, renewed automatically,
 *     and retried once on 401. It is never written to disk or into the published site.
 * API: https://api.igdb.com/v4 — Apicalypse POST bodies; ~4 requests/second; max 500 per page.
 * Attribution: "Game data from IGDB.com" with a link, shown on every games page.
 */
import { getJSON, limitHost } from "../lib/http.mjs";

const API = "https://api.igdb.com/v4";
const IMG = "https://images.igdb.com/igdb/image/upload";
limitHost("api.igdb.com", 3.5);

let token = null; // { value, expiresAt }

export const igdbConfigured = () => !!(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET);

/** App access token, cached by expires_in and renewed automatically. */
export async function accessToken(force = false) {
  if (!force && token && Date.now() < token.expiresAt) return token.value;
  const id = process.env.TWITCH_CLIENT_ID, secret = process.env.TWITCH_CLIENT_SECRET;
  if (!id || !secret) throw new Error("IGDB: TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET not set");
  const url = `https://id.twitch.tv/oauth2/token?client_id=${encodeURIComponent(id)}&client_secret=${encodeURIComponent(secret)}&grant_type=client_credentials`;
  const { data } = await getJSON(url, { method: "POST", retries: 2 });
  if (!data?.access_token) throw new Error("IGDB: Twitch token request returned no access_token");
  token = { value: data.access_token, expiresAt: Date.now() + Math.max(60, (data.expires_in || 3600) - 120) * 1000 };
  return token.value;
}

/** Apicalypse query with automatic token renewal on 401. */
export async function igdb(endpoint, body, retried = false) {
  const bearer = await accessToken();
  try {
    const { data } = await getJSON(`${API}/${endpoint}`, {
      method: "POST",
      headers: { "Client-ID": process.env.TWITCH_CLIENT_ID, Authorization: `Bearer ${bearer}`, Accept: "application/json", "Content-Type": "text/plain" },
      body,
      retries: 3,
    });
    return data || [];
  } catch (err) {
    if (err.status === 401 && !retried) { await accessToken(true); return igdb(endpoint, body, true); }
    throw err;
  }
}

// IGDB has been renaming fields (category → game_type, region → release_region, …).
// Ask with the current schema first and fall back to the older one if IGDB rejects it.
const BASE_FIELDS = `name,slug,summary,storyline,url,first_release_date,hypes,total_rating,
  cover.image_id,screenshots.image_id,artworks.image_id,videos.video_id,videos.name,
  genres.name,themes.name,game_modes.name,
  involved_companies.company.name,involved_companies.developer,involved_companies.publisher,
  platforms.name,platforms.abbreviation,platforms.platform_family,
  release_dates.date,release_dates.human,release_dates.platform.name,release_dates.platform.abbreviation,release_dates.platform.platform_family,
  dlcs.name,dlcs.first_release_date,dlcs.cover.image_id,expansions.name,expansions.first_release_date,expansions.cover.image_id,
  franchises.name,collections.name,parent_game.name,
  similar_games.name,similar_games.cover.image_id,similar_games.first_release_date,
  websites.url`;
const SCHEMAS = [
  { extra: `,release_dates.release_region.region,release_dates.status.name,release_dates.date_format.format,external_games.uid,external_games.external_game_source,game_type`, filter: "game_type = (0,2,4,8,9,10)" },
  { extra: `,release_dates.region,release_dates.status.name,release_dates.category,external_games.uid,external_games.category,category`, filter: "category = (0,2,4,8,9,10)" },
];
let schema = 0;

async function queryGames(where, sort, limit, offset) {
  for (; schema < SCHEMAS.length; schema++) {
    const s = SCHEMAS[schema];
    const body = `fields ${BASE_FIELDS}${s.extra}; where ${where} & ${s.filter}; sort ${sort}; limit ${limit}; offset ${offset};`;
    try { return await igdb("games", body.replace(/\s+/g, " ")); }
    catch (err) { if (err.status !== 400) throw err; console.warn(`  IGDB: schema ${schema} rejected (${err.message.slice(0, 120)}), trying older field names`); }
  }
  throw new Error("IGDB: no field schema accepted");
}

const OLD_REGIONS = { 1: "Europe", 2: "North America", 3: "Australia", 4: "New Zealand", 5: "Japan", 6: "China", 7: "Asia", 8: "Worldwide", 9: "Korea", 10: "Brazil" };
const OLD_FORMAT = { 0: "day", 1: "month", 2: "year", 3: "quarter", 4: "quarter", 5: "quarter", 6: "quarter", 7: null };
const FAMILY = { 1: "PlayStation", 2: "Xbox", 3: "Sega", 4: "Linux", 5: "Nintendo", 6: "PC" };
const img = (size, id) => (id ? `${IMG}/${size}/${id}.jpg` : null);

function precisionOf(rd) {
  const f = rd.date_format?.format; // new schema: "YYYYMMMMDD", "YYYYMMMM", "YYYY", "YYYYQ1"…, "TBD"
  if (f) return f === "YYYYMMMMDD" ? "day" : f === "YYYYMMMM" ? "month" : f === "YYYY" ? "year" : /Q/.test(f) ? "quarter" : null;
  return rd.category != null ? OLD_FORMAT[rd.category] ?? null : rd.date ? "day" : null;
}

/** Map an IGDB game to our shared game shape (release dates kept per platform + region). */
export function mapIGDB(g) {
  const ic = g.involved_companies || [];
  const steamUid = (g.external_games || []).find((e) => e.external_game_source === 1 || e.category === 1)?.uid;
  return {
    igdb: g.id,
    steam: steamUid ? +steamUid : null,
    name: g.name,
    slug: g.slug,
    summary: g.summary || "",
    storyline: g.storyline || "",
    cover: img("t_cover_big", g.cover?.image_id),
    coverLarge: img("t_720p", g.cover?.image_id),
    screenshots: (g.screenshots || []).slice(0, 10).map((s) => ({ thumb: img("t_screenshot_med", s.image_id), full: img("t_1080p", s.image_id) })),
    artworks: (g.artworks || []).slice(0, 4).map((a) => img("t_1080p", a.image_id)),
    videos: (g.videos || []).slice(0, 4).map((v) => ({ key: v.video_id, name: v.name || "Trailer", type: "Trailer" })),
    genres: [...new Set([...(g.genres || []), ...(g.themes || [])].map((x) => x.name))].slice(0, 8),
    modes: (g.game_modes || []).map((x) => x.name),
    developers: ic.filter((c) => c.developer).map((c) => c.company?.name).filter(Boolean),
    publishers: ic.filter((c) => c.publisher).map((c) => c.company?.name).filter(Boolean),
    platforms: (g.platforms || []).map((p) => ({ name: p.name, short: p.abbreviation || p.name, family: FAMILY[p.platform_family] || null })),
    releaseDates: (g.release_dates || []).map((rd) => ({
      date: rd.date ? new Date(rd.date * 1000).toISOString().slice(0, 10) : null,
      precision: rd.date ? precisionOf(rd) : null,
      label: rd.human || null,
      platform: rd.platform?.abbreviation || rd.platform?.name || null,
      family: FAMILY[rd.platform?.platform_family] || null,
      region: rd.release_region?.region || OLD_REGIONS[rd.region] || null, // never assumed worldwide
      status: rd.status?.name || null,                                     // e.g. "Full Release", "Early Access", "Alpha"
      source: "igdb",
    })),
    dlcs: [...(g.dlcs || []).map((x) => ({ ...x, kind: "DLC" })), ...(g.expansions || []).map((x) => ({ ...x, kind: "Expansion" }))]
      .map((x) => ({ igdb: x.id, name: x.name, kind: x.kind, cover: img("t_cover_big", x.cover?.image_id), date: x.first_release_date ? new Date(x.first_release_date * 1000).toISOString().slice(0, 10) : null })),
    franchises: [...new Set([...(g.franchises || []), ...(g.collections || [])].map((x) => x.name))],
    parent: g.parent_game ? { igdb: g.parent_game.id, name: g.parent_game.name } : null,
    similar: (g.similar_games || []).slice(0, 10).map((x) => ({ igdb: x.id, name: x.name, cover: img("t_cover_big", x.cover?.image_id) })),
    hypes: g.hypes || 0,
    url: g.url || `https://www.igdb.com/games/${g.slug}`,
  };
}

/** Upcoming games, most hyped first; paginated with offset (500 max per page). */
export async function upcomingGames({ pages = 2, perPage = 100 } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const out = [];
  for (let page = 0; page < pages; page++) {
    const list = await queryGames(`(first_release_date > ${now} | release_dates.date > ${now}) & hypes > 0`, "hypes desc", perPage, page * perPage);
    out.push(...list.map(mapIGDB));
    if (list.length < perPage) break;
  }
  return out;
}

/** Look up IGDB games for known Steam app ids (to merge Steam + IGDB records). */
export async function gamesBySteamIds(appids) {
  const out = [];
  for (let i = 0; i < appids.length; i += 100) {
    const uids = appids.slice(i, i + 100).map((id) => `"${id}"`).join(",");
    const filt = schema === 0 ? `external_games.external_game_source = 1` : `external_games.category = 1`;
    const list = await queryGames(`external_games.uid = (${uids}) & ${filt}`, "hypes desc", 100, 0).catch(() => []);
    out.push(...list.map(mapIGDB));
  }
  return out;
}
