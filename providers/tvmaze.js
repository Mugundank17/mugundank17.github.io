/*
 * TVmaze provider adapter (browser) — public API, no key: https://api.tvmaze.com
 *
 * TVmaze data is licensed CC BY-SA 4.0: every page using it shows a visible
 * "TV schedules from TVmaze" attribution linking to https://www.tvmaze.com.
 *
 * Countdown uses TMDB for show discovery, posters and metadata (built daily into data/tv/),
 * and this adapter for episode schedules and airing information, live:
 *   show(id)                        -> Release (+ extra.cast, extra.nextEpisode)
 *   episodes(id)                    -> Episode[]   (all seasons, deduplicated)
 *   seasons(id)                     -> Season[]
 *   schedule({ date, country, kind }) -> { release, episode }[]  kind: "web" (streaming) | "tv"
 *   search(query)                   -> Release[]
 *   lookup({ tvdb, imdb })          -> TVmaze show id | null
 *
 * Rate limit: 20 calls / 10 s per IP — requests are spaced, de-duplicated, cached (TTL in
 * memory + localStorage) and retried on HTTP 429 with backoff.
 */
(function () {
  "use strict";
  const { makeRelease, createCache, hash } = window.Countdown.Release;
  const BASE = "https://api.tvmaze.com";
  const SOURCE = "tvmaze";
  const cache = createCache(SOURCE, 120);
  const TTL = { schedule: 30 * 60e3, show: 3600e3, episodes: 6 * 3600e3, search: 30 * 60e3, lookup: 7 * 864e5 };
  const ATTRIBUTION = { text: "TV schedules from TVmaze", url: "https://www.tvmaze.com", license: "CC BY-SA 4.0" };

  // ------------------------------------------------------------ transport
  const recent = [];
  const inflight = new Map();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function throttle() {
    for (;;) {
      const now = Date.now();
      while (recent.length && now - recent[0] > 10e3) recent.shift();
      if (recent.length < 18) { recent.push(now); return; }
      await sleep(10e3 - (now - recent[0]) + 30);
    }
  }
  async function getRaw(path, attempt = 0) {
    await throttle();
    const res = await fetch(BASE + path, { headers: { Accept: "application/json" } });
    if (res.status === 429 && attempt < 3) { await sleep(2000 * 2 ** attempt); return getRaw(path, attempt + 1); }
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`TVmaze HTTP ${res.status}`);
    return res.json();
  }
  /** Cached GET; serves stale data if the network fails. */
  function get(path, ttl) {
    const key = hash(path);
    const fresh = cache.get(key);
    if (fresh !== undefined) return Promise.resolve(fresh);
    if (inflight.has(key)) return inflight.get(key);
    const p = getRaw(path)
      .then((data) => { cache.set(key, data, ttl); return data; })
      .catch((err) => { const old = cache.stale(key); if (old !== undefined) return old; throw err; })
      .finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  }

  // ------------------------------------------------------------ mapping
  const strip = (html) => {
    if (!html) return "";
    try { return (new DOMParser().parseFromString(String(html).replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n"), "text/html").body.textContent || "").trim(); }
    catch (_) { return String(html).replace(/<[^>]+>/g, "").trim(); }
  };
  const STATUS = { Running: "releasing", Ended: "finished", "To Be Determined": "unknown", "In Development": "upcoming" };

  /** Episode → plain object; airstamp is null when TVmaze has no exact time (never invented). */
  function mapEpisode(e) {
    if (!e) return null;
    const exact = e.airstamp ? Date.parse(e.airstamp) : null;
    return {
      id: e.id,
      season: e.season ?? null,
      number: e.number ?? null,
      name: e.name || "",
      type: e.type || "regular",           // regular | significant_special | insignificant_special
      airstamp: Number.isFinite(exact) ? exact : null,
      airdate: e.airdate || null,          // network-local date, may be "" when unannounced
      timePrecision: Number.isFinite(exact) && e.airtime ? "minute" : e.airdate ? "day" : null,
      runtime: e.runtime || null,
      image: e.image?.medium || null,
      imageLarge: e.image?.original || null,
      summary: strip(e.summary),
      url: e.url || null,
    };
  }

  /** TVmaze show → unified Release. */
  function toRelease(s) {
    if (!s) return null;
    const ch = s.network || s.webChannel;
    const next = mapEpisode(s._embedded?.nextepisode);
    const t = next?.airstamp ?? null;
    const r = makeRelease({
      source: SOURCE,
      sourceId: s.id,
      type: "series",
      format: s.type || "Series",
      title: s.name,
      description: strip(s.summary),
      poster: s.image?.medium || null,
      posterLarge: s.image?.original || s.image?.medium || null,
      genres: s.genres || [],
      studios: ch ? [{ id: ch.id, name: ch.name }] : [],
      status: STATUS[s.status] || "unknown",
      releaseDate: s.premiered || null,
      datePrecision: s.premiered ? "day" : null,
      episodes: null,
      duration: s.runtime || s.averageRuntime || null,
      nextEpisode: next && t ? { number: next.number, season: next.season, airingAt: t, name: next.name } : null,
      countdownTo: t && t > Date.now() ? t : null,
      score: s.rating?.average ? Math.round(s.rating.average * 10) : null,
      country: ch?.country?.code || null,
      sourceUrl: s.url || `https://www.tvmaze.com/shows/${s.id}`,
    });
    r.extra = {
      network: ch?.name || null,
      streaming: !!s.webChannel,
      timezone: ch?.country?.timezone || null,
      schedule: s.schedule || null,
      officialSite: s.officialSite || null,
      language: s.language || null,
      ids: { tvmaze: s.id, tvdb: s.externals?.thetvdb || null, imdb: s.externals?.imdb || null },
      nextEpisode: next,
      cast: (s._embedded?.cast || []).slice(0, 16).map((c) => ({
        actor: c.person?.name, role: c.character?.name || "", photo: c.character?.image?.medium || c.person?.image?.medium || null,
      })),
    };
    return r;
  }

  // Duplicate episodes (same show + season + number, or same id) are merged.
  function dedupe(list, keyOf) {
    const seen = new Set();
    return list.filter((x) => { const k = keyOf(x); if (seen.has(k)) return false; seen.add(k); return true; });
  }

  // ------------------------------------------------------------ public API
  const api = {
    name: SOURCE,
    attribution: ATTRIBUTION,
    countries: [["IN", "India"], ["US", "USA"], ["GB", "UK"]],

    async show(id) {
      return toRelease(await get(`/shows/${+id}?embed[]=nextepisode&embed[]=cast`, TTL.show));
    },

    async episodes(id) {
      const list = (await get(`/shows/${+id}/episodes?specials=1`, TTL.episodes)) || [];
      return dedupe(list.map(mapEpisode), (e) => e.id);
    },

    async seasons(id) {
      const list = (await get(`/shows/${+id}/seasons`, TTL.episodes)) || [];
      return list.map((s) => ({
        id: s.id, number: s.number, name: s.name || "", episodes: s.episodeOrder || null,
        premiere: s.premiereDate || null, end: s.endDate || null,
        network: (s.network || s.webChannel)?.name || null, image: s.image?.medium || null,
      }));
    },

    /**
     * Daily schedule. kind "web" = streaming services (/schedule/web), "tv" = broadcast (/schedule).
     * country: "IN" | "US" | "GB" | "" (global, web only).
     */
    async schedule({ date, country = "", kind = "web" } = {}) {
      const d = date || new Date().toISOString().slice(0, 10);
      const q = `?date=${d}${country ? `&country=${country}` : ""}`;
      const list = (await get(kind === "tv" ? `/schedule${q}` : `/schedule/web${q}`, TTL.schedule)) || [];
      const items = list.map((e) => {
        const show = e.show || e._embedded?.show;
        return show ? { release: toRelease(show), episode: mapEpisode(e) } : null;
      }).filter(Boolean);
      return dedupe(items, (x) => `${x.release.sourceId}:${x.episode.season}:${x.episode.number}:${x.episode.airdate}`)
        .sort((a, b) => (a.episode.airstamp ?? Infinity) - (b.episode.airstamp ?? Infinity));
    },

    async search(query) {
      const q = String(query || "").trim();
      if (q.length < 2) return [];
      const list = (await get(`/search/shows?q=${encodeURIComponent(q)}`, TTL.search)) || [];
      return list.map((x) => toRelease(x.show)).filter(Boolean);
    },

    async lookup({ tvdb, imdb }) {
      for (const [k, v] of [["thetvdb", tvdb], ["imdb", imdb]]) {
        if (!v) continue;
        const s = await get(`/lookup/shows?${k}=${encodeURIComponent(v)}`, TTL.lookup).catch(() => null);
        if (s?.id) return s.id;
      }
      return null;
    },
  };

  window.Countdown.providers.tvmaze = api;
})();
