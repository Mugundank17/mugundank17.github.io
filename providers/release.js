/*
 * Unified Release interface.
 *
 * Every data source (AniList today; TMDB series, games… later) maps its records into this
 * shape through its own provider adapter (providers/<name>.js). Pages render Releases and
 * never touch provider-specific fields, so adding a source means writing one adapter.
 *
 * @typedef {"movie"|"anime"|"series"|"game"} ReleaseType
 * @typedef {"upcoming"|"releasing"|"finished"|"cancelled"|"hiatus"|"unknown"} ReleaseStatus
 *
 * @typedef {Object} Episode
 * @property {number} number      Episode number.
 * @property {number} airingAt    Exact air time, epoch milliseconds.
 *
 * @typedef {Object} Release
 * @property {string}  id            Globally unique: "<source>:<sourceId>", e.g. "anilist:21".
 * @property {string}  source        Provider name, e.g. "anilist".
 * @property {number|string} sourceId  The record's id at the provider.
 * @property {ReleaseType} type
 * @property {string}  format        Provider format label, e.g. "TV", "Movie", "OVA".
 * @property {string}  title         Display title (English when available).
 * @property {string}  [originalTitle] Title in the original language, if different.
 * @property {string[]} altTitles    Other known titles (romaji, synonyms…).
 * @property {string}  description   Plain text, no HTML.
 * @property {string|null} poster    Poster image URL (portrait).
 * @property {string|null} posterLarge
 * @property {string|null} banner    Wide image URL.
 * @property {string|null} color     Accent colour "#rrggbb" from the artwork, if known.
 * @property {string[]} genres
 * @property {string[]} tags
 * @property {{id:number|string, name:string}[]} studios
 * @property {ReleaseStatus} status
 * @property {string|null} releaseDate  "YYYY-MM-DD" (day may be "01" when precision is lower).
 * @property {"day"|"month"|"year"|null} datePrecision
 * @property {{name:string, year:number}|null} season  e.g. { name: "FALL", year: 2026 }.
 * @property {number|null} episodes   Total episodes, if known.
 * @property {number|null} duration   Minutes per episode / runtime.
 * @property {Episode|null} nextEpisode Next scheduled episode, if airing.
 * @property {number|null} countdownTo Epoch ms the main countdown targets (next episode, else start date).
 * @property {number|null} popularity Provider popularity count.
 * @property {number|null} score      0–100.
 * @property {{key:string, name:string, type:string}|null} trailer  YouTube trailer.
 * @property {{name:string, url:string, color?:string, icon?:string}[]} watch  Official streaming links.
 * @property {string|null} country    Country of origin (ISO code).
 * @property {string} sourceUrl       The record's page at the provider (attribution).
 * @property {Object} [extra]         Detail-only data: { relations: Release[], recommendations: Release[] }.
 */
(function () {
  "use strict";
  const STATUS = ["upcoming", "releasing", "finished", "cancelled", "hiatus", "unknown"];

  /** Fill defaults so pages can rely on every field existing. */
  function makeRelease(r) {
    return {
      id: `${r.source}:${r.sourceId}`,
      type: "anime",
      format: "",
      title: "",
      originalTitle: "",
      altTitles: [],
      description: "",
      poster: null,
      posterLarge: null,
      banner: null,
      color: null,
      genres: [],
      tags: [],
      studios: [],
      status: "unknown",
      releaseDate: null,
      datePrecision: null,
      season: null,
      episodes: null,
      duration: null,
      nextEpisode: null,
      countdownTo: null,
      popularity: null,
      score: null,
      trailer: null,
      watch: [],
      country: null,
      sourceUrl: "",
      ...r,
      status: STATUS.includes(r.status) ? r.status : "unknown",
    };
  }

  /** Small TTL cache shared by adapters: memory first, then localStorage. */
  function createCache(namespace, maxEntries = 80) {
    const mem = new Map();
    const prefix = `cd:${namespace}:`;
    const read = (key) => {
      if (mem.has(key)) return mem.get(key);
      try {
        const raw = localStorage.getItem(prefix + key);
        if (raw) { const v = JSON.parse(raw); mem.set(key, v); return v; }
      } catch (_) { /* storage unavailable */ }
      return null;
    };
    const prune = () => {
      try {
        const keys = Object.keys(localStorage).filter((k) => k.startsWith(prefix));
        if (keys.length <= maxEntries) return;
        keys.map((k) => { try { return [k, JSON.parse(localStorage.getItem(k)).t || 0]; } catch (_) { return [k, 0]; } })
          .sort((a, b) => a[1] - b[1]).slice(0, keys.length - maxEntries)
          .forEach(([k]) => localStorage.removeItem(k));
      } catch (_) { /* ignore */ }
    };
    return {
      /** Fresh value, or undefined. */
      get(key) { const v = read(key); return v && Date.now() - v.t < v.ttl ? v.data : undefined; },
      /** Any value even if expired (offline fallback). */
      stale(key) { const v = read(key); return v ? v.data : undefined; },
      set(key, data, ttl) {
        const v = { t: Date.now(), ttl, data };
        mem.set(key, v);
        try { localStorage.setItem(prefix + key, JSON.stringify(v)); prune(); }
        catch (_) { prune(); /* quota: keep it in memory only */ }
      },
    };
  }

  /** Stable short hash for cache keys. */
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
  }

  window.Countdown = window.Countdown || {};
  window.Countdown.Release = { makeRelease, createCache, hash };
  window.Countdown.providers = window.Countdown.providers || {};
})();
