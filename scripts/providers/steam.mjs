/*
 * Steam (build-time) — primary source for PC games.
 *
 * Uses only Valve's own public store endpoints (no SteamDB, no scraping of HTML pages):
 *   - https://store.steampowered.com/api/getappsincategory?category=cat_comingsoon  (Coming Soon lists)
 *   - https://store.steampowered.com/api/featuredcategories                         (featured coming soon)
 *   - https://store.steampowered.com/api/appdetails?appids=…&cc=…                    (game details per storefront)
 * Images are Valve's store assets, shown unmodified and always linked to the official store page.
 *
 * Steam release dates are developer-entered text ("24 Feb, 2027", "Q1 2027", "2027", "Coming soon",
 * "To be announced") — parsed with their precision and treated as estimates unless day-exact.
 */
import { getJSON, limitHost } from "../lib/http.mjs";

const STORE = "https://store.steampowered.com";
limitHost("store.steampowered.com", 0.7); // appdetails allows ~200 requests / 5 min
const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

/** Parse Steam's free-text release date into { date, precision, label, estimated }. */
export function parseSteamDate(rd) {
  const label = (rd?.date || "").trim();
  const comingSoon = !!rd?.coming_soon;
  const out = (date, precision) => ({ date, precision, label: label || (comingSoon ? "Coming soon" : "TBA"), estimated: precision !== "day", comingSoon });
  if (!label || /to be announced|tba|coming soon/i.test(label)) return out(null, null);
  let m;
  // "24 Feb, 2027" or "Feb 24, 2027"
  if ((m = label.match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*,?\s+(\d{4})$/)) || (m = label.match(/^([A-Za-z]{3})[a-z]*\s+(\d{1,2}),?\s+(\d{4})$/))) {
    const [day, mon, year] = /^\d/.test(m[1]) ? [m[1], m[2], m[3]] : [m[2], m[1], m[3]];
    const mi = MONTHS[mon.toLowerCase()];
    if (mi != null) return out(`${year}-${String(mi + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`, "day");
  }
  if ((m = label.match(/^([A-Za-z]{3})[a-z]*\s+(\d{4})$/)) && MONTHS[m[1].toLowerCase()] != null) {
    return out(`${m[2]}-${String(MONTHS[m[1].toLowerCase()] + 1).padStart(2, "0")}-01`, "month");
  }
  if ((m = label.match(/^Q([1-4])\s+(\d{4})$/i))) return out(`${m[2]}-${String((+m[1] - 1) * 3 + 1).padStart(2, "0")}-01`, "quarter");
  if ((m = label.match(/^(\d{4})$/))) return out(`${m[1]}-01-01`, "year");
  return out(null, null);
}

const strip = (html) => String(html || "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|li|h\d)>/gi, "\n").replace(/<[^>]+>/g, "")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/\n{3,}/g, "\n\n").trim();

async function appdetails(appid, cc, filters) {
  const url = `${STORE}/api/appdetails?appids=${appid}&cc=${cc}&l=english${filters ? `&filters=${filters}` : ""}`;
  const { data } = await getJSON(url, { headers: { Accept: "application/json" } });
  const r = data?.[appid];
  return r?.success ? r.data : null;
}

/** Upcoming Steam app ids from the store's Coming Soon lists (most wishlisted first). */
export async function discoverUpcoming(cc = "US") {
  const ids = [];
  const add = (id) => { if (id && !ids.includes(id)) ids.push(id); };
  const cat = (await getJSON(`${STORE}/api/getappsincategory/?category=cat_comingsoon&cc=${cc}&l=english`)).data;
  for (const tab of ["topsellers", "viewall"]) for (const i of cat?.tabs?.[tab]?.items || []) add(i.id);
  const feat = (await getJSON(`${STORE}/api/featuredcategories?cc=${cc}&l=english`)).data;
  for (const i of feat?.coming_soon?.items || []) add(i.id);
  return ids;
}

/**
 * Full Steam record for one app, with per-storefront price/date for each country.
 * Returns null for non-games or missing apps.
 */
export async function fetchGame(appid, { countries = ["US", "IN", "GB"], dlcNames = 6 } = {}) {
  // Some apps are only listed on certain storefronts: try each country until one answers.
  let d = null, baseCC = countries[0];
  for (const cc of countries) { d = await appdetails(appid, cc).catch(() => null); if (d) { baseCC = cc; break; } }
  if (!d || !["game", "dlc"].includes(d.type)) return null;
  const stores = {};
  for (const cc of countries) {
    const x = cc === baseCC ? d : await appdetails(appid, cc, "price_overview,release_date").catch(() => null);
    if (!x) continue;
    const rel = parseSteamDate(x.release_date);
    stores[cc] = {
      price: x.price_overview?.final_formatted || (d.is_free ? "Free" : null),
      discount: x.price_overview?.discount_percent || 0,
      release: rel,
    };
  }
  const dlc = [];
  for (const id of (d.dlc || []).slice(0, dlcNames)) {
    const x = await appdetails(id, baseCC, "basic").catch(() => null);
    if (x) dlc.push({ steam: id, name: x.name, release: parseSteamDate(x.release_date), url: `${STORE}/app/${id}` });
  }
  const assets = `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appid}`;
  return {
    steam: appid,
    type: d.type,                                       // "game" | "dlc"
    parent: d.fullgame?.appid ? { steam: +d.fullgame.appid, name: d.fullgame.name } : null,
    name: d.name,
    short: strip(d.short_description),
    about: strip(d.about_the_game || d.detailed_description).slice(0, 4000),
    header: d.header_image || `${assets}/header.jpg`,
    capsule: `${assets}/library_600x900.jpg`,          // portrait cover (may not exist for every app)
    hero: `${assets}/library_hero.jpg`,
    background: d.background_raw || d.background || null,
    screenshots: (d.screenshots || []).slice(0, 10).map((s) => ({ thumb: s.path_thumbnail, full: s.path_full })),
    videos: (d.movies || []).slice(0, 4).map((mv) => ({
      name: mv.name, thumb: mv.thumbnail, mp4: mv.mp4?.max || mv.mp4?.["480"] || null, webm: mv.webm?.max || mv.webm?.["480"] || null,
      hls: mv.hls_h264 || null,                         // Steam now serves trailers as HLS / DASH streams
    })).filter((v) => v.mp4 || v.webm || v.hls),
    developers: d.developers || [],
    publishers: d.publishers || [],
    genres: (d.genres || []).map((g) => g.description),
    categories: (d.categories || []).map((c) => c.description).slice(0, 12),
    platforms: Object.entries(d.platforms || {}).filter(([, v]) => v).map(([k]) => ({ windows: "Windows", mac: "macOS", linux: "Linux" }[k] || k)),
    release: parseSteamDate(d.release_date),
    stores,
    dlc,
    dlcCount: (d.dlc || []).length,
    website: d.website || null,
    requiredAge: +d.required_age || 0,
    url: `${STORE}/app/${appid}`,
  };
}
