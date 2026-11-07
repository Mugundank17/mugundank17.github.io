/*
 * Music (build-time).
 *   ListenBrainz  — upcoming & recent release discovery (fresh-releases) and the sitewide top-artists
 *                   chart used to rank them. https://listenbrainz.org (data CC0)
 *   MusicBrainz   — primary metadata: release-group types (album/single/EP + soundtrack/compilation),
 *                   genres, every regional release date, official streaming links (url-rels).
 *                   https://musicbrainz.org (core data CC0). 1 request/second, identifying User-Agent.
 *   Cover Art Archive — artwork. https://coverartarchive.org
 *   Spotify (optional, ./spotify.mjs) — extra artwork and listening links via the official Web API.
 *
 * Identifiers are kept separately: artist MBIDs, release-group MBID, release MBIDs.
 * Dates keep their precision ("2026", "2026-11", "2026-11-07"); no release time is ever invented.
 */
import { getJSON, limitHost } from "../lib/http.mjs";

const LB = "https://api.listenbrainz.org/1";
const MB = "https://musicbrainz.org/ws/2";
const UA = "Countdown/1.0 ( https://mugundank17.github.io )";
limitHost("musicbrainz.org", 0.9);
limitHost("api.listenbrainz.org", 4);

const precisionOf = (d) => (!d ? null : d.length >= 10 ? "day" : d.length >= 7 ? "month" : "year");
const caa = (releaseMbid, size = 250) => (releaseMbid ? `https://coverartarchive.org/release/${releaseMbid}/front-${size}` : null);

const STREAM_HOSTS = [
  [/spotify\.com/, "Spotify"], [/music\.apple\.com|itunes\.apple\.com/, "Apple Music"], [/music\.youtube\.com/, "YouTube Music"],
  [/youtube\.com|youtu\.be/, "YouTube"], [/deezer\.com/, "Deezer"], [/tidal\.com/, "TIDAL"], [/bandcamp\.com/, "Bandcamp"],
  [/soundcloud\.com/, "SoundCloud"], [/amazon\.[a-z.]+\/music|music\.amazon/, "Amazon Music"], [/jiosaavn\.com|saavn\.com/, "JioSaavn"],
  [/gaana\.com/, "Gaana"], [/qobuz\.com/, "Qobuz"],
];
function streamingLinks(relations = []) {
  const out = [];
  for (const r of relations) {
    const url = r.url?.resource;
    if (!url || !/stream|download|purchase/i.test(r.type || "")) continue;
    const hit = STREAM_HOSTS.find(([re]) => re.test(url));
    if (hit && !out.some((x) => x.name === hit[1])) out.push({ name: hit[1], url });
  }
  return out;
}

const mapType = (primary, secondary = []) => {
  if (secondary.includes("Soundtrack")) return "Soundtrack";
  if (secondary.includes("Compilation")) return "Compilation";
  return primary || "Other";
};

/** Upcoming (future days) + recent (past days) releases from ListenBrainz. */
async function freshReleases({ futureDays = 90, pastDays = 14 }) {
  const get = async (q) => (await getJSON(`${LB}/explore/fresh-releases/?${q}`, { headers: { "User-Agent": UA } })).data?.payload?.releases || [];
  const [future, past] = await Promise.all([
    get(`days=${futureDays}&future=true&past=false&sort=release_date`),
    get(`days=${pastDays}&future=false&past=true&sort=release_date`),
  ]);
  return { future, past };
}

async function topArtists() {
  const { data } = await getJSON(`${LB}/stats/sitewide/artists?range=year&count=1000`, { headers: { "User-Agent": UA } });
  return new Map((data?.payload?.artists || []).filter((a) => a.artist_mbid).map((a, i) => [a.artist_mbid, { rank: i + 1, name: a.artist_name }]));
}

/** MusicBrainz release-group with releases, genres and links. */
export async function releaseGroup(mbid) {
  const { data } = await getJSON(`${MB}/release-group/${mbid}?inc=artist-credits+releases+genres+tags+url-rels&fmt=json`, {
    headers: { "User-Agent": UA, Accept: "application/json" }, okStatuses: [404],
  });
  return data && data.id ? data : null;
}

export async function buildMusic({ futureDays = 90, pastDays = 14, enrich = 140, log = console.log } = {}) {
  const [{ future, past }, chart] = await Promise.all([freshReleases({ futureDays, pastDays }), topArtists()]);
  log(`  ListenBrainz: ${future.length} upcoming, ${past.length} recent; ${chart.size} chart artists`);
  const rankOf = (r) => Math.min(...(r.artist_mbids || []).map((id) => chart.get(id)?.rank ?? 9999), 9999);

  // Keep every upcoming release; keep recent ones only from charting artists.
  const seen = new Set();
  const picked = [...future, ...past.filter((r) => rankOf(r) < 9999)]
    .filter((r) => r.release_group_mbid && !seen.has(r.release_group_mbid) && seen.add(r.release_group_mbid));

  const index = picked.map((r) => ({
    id: r.release_group_mbid,                    // release-group MBID
    release: r.release_mbid || null,              // one release MBID (the one ListenBrainz reported)
    artists: r.artist_mbids || [],                // artist MBIDs
    artist: r.artist_credit_name,
    title: r.release_name,
    type: r.release_group_primary_type || "Other",
    date: r.release_date || null,
    precision: precisionOf(r.release_date),
    cover: r.caa_id ? caa(r.caa_release_mbid) : null,
    tags: (r.release_tags || []).slice(0, 6),
    chart: rankOf(r) < 9999 ? rankOf(r) : null,
  }));

  // Enrich the most relevant releases with MusicBrainz details (1 req/s).
  const order = index.slice().sort((a, b) => (a.chart ?? 9999) - (b.chart ?? 9999) || (b.cover ? 1 : 0) - (a.cover ? 1 : 0));
  const details = new Map();
  let done = 0;
  for (const it of order.slice(0, enrich)) {
    const rg = await releaseGroup(it.id).catch(() => null);
    if (!rg) continue;
    done++;
    const releases = (rg.releases || []).map((rel) => ({
      id: rel.id, title: rel.title, date: rel.date || null, precision: precisionOf(rel.date),
      country: rel.country || null, status: rel.status || null,
      // Official releases with a full date are confirmed; anything else is an estimate.
      confirmed: rel.status === "Official" && precisionOf(rel.date) === "day",
    })).sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"));
    const genres = [...new Set([...(rg.genres || []).map((g) => g.name), ...(rg.tags || []).sort((a, b) => b.count - a.count).map((t) => t.name)])].slice(0, 8);
    it.type = mapType(rg["primary-type"], rg["secondary-types"] || []);
    it.secondary = rg["secondary-types"] || [];
    it.genres = genres;
    it.confirmed = releases.some((x) => x.confirmed && x.date === it.date) || (precisionOf(rg["first-release-date"]) === "day" && it.date === rg["first-release-date"]);
    it.regions = [...new Set(releases.map((x) => x.country).filter(Boolean))].length;
    details.set(it.id, {
      ...it,
      firstReleaseDate: rg["first-release-date"] || null,
      artistCredit: (rg["artist-credit"] || []).map((c) => ({ id: c.artist?.id, name: c.name || c.artist?.name, join: c.joinphrase || "" })),
      releases,
      links: streamingLinks(rg.relations),
      disambiguation: rg.disambiguation || "",
    });
  }
  for (const it of index) {
    if (!it.genres) it.genres = it.tags;
    if (it.confirmed === undefined) it.confirmed = false; // not verified against MusicBrainz yet
  }
  log(`  MusicBrainz: ${done} release groups enriched`);
  return { index, details };
}
