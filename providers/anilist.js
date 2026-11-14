/*
 * AniList provider adapter — public anime data, no API key or OAuth needed.
 * Endpoint: https://graphql.anilist.co (GraphQL over POST).
 *
 * Everything AniList-specific stays in this file: queries, rate limiting, caching and
 * mapping AniList "Media" records into the unified Release interface (providers/release.js).
 *
 * API (all methods return Promises):
 *   upcoming({ page, perPage, sort })                -> Paged<Release>
 *   seasonal({ season, year, page, perPage, sort })  -> Paged<Release>
 *   schedule({ from, to, page, perPage })            -> Paged<{ release, episode, airingAt }>
 *   search({ query, page, perPage })                 -> Paged<Release>
 *   detail(id)                                       -> Release (with extra.relations / extra.recommendations)
 *   currentSeason(date?) / shiftSeason(season, n)    -> { name, year }
 *
 * Paged<T> = { items: T[], page: { current, hasNext, total, perPage } }
 */
(function () {
  "use strict";
  const { makeRelease, createCache, hash } = window.Countdown.Release;
  const ENDPOINT = "https://graphql.anilist.co";
  const SOURCE = "anilist";
  const cache = createCache(SOURCE, 90);

  // Cache lifetimes: schedules change often, catalogue data rarely.
  const TTL = { schedule: 10 * 60e3, list: 3 * 3600e3, search: 30 * 60e3, detail: 3600e3 };

  // ---------------------------------------------------------------- transport
  // AniList allows ~30 requests/minute right now (90 normally). Space requests out,
  // reuse identical in-flight requests and honour Retry-After on 429.
  const recent = [];
  const inflight = new Map();
  const LIMIT_PER_MIN = 25;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function throttle() {
    for (;;) {
      const now = Date.now();
      while (recent.length && now - recent[0] > 60e3) recent.shift();
      if (recent.length < LIMIT_PER_MIN) { recent.push(now); return; }
      await sleep(60e3 - (now - recent[0]) + 50);
    }
  }

  async function post(query, variables, attempt = 0) {
    await throttle();
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query, variables }),
    });
    if (res.status === 429 && attempt < 2) {
      const wait = (+res.headers.get("Retry-After") || 30) * 1000;
      await sleep(Math.min(wait, 65e3));
      return post(query, variables, attempt + 1);
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.errors) {
      const msg = json.errors?.map((e) => e.message).join("; ") || `HTTP ${res.status}`;
      throw new Error(`AniList: ${msg}`);
    }
    return json.data;
  }

  /** Cached GraphQL request; falls back to stale data when offline / rate-limited. */
  async function request(query, variables, ttl) {
    const key = hash(query + JSON.stringify(variables));
    const fresh = cache.get(key);
    if (fresh !== undefined) return fresh;
    if (inflight.has(key)) return inflight.get(key);
    const p = post(query, variables)
      .then((data) => { cache.set(key, data, ttl); return data; })
      .catch((err) => { const old = cache.stale(key); if (old !== undefined) return old; throw err; })
      .finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  }

  // ---------------------------------------------------------------- queries
  const CARD = `
    id format status episodes duration countryOfOrigin isAdult popularity averageScore
    title { romaji english native }
    coverImage { large extraLarge color }
    bannerImage
    startDate { year month day }
    season seasonYear
    genres
    studios(isMain: true) { nodes { id name } }
    nextAiringEpisode { episode airingAt }`;

  const FULL = `${CARD}
    synonyms description(asHtml: false) source hashtag siteUrl
    tags { name rank isMediaSpoiler }
    trailer { id site }
    externalLinks { site url type color icon language }
    relations { edges { relationType(version: 2) node { ${CARD} } } }
    recommendations(sort: RATING_DESC, perPage: 12) { nodes { mediaRecommendation { ${CARD} } } }`;

  const PAGE_INFO = "pageInfo { currentPage hasNextPage total perPage }";

  const Q_MEDIA_PAGE = `
    query ($page: Int, $perPage: Int, $sort: [MediaSort], $status: MediaStatus, $season: MediaSeason,
           $seasonYear: Int, $search: String) {
      Page(page: $page, perPage: $perPage) {
        ${PAGE_INFO}
        media(type: ANIME, isAdult: false, sort: $sort, status: $status, season: $season,
              seasonYear: $seasonYear, search: $search) { ${CARD} }
      }
    }`;

  const Q_SCHEDULE = `
    query ($page: Int, $perPage: Int, $from: Int, $to: Int) {
      Page(page: $page, perPage: $perPage) {
        ${PAGE_INFO}
        airingSchedules(airingAt_greater: $from, airingAt_lesser: $to, sort: TIME) {
          episode airingAt media { ${CARD} }
        }
      }
    }`;

  const Q_DETAIL = `query ($id: Int) { Media(id: $id, type: ANIME) { ${FULL} } }`;

  // ---------------------------------------------------------------- mapping
  const STATUS = {
    NOT_YET_RELEASED: "upcoming", RELEASING: "releasing", FINISHED: "finished",
    CANCELLED: "cancelled", HIATUS: "hiatus",
  };
  const FORMAT = {
    TV: "TV", TV_SHORT: "TV Short", MOVIE: "Movie", SPECIAL: "Special", OVA: "OVA", ONA: "ONA", MUSIC: "Music",
  };

  function plainText(html) {
    if (!html) return "";
    const withBreaks = String(html).replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n");
    try {
      const doc = new DOMParser().parseFromString(withBreaks, "text/html");
      return (doc.body.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
    } catch (_) {
      return withBreaks.replace(/<[^>]+>/g, "").trim();
    }
  }

  function startDate(d) {
    if (!d?.year) return { releaseDate: null, datePrecision: null };
    const pad = (n) => String(n).padStart(2, "0");
    return {
      releaseDate: `${d.year}-${pad(d.month || 1)}-${pad(d.day || 1)}`,
      datePrecision: d.day ? "day" : d.month ? "month" : "year",
    };
  }

  /** Map an AniList Media record to a Release. */
  function toRelease(m) {
    if (!m) return null;
    const t = m.title || {};
    const title = t.english || t.romaji || t.native || "Untitled";
    const { releaseDate, datePrecision } = startDate(m.startDate);
    const next = m.nextAiringEpisode
      ? { number: m.nextAiringEpisode.episode, airingAt: m.nextAiringEpisode.airingAt * 1000 } : null;
    let countdownTo = next ? next.airingAt : null;
    if (!countdownTo && datePrecision === "day") {
      const [y, mo, d] = releaseDate.split("-").map(Number);
      const start = new Date(y, mo - 1, d).getTime();
      if (start > Date.now()) countdownTo = start;
    }
    const trailer = m.trailer?.site === "youtube" && m.trailer.id ? { key: m.trailer.id, name: "Trailer", type: "Trailer" } : null;
    const r = makeRelease({
      source: SOURCE,
      sourceId: m.id,
      type: "anime",
      format: FORMAT[m.format] || m.format || "",
      title,
      originalTitle: t.native && t.native !== title ? t.native : "",
      altTitles: [t.romaji, t.english, ...(m.synonyms || [])].filter((x) => x && x !== title),
      description: plainText(m.description),
      poster: m.coverImage?.large || null,
      posterLarge: m.coverImage?.extraLarge || m.coverImage?.large || null,
      banner: m.bannerImage || null,
      color: m.coverImage?.color || null,
      genres: m.genres || [],
      tags: (m.tags || []).filter((x) => !x.isMediaSpoiler && x.rank >= 60).slice(0, 8).map((x) => x.name),
      studios: (m.studios?.nodes || []).map((s) => ({ id: s.id, name: s.name })),
      status: STATUS[m.status] || "unknown",
      releaseDate,
      datePrecision,
      season: m.season && m.seasonYear ? { name: m.season, year: m.seasonYear } : null,
      episodes: m.episodes || null,
      duration: m.duration || null,
      nextEpisode: next,
      countdownTo,
      popularity: m.popularity ?? null,
      score: m.averageScore ?? null,
      trailer,
      watch: (m.externalLinks || []).filter((l) => l.type === "STREAMING" && l.url)
        .map((l) => ({ name: l.site, url: l.url, color: l.color || null, icon: l.icon || null, language: l.language || null })),
      country: m.countryOfOrigin || null,
      sourceUrl: m.siteUrl || `https://anilist.co/anime/${m.id}`,
    });
    if (m.relations || m.recommendations) {
      r.extra = {
        relations: (m.relations?.edges || []).filter((e) => e.node && !e.node.isAdult && e.node.format !== "MUSIC")
          .map((e) => ({ relation: e.relationType, release: toRelease(e.node) })),
        recommendations: (m.recommendations?.nodes || []).map((n) => n.mediaRecommendation)
          .filter((x) => x && !x.isAdult).map(toRelease),
        source: m.source || null,
        hashtag: m.hashtag || null,
      };
    }
    return r;
  }

  const paged = (page, items) => ({
    items,
    page: { current: page.currentPage, hasNext: page.hasNextPage, total: page.total, perPage: page.perPage },
  });

  // ---------------------------------------------------------------- seasons
  const SEASONS = ["WINTER", "SPRING", "SUMMER", "FALL"];
  function currentSeason(date = new Date()) {
    return { name: SEASONS[Math.floor(date.getMonth() / 3)], year: date.getFullYear() };
  }
  function shiftSeason({ name, year }, n) {
    const i = SEASONS.indexOf(name) + n;
    return { name: SEASONS[((i % 4) + 4) % 4], year: year + Math.floor(i / 4) };
  }

  // ---------------------------------------------------------------- public API
  async function mediaPage(vars, ttl) {
    const data = await request(Q_MEDIA_PAGE, vars, ttl);
    return paged(data.Page.pageInfo, data.Page.media.filter((m) => !m.isAdult).map(toRelease));
  }

  const api = {
    name: SOURCE,
    label: "AniList",
    homepage: "https://anilist.co",

    upcoming({ page = 1, perPage = 30, sort = "POPULARITY_DESC" } = {}) {
      return mediaPage({ page, perPage, sort: [sort], status: "NOT_YET_RELEASED" }, TTL.list);
    },

    seasonal({ season, year, page = 1, perPage = 30, sort = "POPULARITY_DESC" } = {}) {
      const s = season && year ? { name: season, year } : currentSeason();
      return mediaPage({ page, perPage, sort: [sort], season: s.name, seasonYear: s.year }, TTL.list);
    },

    async schedule({ from = Date.now(), to = Date.now() + 7 * 864e5, page = 1, perPage = 50 } = {}) {
      // Round to the minute so repeated calls share a cache entry.
      const f = Math.floor(from / 60e3) * 60, t = Math.floor(to / 60e3) * 60;
      const data = await request(Q_SCHEDULE, { page, perPage, from: f, to: t }, TTL.schedule);
      const items = data.Page.airingSchedules
        .filter((s) => s.media && !s.media.isAdult)
        .map((s) => ({ release: toRelease(s.media), episode: s.episode, airingAt: s.airingAt * 1000 }));
      return paged(data.Page.pageInfo, items);
    },

    search({ query, page = 1, perPage = 20 } = {}) {
      const q = String(query || "").trim();
      if (!q) return Promise.resolve(paged({ currentPage: 1, hasNextPage: false, total: 0, perPage }, []));
      return mediaPage({ page, perPage, search: q, sort: ["SEARCH_MATCH"] }, TTL.search);
    },

    async detail(id) {
      const data = await request(Q_DETAIL, { id: +id }, TTL.detail);
      return toRelease(data.Media);
    },

    currentSeason,
    shiftSeason,
    seasons: SEASONS,
  };

  window.Countdown.providers.anilist = api;
})();
