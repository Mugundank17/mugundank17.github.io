/*
 * TMDB TV (build-time) — show discovery, posters and metadata.
 * Episode schedules / exact airing times come from TVmaze (./tvmaze.mjs); the two are kept separate
 * and joined by TVDB / IMDb ids.
 */
import { getJSON, limitHost, pool, isoDay } from "../lib/http.mjs";
import { lookupShow, tvmazeInfo } from "./tvmaze.mjs";

const API = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p";
limitHost("api.themoviedb.org", 35);
const img = (size, p) => (p ? `${IMG}/${size}${p}` : null);

function tmdbFetcher() {
  const token = process.env.TMDB_TOKEN, key = process.env.TMDB_API_KEY;
  return async (route, params = {}) => {
    const url = new URL(API + route);
    for (const [k, v] of Object.entries({ language: "en-US", ...params })) url.searchParams.set(k, v);
    if (key && !token) url.searchParams.set("api_key", key);
    const headers = { accept: "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) };
    return (await getJSON(url, { headers })).data;
  };
}

async function discoverIds(tmdb, params, count) {
  const ids = [];
  for (let page = 1; ids.length < count && page <= 3; page++) {
    const { results = [], total_pages = 1 } = await tmdb("/discover/tv", { sort_by: "popularity.desc", include_adult: "false", page, ...params });
    for (const r of results) if (r.poster_path && !ids.includes(r.id)) ids.push(r.id);
    if (page >= total_pages) break;
  }
  return ids.slice(0, count);
}

const pick = (list, n) => (list || []).slice().sort((a, b) => b.vote_average - a.vote_average || b.width - a.width).slice(0, n);

/**
 * Build the TV catalogue.
 * @returns {{ index: object[], details: Map<number, object>, lists: object }}
 */
export async function buildTV({ regions = ["IN", "US", "GB"], perList = 20, log = console.log } = {}) {
  const tmdb = tmdbFetcher();
  const today = isoDay(0);
  const lists = { airing: {}, premieres: {}, streaming: {} };

  // Discovery per region + worldwide: airing in the next 2 weeks, new series premiering, on streaming.
  await pool([...regions, "WW"], 3, async (r) => {
    const origin = r === "WW" ? {} : { with_origin_country: r };
    lists.airing[r] = await discoverIds(tmdb, { ...origin, "air_date.gte": today, "air_date.lte": isoDay(14) }, perList);
    lists.premieres[r] = await discoverIds(tmdb, { ...origin, "first_air_date.gte": today, "first_air_date.lte": isoDay(240) }, perList);
    if (r !== "WW") {
      lists.streaming[r] = await discoverIds(tmdb, {
        watch_region: r, with_watch_monetization_types: "flatrate", "air_date.gte": today, "air_date.lte": isoDay(14),
      }, perList);
    }
  });
  const ids = [...new Set(Object.values(lists).flatMap((by) => Object.values(by).flat()))];
  log(`  TV: ${ids.length} shows discovered`);

  const details = new Map();
  const index = (await pool(ids, 6, async (id) => {
    const d = await tmdb(`/tv/${id}`, {
      append_to_response: "external_ids,aggregate_credits,videos,watch/providers,content_ratings,images",
      include_image_language: "en,null", include_video_language: "en,null",
    });
    const maze = tvmazeInfo(await lookupShow({ tvdb: d.external_ids?.tvdb_id, imdb: d.external_ids?.imdb_id }).catch(() => null));

    // Next episode: TVmaze has the exact air time; TMDB only a date. Prefer TVmaze, fall back to TMDB.
    const tn = d.next_episode_to_air;
    const next = maze?.next || (tn ? {
      season: tn.season_number, number: tn.episode_number, name: tn.name || "",
      airstamp: null, airdate: tn.air_date || null, runtime: tn.runtime || null, type: "regular",
    } : null);

    const logo = pick(d.images?.logos?.filter((l) => l.iso_639_1 === "en" && !l.file_path.endsWith(".svg")), 1)[0];
    const backdrop = pick(d.images?.backdrops?.filter((b) => b.iso_639_1 === null), 1)[0]?.file_path || d.backdrop_path;
    const watch = {};
    for (const [cc, w] of Object.entries(d["watch/providers"]?.results || {})) {
      if (![...regions].includes(cc)) continue;
      const names = [...new Set((w.flatrate || []).map((p) => p.provider_name.replace(/ (Standard )?with Ads$/, "")))];
      if (names.length) watch[cc] = names.slice(0, 5);
    }
    const ratings = Object.fromEntries((d.content_ratings?.results || []).filter((x) => regions.includes(x.iso_3166_1) && x.rating).map((x) => [x.iso_3166_1, x.rating]));
    const vids = (d.videos?.results || []).filter((v) => v.site === "YouTube" && ["Trailer", "Teaser"].includes(v.type))
      .sort((a, b) => (b.official - a.official) || new Date(b.published_at) - new Date(a.published_at)).slice(0, 6)
      .map((v) => ({ key: v.key, name: v.name, type: v.type, published: v.published_at?.slice(0, 10) }));

    const item = {
      id: `tmdb-tv:${d.id}`,
      tmdb: d.id,
      title: d.name,
      originalTitle: d.original_name !== d.name ? d.original_name : "",
      lang: d.original_language,
      origin: d.origin_country || [],
      poster: img("w342", d.poster_path),
      backdrop: img("w1280", backdrop),
      logo: img("w500", logo?.file_path),
      genres: (d.genres || []).map((g) => g.name),
      networks: (d.networks || []).slice(0, 3).map((n) => n.name),
      status: d.status,
      firstAir: d.first_air_date || null,
      seasons: d.number_of_seasons || null,
      episodes: d.number_of_episodes || null,
      next,
      blurb: (d.overview || "").length > 220 ? d.overview.slice(0, 217).replace(/\s+\S*$/, "") + "…" : d.overview || "",
      pop: Math.round((d.popularity || 0) * 10) / 10,
      watch,
      ratings,
      tvmaze: maze ? { id: maze.id, network: maze.network, timezone: maze.timezone } : null,
    };
    details.set(d.id, {
      ...item,
      overview: d.overview || "",
      tagline: d.tagline || "",
      createdBy: (d.created_by || []).map((c) => c.name),
      lastAir: d.last_air_date || null,
      seasonList: (d.seasons || []).map((s) => ({
        number: s.season_number, name: s.name, episodes: s.episode_count, airDate: s.air_date || null, poster: img("w342", s.poster_path),
      })),
      cast: (d.aggregate_credits?.cast || []).slice(0, 14).map((c) => ({
        actor: c.name, role: c.roles?.[0]?.character || "", episodes: c.total_episode_count || null, photo: img("w185", c.profile_path), tmdb: c.id,
      })),
      trailers: vids,
      tvmazeUrl: maze?.url || null,
      schedule: maze?.schedule || null,
    });
    return item;
  })).filter(Boolean);

  // Rank lists by order of discovery (TMDB popularity).
  const rank = {};
  for (const [kind, by] of Object.entries(lists)) {
    for (const [r, list] of Object.entries(by)) list.forEach((id, i) => { ((rank[id] ||= {})[kind] ||= {})[r] = i + 1; });
  }
  for (const it of index) it.rank = rank[it.tmdb] || {};
  log(`  TV: ${index.length} shows built, ${index.filter((x) => x.tvmaze).length} matched on TVmaze, ${index.filter((x) => x.next?.airstamp).length} with exact next-episode times`);
  return { index, details };
}
