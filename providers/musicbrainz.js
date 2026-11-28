/*
 * MusicBrainz provider adapter (browser) — https://musicbrainz.org/ws/2 (JSON, no key, CORS allowed).
 * Used live for artist pages, album pages not in the daily build, and search. The daily build
 * (scripts/providers/music.mjs) supplies the upcoming-release list from ListenBrainz.
 *
 * MusicBrainz asks for at most 1 request per second — requests are queued, de-duplicated and cached.
 * Core data is CC0; artwork comes from the Cover Art Archive. Attribution is shown on music pages.
 *
 *   artist(mbid)              -> { id, name, type, country, area, lifeSpan, genres, links, releaseGroups[] }
 *   releaseGroup(mbid)        -> Release (type "music") with extra.releases / extra.artistCredit / extra.links
 *   search({ query, kind })   -> kind "artist" | "release-group"
 */
(function () {
  "use strict";
  const { makeRelease, createCache, hash } = window.Countdown.Release;
  const MB = "https://musicbrainz.org/ws/2";
  const SOURCE = "musicbrainz";
  const cache = createCache(SOURCE, 80);
  const TTL = { entity: 6 * 3600e3, search: 30 * 60e3 };

  // 1 request / second queue
  let chain = Promise.resolve(), last = 0;
  const inflight = new Map();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  function queued(fn) {
    const p = chain.then(async () => { const w = last + 1100 - Date.now(); if (w > 0) await sleep(w); last = Date.now(); return fn(); });
    chain = p.catch(() => {});
    return p;
  }
  async function raw(path, attempt = 0) {
    const res = await queued(() => fetch(`${MB}${path}${path.includes("?") ? "&" : "?"}fmt=json`, { headers: { Accept: "application/json" } }));
    if ((res.status === 503 || res.status === 429) && attempt < 3) { await sleep(1500 * 2 ** attempt); return raw(path, attempt + 1); }
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`MusicBrainz HTTP ${res.status}`);
    return res.json();
  }
  function get(path, ttl) {
    const key = hash(path);
    const fresh = cache.get(key);
    if (fresh !== undefined) return Promise.resolve(fresh);
    if (inflight.has(key)) return inflight.get(key);
    const p = raw(path).then((d) => { cache.set(key, d, ttl); return d; })
      .catch((e) => { const old = cache.stale(key); if (old !== undefined) return old; throw e; })
      .finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  }

  const precisionOf = (d) => (!d ? null : d.length >= 10 ? "day" : d.length >= 7 ? "month" : "year");
  const typeOf = (g) => ((g["secondary-types"] || []).includes("Soundtrack") ? "Soundtrack"
    : (g["secondary-types"] || []).includes("Compilation") ? "Compilation" : g["primary-type"] || "Other");
  const STREAM = [[/spotify\.com/, "Spotify"], [/music\.apple\.com|itunes\.apple\.com/, "Apple Music"], [/music\.youtube\.com/, "YouTube Music"],
    [/youtube\.com|youtu\.be/, "YouTube"], [/deezer\.com/, "Deezer"], [/tidal\.com/, "TIDAL"], [/bandcamp\.com/, "Bandcamp"],
    [/soundcloud\.com/, "SoundCloud"], [/jiosaavn\.com|saavn\.com/, "JioSaavn"], [/gaana\.com/, "Gaana"], [/amazon\./, "Amazon Music"]];
  function links(rels = [], kinds = /stream|download|purchase|official homepage|social/i) {
    const out = [];
    for (const r of rels) {
      const url = r.url?.resource;
      if (!url || !kinds.test(r.type || "")) continue;
      const hit = STREAM.find(([re]) => re.test(url));
      const name = hit ? hit[1] : /official homepage/i.test(r.type) ? "Official site" : null;
      if (name && !out.some((x) => x.name === name)) out.push({ name, url });
    }
    return out;
  }

  function rgToRelease(g, cover) {
    const date = g["first-release-date"] || null;
    const r = makeRelease({
      source: SOURCE, sourceId: g.id, type: "music", format: typeOf(g),
      title: g.title,
      description: g.disambiguation || "",
      poster: cover || `https://coverartarchive.org/release-group/${g.id}/front-250`,
      genres: [...new Set([...(g.genres || []).map((x) => x.name), ...(g.tags || []).map((x) => x.name)])].slice(0, 8),
      status: date && date > new Date().toISOString().slice(0, 10) ? "upcoming" : date ? "finished" : "unknown",
      releaseDate: date, datePrecision: precisionOf(date),
      countdownTo: null, // music dates carry no time — pages show "in N days", never a clock
      sourceUrl: `https://musicbrainz.org/release-group/${g.id}`,
    });
    r.extra = {
      artistCredit: (g["artist-credit"] || []).map((c) => ({ id: c.artist?.id, name: c.name || c.artist?.name, join: c.joinphrase || "" })),
      releases: (g.releases || []).map((x) => ({ id: x.id, title: x.title, date: x.date || null, precision: precisionOf(x.date), country: x.country || null, status: x.status || null,
        confirmed: x.status === "Official" && precisionOf(x.date) === "day" }))
        .sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999")),
      links: links(g.relations),
      secondary: g["secondary-types"] || [],
    };
    return r;
  }

  const api = {
    name: SOURCE,
    async artist(mbid) {
      const a = await get(`/artist/${mbid}?inc=release-groups+genres+tags+url-rels`, TTL.entity);
      if (!a) return null;
      return {
        id: a.id, name: a.name, type: a.type || "", country: a.country || null, area: a.area?.name || null,
        lifeSpan: a["life-span"] || {}, disambiguation: a.disambiguation || "",
        genres: [...new Set([...(a.genres || []).map((x) => x.name), ...(a.tags || []).sort((x, y) => y.count - x.count).map((x) => x.name)])].slice(0, 10),
        links: links(a.relations),
        releaseGroups: (a["release-groups"] || []).map((g) => rgToRelease(g))
          .sort((x, y) => (y.releaseDate || "").localeCompare(x.releaseDate || "")),
        sourceUrl: `https://musicbrainz.org/artist/${a.id}`,
      };
    },
    async releaseGroup(mbid, cover) {
      const g = await get(`/release-group/${mbid}?inc=artist-credits+releases+genres+tags+url-rels`, TTL.entity);
      return g ? rgToRelease(g, cover) : null;
    },
    async search({ query, kind = "release-group", limit = 20 }) {
      const q = String(query || "").trim();
      if (q.length < 2) return [];
      const d = await get(`/${kind}?query=${encodeURIComponent(q)}&limit=${limit}`, TTL.search);
      if (kind === "artist") return (d?.artists || []).map((a) => ({ id: a.id, name: a.name, type: a.type || "", country: a.country || null, disambiguation: a.disambiguation || "" }));
      return (d?.["release-groups"] || []).map((g) => rgToRelease(g));
    },
  };
  window.Countdown.providers.musicbrainz = api;
})();
