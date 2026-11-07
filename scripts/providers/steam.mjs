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

// ---------------------------------------------------------------------------
// Steam Web API (official, keyless) — batch discovery and details.
//   IStoreQueryService/Query     upcoming apps, sorted by popularity, paged (≤1000 per call)
//   IStoreBrowseService/GetItems details for ≤100 apps per call, per storefront country
//   IStoreService/GetTagList     tag id → name (used as genres)
// ---------------------------------------------------------------------------
const WEBAPI = "https://api.steampowered.com";
const ASSETS = "https://shared.akamai.steamstatic.com/store_item_assets/";
const VIDEO = "https://video.akamai.steamstatic.com/store_trailers/";
limitHost("api.steampowered.com", 2);

const webapi = async (method, input) =>
  (await getJSON(`${WEBAPI}/${method}/v1/?input_json=${encodeURIComponent(JSON.stringify(input))}`)).data?.response || {};

/** Upcoming app ids, most popular first. kind: "games" | "dlc". */
export async function queryUpcoming({ kind = "games", count = 300, cc = "US" } = {}) {
  const ids = [];
  for (let start = 0; ids.length < count; start += 1000) {
    const r = await webapi("IStoreQueryService/Query", {
      query: { start, count: Math.min(1000, count - ids.length), sort: 11,
        filters: { coming_soon_only: true, type_filters: kind === "dlc" ? { include_dlc: true } : { include_games: true } } },
      context: { language: "english", country_code: cc },
    });
    const page = (r.ids || []).map((x) => x.appid);
    ids.push(...page);
    if (!page.length || start + page.length >= (r.metadata?.total_matching_records || 0)) break;
  }
  return ids.slice(0, count);
}

let tagNames = null;
async function tags() {
  if (tagNames) return tagNames;
  const { data } = await getJSON(`${WEBAPI}/IStoreService/GetTagList/v1/?language=english`);
  tagNames = new Map((data?.response?.tags || []).map((t) => [t.tagid, t.name]));
  return tagNames;
}

/** Steam's release block → { date, precision, label, estimated, comingSoon }. */
function mapRelease(rel = {}) {
  const ts = rel.steam_release_date || rel.custom_release_date_ts || 0;
  const date = ts ? new Date(ts * 1000).toISOString().slice(0, 10) : null;
  const disp = rel.coming_soon_display || (rel.is_coming_soon ? "text_comingsoon" : "date_full");
  const precision = { date_full: "day", date_month: "month", date_quarter: "quarter", date_year: "year" }[disp] || null;
  const label = rel.custom_release_date_message ||
    (precision && date ? (precision === "day" ? date : precision === "month" ? date.slice(0, 7)
      : precision === "quarter" ? `Q${Math.floor((+date.slice(5, 7) - 1) / 3) + 1} ${date.slice(0, 4)}` : date.slice(0, 4))
      : disp === "text_tba" ? "To be announced" : "Coming soon");
  return { date: precision ? date : null, precision, label, estimated: precision !== "day", comingSoon: !!rel.is_coming_soon };
}

const bbcode = (s) => String(s || "").replace(/\[\/?(p|h\d|list|olist)\]/g, "\n").replace(/\[\*\]/g, "• ").replace(/\[img[^\]]*\][^[]*\[\/img\]/g, "")
  .replace(/\[url=[^\]]*\]|\[\/url\]/g, "").replace(/\[[^\]]+\]/g, "").replace(/\n{3,}/g, "\n\n").trim();

/** Details for many apps, merged across storefront countries (first country = main data). */
export async function getItems(appids, { countries = ["US", "IN", "GB"] } = {}) {
  const tagMap = await tags();
  const out = new Map();
  for (const [ci, cc] of countries.entries()) {
    const full = ci === 0;
    for (let i = 0; i < appids.length; i += 100) {
      const r = await webapi("IStoreBrowseService/GetItems", {
        ids: appids.slice(i, i + 100).map((appid) => ({ appid })),
        context: { language: "english", country_code: cc },
        data_request: full ? {
          include_basic_info: true, include_release: true, include_assets: true, include_screenshots: true,
          include_trailers: true, include_all_purchase_options: true, include_platforms: true, include_related_items: true,
          include_tag_count: 8, include_full_description: true,
        } : { include_release: true, include_all_purchase_options: true },
      }).catch(() => ({}));
      for (const it of r.store_items || []) {
        if (!it.success && it.success !== undefined && it.success !== 1) continue;
        const appid = it.appid || it.id;
        const store = { price: it.best_purchase_option?.formatted_final_price || (it.is_free ? "Free" : null),
          discount: it.best_purchase_option?.discount_pct || 0, release: mapRelease(it.release) };
        if (!full) { if (out.has(appid)) out.get(appid).stores[cc] = store; continue; }
        if (!it.name || it.visible === false) continue;
        const a = it.assets || {};
        const asset = (f) => (f && a.asset_url_format ? ASSETS + a.asset_url_format.replace("${FILENAME}", f) : null);
        const shots = it.screenshots?.all_ages_screenshots || [];
        out.set(appid, {
          steam: appid,
          type: it.type === 4 || it.related_items?.parent_appid ? "dlc" : "game",
          parent: it.related_items?.parent_appid ? { steam: it.related_items.parent_appid, name: null } : null,
          name: it.name,
          short: it.basic_info?.short_description || "",
          about: bbcode(it.full_description_bbcode).slice(0, 4000),
          header: asset(a.header),
          capsule: asset(a.library_capsule) || asset(a.main_capsule),
          hero: asset(a.library_hero) || asset(a.page_background),
          background: asset(a.page_background) || null,
          screenshots: shots.slice(0, 10).map((s2) => ({ thumb: ASSETS + s2.filename.replace(/\.jpg/, ".600x338.jpg"), full: ASSETS + s2.filename })),
          videos: (it.trailers?.highlights || []).slice(0, 4).map((t) => {
            const hls = (t.adaptive_trailers || []).find((x) => x.encoding === "hls_h264");
            return { name: t.trailer_name, thumb: t.screenshot_medium ? ASSETS + "steam/apps/" + t.screenshot_medium : null, hls: hls ? VIDEO + hls.cdn_path : null, mp4: null, webm: null };
          }).filter((v) => v.hls),
          developers: (it.basic_info?.developers || []).map((d) => d.name),
          publishers: (it.basic_info?.publishers || []).map((d) => d.name),
          genres: (it.tags || []).sort((x, y) => y.weight - x.weight).map((t) => tagMap.get(t.tagid)).filter(Boolean).slice(0, 5),
          categories: [],
          platforms: [it.platforms?.windows && "Windows", it.platforms?.mac && "macOS", it.platforms?.steamos_linux && "Linux"].filter(Boolean),
          release: mapRelease(it.release),
          stores: { [cc]: store },
          dlc: [], dlcCount: 0,
          website: null, requiredAge: 0,
          url: `${STORE}/app/${appid}`,
        });
      }
    }
  }
  return out;
}
