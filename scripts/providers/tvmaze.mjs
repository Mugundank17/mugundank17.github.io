/*
 * TVmaze (build-time) — matches TMDB shows to TVmaze and reads their next episode.
 * Public API, no key: https://api.tvmaze.com  ·  Data licensed CC BY-SA 4.0 (attribution required).
 * Rate limit: 20 calls / 10 s per IP → we stay at ~1.8/s.
 * The browser-side adapter (providers/tvmaze.js) handles schedules, episodes and search live.
 */
import { getJSON, limitHost } from "../lib/http.mjs";

const BASE = "https://api.tvmaze.com";
limitHost("api.tvmaze.com", 1.8);

/** Find a TVmaze show by TVDB id, then IMDb id. Returns the show (with next episode) or null. */
export async function lookupShow({ tvdb, imdb }) {
  for (const [key, val] of [["thetvdb", tvdb], ["imdb", imdb]]) {
    if (!val) continue;
    const { status, data } = await getJSON(`${BASE}/lookup/shows?${key}=${encodeURIComponent(val)}`, { okStatuses: [404] });
    if (status === 404 || !data?.id) continue;
    const full = await getJSON(`${BASE}/shows/${data.id}?embed=nextepisode`, { okStatuses: [404] });
    return full.data || data;
  }
  return null;
}

/** Map a TVmaze episode to our episode shape; airstamp may be missing (date-only or TBA). */
export function mapEpisode(e) {
  if (!e) return null;
  return {
    season: e.season ?? null,
    number: e.number ?? null,
    name: e.name || "",
    airstamp: e.airstamp ? Date.parse(e.airstamp) : null, // exact UTC instant when known
    airdate: e.airdate || null,                           // local date at the network
    runtime: e.runtime || null,
    type: e.type || "regular",
  };
}

/** Compact TVmaze info stored with a TMDB show. */
export function tvmazeInfo(show) {
  if (!show) return null;
  const ch = show.network || show.webChannel;
  return {
    id: show.id,
    url: show.url,
    network: ch?.name || null,
    country: ch?.country?.code || null,
    timezone: ch?.country?.timezone || null,
    schedule: show.schedule || null,
    status: show.status || null,
    next: mapEpisode(show._embedded?.nextepisode),
  };
}
