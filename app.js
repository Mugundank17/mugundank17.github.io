(() => {
  "use strict";

  const STORE = "movie-countdown:custom:v1";
  const COUNTRY_KEY = "movie-countdown:country";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const app = $("#app");
  const nav = $("#nav");
  const DAY = 86400000;
  const IMG = "https://image.tmdb.org/t/p";

  // ---------- data ----------
  const DATA = window.MOVIE_DATA || { movies: [] };
  const unpackDates = (s) => {
    if (!s || typeof s !== "string") return s || null;
    const out = {};
    for (let i = 0; i + 10 <= s.length; i += 10) {
      out[s.slice(i, i + 2)] = `${s.slice(i + 2, i + 6)}-${s.slice(i + 6, i + 8)}-${s.slice(i + 8, i + 10)}`;
    }
    return out;
  };
  DATA.movies.forEach((m) => { m.dates = unpackDates(m.dates); m.th = unpackDates(m.th); m.dg = unpackDates(m.dg); });
  const REGIONS = new Set(DATA.regions || []);

  let custom = loadCustom();
  const all = () => [...DATA.movies, ...custom];
  const byTmdb = new Map(DATA.movies.map((m) => [m.tmdb, m]));

  function loadCustom() {
    try {
      const v = JSON.parse(localStorage.getItem(STORE) || "[]");
      return Array.isArray(v) ? v : [];
    } catch (_) { return []; }
  }
  function saveCustom() {
    try { localStorage.setItem(STORE, JSON.stringify(custom)); } catch (_) { /* ignore */ }
  }

  // Full details (synopsis, cast, trailers) are loaded only when needed.
  const detailCache = new Map();
  function loadDetail(m) {
    if (!m.tmdb || m._loaded) return Promise.resolve(m);
    if (!detailCache.has(m.tmdb)) {
      detailCache.set(m.tmdb, fetch(`data/movies/${m.tmdb}.json`)
        .then((r) => (r.ok ? r.json() : {}))
        .then((d) => { Object.assign(m, d, { _loaded: true }); return m; })
        .catch(() => { detailCache.delete(m.tmdb); return m; }));
    }
    return detailCache.get(m.tmdb);
  }

  // ---------- locale: language + country ----------
  const LANG = (navigator.languages && navigator.languages[0]) || navigator.language || "en-US";
  const LANG_BASE = LANG.split("-")[0].toLowerCase();

  const TZ_COUNTRY = Object.fromEntries(`
    America/New_York America/Chicago America/Denver America/Los_Angeles America/Phoenix America/Anchorage
    America/Detroit America/Boise America/Indiana/Indianapolis Pacific/Honolulu:US
    America/Toronto America/Vancouver America/Edmonton America/Winnipeg America/Halifax America/Regina
    America/St_Johns America/Montreal:CA
    America/Mexico_City America/Monterrey America/Tijuana America/Cancun America/Merida:MX
    America/Sao_Paulo America/Manaus America/Fortaleza America/Recife America/Bahia America/Belem:BR
    America/Argentina/Buenos_Aires America/Buenos_Aires:AR America/Santiago:CL America/Bogota:CO
    America/Lima:PE America/Caracas:VE
    Europe/London:GB Europe/Dublin:IE Europe/Paris:FR Europe/Berlin:DE Europe/Madrid:ES Europe/Rome:IT
    Europe/Amsterdam:NL Europe/Brussels:BE Europe/Zurich:CH Europe/Vienna:AT Europe/Stockholm:SE
    Europe/Oslo:NO Europe/Copenhagen:DK Europe/Helsinki:FI Europe/Warsaw:PL Europe/Lisbon:PT
    Europe/Athens:GR Europe/Istanbul:TR Europe/Moscow:RU Europe/Kiev Europe/Kyiv:UA Europe/Prague:CZ
    Europe/Budapest:HU Europe/Bucharest:RO
    Asia/Kolkata Asia/Calcutta:IN Asia/Karachi:PK Asia/Dhaka:BD Asia/Colombo:LK Asia/Kathmandu:NP
    Asia/Dubai:AE Asia/Riyadh:SA Asia/Qatar:QA Asia/Kuwait:KW Asia/Jerusalem:IL Asia/Tehran:IR
    Asia/Singapore:SG Asia/Kuala_Lumpur:MY Asia/Bangkok:TH Asia/Ho_Chi_Minh Asia/Saigon:VN
    Asia/Jakarta:ID Asia/Manila:PH Asia/Hong_Kong:HK Asia/Shanghai:CN Asia/Taipei:TW Asia/Tokyo:JP
    Asia/Seoul:KR
    Australia/Sydney Australia/Melbourne Australia/Brisbane Australia/Perth Australia/Adelaide
    Australia/Hobart Australia/Darwin:AU Pacific/Auckland:NZ
    Africa/Johannesburg:ZA Africa/Lagos:NG Africa/Nairobi:KE Africa/Cairo:EG Africa/Casablanca:MA
  `.trim().split(/\s+/).reduce((acc, tok) => {
    const [zone, cc] = tok.split(":");
    acc.pending.push(zone);
    if (cc) { acc.pending.forEach((z) => acc.out.push([z, cc])); acc.pending = []; }
    return acc;
  }, { pending: [], out: [] }).out);

  function detectCountry() {
    try {
      const saved = localStorage.getItem(COUNTRY_KEY);
      if (saved) return saved;
    } catch (_) { /* ignore */ }
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (TZ_COUNTRY[tz]) return TZ_COUNTRY[tz];
    } catch (_) { /* ignore */ }
    for (const l of navigator.languages || [navigator.language]) {
      const m = /-([A-Z]{2})\b/i.exec(l || "");
      if (m) return m[1].toUpperCase();
    }
    return DATA.region || "US";
  }
  let COUNTRY = detectCountry();
  const isWorld = () => COUNTRY === "WW";
  // The visitor's own country, remembered so the Worldwide switch can flip back.
  const HOME_KEY = "movie-countdown:home-country";
  let HOME_COUNTRY = (() => {
    try { const h = localStorage.getItem(HOME_KEY); if (h) return h; } catch (_) { /* ignore */ }
    return COUNTRY === "WW" ? (TZ_COUNTRY[Intl.DateTimeFormat().resolvedOptions().timeZone] || DATA.region || "US") : COUNTRY;
  })();
  const TICKETS = window.TICKETS || {};
  const cityKey = (cc) => `movie-countdown:city:${cc}`;
  const loadCity = (cc) => { try { return localStorage.getItem(cityKey(cc)) || ""; } catch (_) { return ""; } };
  let CITY = loadCity(COUNTRY);

  const displayNames = (type) => { try { return new Intl.DisplayNames([LANG], { type }); } catch (_) { return null; } };
  const regionNames = displayNames("region");
  const languageNames = displayNames("language");
  const countryName = (cc) => {
    if (cc === "WW") return "Worldwide";
    try { return regionNames?.of(cc) || cc; } catch (_) { return cc; }
  };
  const languageName = (code) => { try { return languageNames?.of(code) || code; } catch (_) { return code; } };

  // Translated titles / overviews / taglines, loaded only for the visitor's language.
  let TR = {};
  if (LANG_BASE !== "en") {
    fetch(`data/i18n/${encodeURIComponent(LANG_BASE)}.json`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((t) => { TR = t || {}; route(); })
      .catch(() => {});
  }
  const tr = (m, field, fallback) => TR[m.tmdb]?.[field] || fallback;
  const title = (m) => tr(m, "title", m.title);
  const synopsis = (m) => tr(m, "overview", m.synopsis || m.blurb);
  const tagline = (m) => tr(m, "tagline", m.tagline);

  const unitLabel = (unit, fallback) => {
    try {
      const parts = new Intl.NumberFormat(LANG, { style: "unit", unit, unitDisplay: "long" }).formatToParts(2);
      return parts.filter((p) => p.type === "unit").map((p) => p.value).join("").trim() || fallback;
    } catch (_) { return fallback; }
  };
  const UNITS = [unitLabel("day", "Days"), unitLabel("hour", "Hours"), unitLabel("minute", "Minutes"), unitLabel("second", "Seconds")];

  // ---------- dates (per country) ----------
  const dateStr = (m) => (isWorld() ? m.date : m.dates?.[COUNTRY] || m.date);
  const datedHere = (m) => isWorld() || !m.dates || !!m.dates[COUNTRY];
  const parseDay = (s) => { const [y, mo, d] = s.split("-").map(Number); return new Date(y, mo - 1, d || 1).getTime(); };
  const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const startOfDay = (t = Date.now()) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const time = (m) => parseDay(dateStr(m));
  const isOut = (m) => time(m) <= Date.now();
  const byDate = (a, b) => time(a) - time(b);
  const visible = (m) => m.kind !== "rerelease" || isWorld() || !!m.dates?.[COUNTRY];
  const isRe = (m) => m.kind === "rerelease";

  const listed = () => all().filter(visible);
  const upcoming = () => listed().filter((m) => !isRe(m) && !isOut(m)).sort(byDate);
  const upcomingHere = () => upcoming().filter(datedHere);
  const released = () => listed().filter((m) => !isRe(m) && isOut(m) && datedHere(m)).sort((a, b) => byDate(b, a));
  const rereleases = () => listed().filter(isRe).sort(byDate);

  // Most anticipated in the visitor's country (or worldwide if we don't rank that country).
  const rankKey = () => (REGIONS.has(COUNTRY) ? COUNTRY : "WW");
  const anticipated = (key = rankKey()) => upcoming().filter((m) => m.hot?.[key]).sort((a, b) => a.hot[key] - b.hot[key]);

  // ---------- helpers ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function pad(n) { return String(n).padStart(2, "0"); }
  const fmt = (t, opts) => new Date(t).toLocaleDateString(LANG, opts);
  const longDate = (t) => fmt(t, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const shortDate = (t) => fmt(t, { month: "short", day: "numeric", year: "numeric" });
  const theme = (h) => `--h1:${h?.[0] ?? 20};--h2:${h?.[1] ?? 40}`;
  const bg = (u) => (u ? `background-image:url(&quot;${esc(encodeURI(u))}&quot;)` : "");
  const initials = (n) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const longestWord = (t) => Math.max(...t.split(/\s+/).map((w) => w.length));
  const movieHref = (m) => `#/movie/${encodeURIComponent(m.id)}`;
  const personHref = (id) => `#/person/${encodeURIComponent(id)}`;
  const calHref = (key, mode = "day") => `#/calendar/${key}${mode === "day" ? "" : "/" + mode}`;
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  function parts(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    return [Math.floor(s / 86400), Math.floor((s % 86400) / 3600), Math.floor((s % 3600) / 60), s % 60];
  }

  function countdownAt(t, cls = "", outLabel = "Now in cinemas") {
    if (t <= Date.now()) return `<div class="cd ${cls} out">${esc(outLabel)}</div>`;
    const p = parts(t - Date.now());
    return `<div class="cd ${cls}" data-t="${t}">${UNITS.map((l, i) =>
      `<div class="cd-u"><b>${i ? pad(p[i]) : p[i]}</b><span>${esc(l)}</span></div>`).join("")}</div>`;
  }
  const countdown = (m, cls) => countdownAt(time(m), cls, isRe(m) ? "Back in cinemas" : "Now in cinemas");

  function tick() {
    const now = Date.now();
    let changed = false;
    $$("[data-t]").forEach((el) => {
      const diff = +el.dataset.t - now;
      if (diff <= 0) { changed = true; return; }
      const p = parts(diff);
      $$("b", el).forEach((b, i) => { b.textContent = i ? pad(p[i]) : p[i]; });
    });
    if (changed) route();
  }

  const orb = `
    <svg class="orb" viewBox="-100 -100 200 200" aria-hidden="true"><g fill="none" stroke="currentColor">
      <circle r="92" stroke-width=".5"/><circle r="70" stroke-width=".4" stroke-dasharray="1 3"/>
      <ellipse rx="92" ry="28" stroke-width=".5"/>
      <ellipse rx="92" ry="28" stroke-width=".5" transform="rotate(60)"/>
      <ellipse rx="92" ry="28" stroke-width=".5" transform="rotate(120)"/>
      <ellipse rx="34" ry="92" stroke-width=".4"/>
      <path d="M-92 0H92M0-92V92" stroke-width=".3"/>
    </g></svg>`;

  const fireLayers = (backdrop, extra = "") => `
    <div class="fire ${backdrop ? "has-img" : ""}" aria-hidden="true">
      <div class="fire-img" style="${bg(backdrop)}"></div>
      <div class="smoke s1"></div><div class="smoke s2"></div><div class="smoke s3"></div>
      ${extra}
      <canvas class="embers"></canvas>
      <div class="vignette"></div>
    </div>`;

  function trailerBtn(m) {
    const type = m.trailers?.[0]?.type || m.video;
    if (!type) return `<button class="play" type="button" disabled><span>▶</span> Trailer coming soon</button>`;
    return `<button class="play" type="button" data-trailer="${esc(m.id)}"><span>▶</span> ${type === "Teaser" ? "Watch Teaser" : "Watch Trailer"}</button>`;
  }

  function titleArt(m, cls) {
    const useLogo = m.logo && (LANG_BASE === "en" || !TR[m.tmdb]?.title);
    return useLogo
      ? `<img class="${cls} logo" src="${esc(m.logo)}" alt="${esc(title(m))}" loading="lazy">`
      : `<span class="${cls}">${esc(title(m))}</span>`;
  }
  const ticketBtn = (m, cls = "btn btn-outline") =>
    `<button class="${cls}" type="button" data-tickets="${esc(m.id)}">🎟 Get Tickets</button>`;
  const localNote = (m) => (datedHere(m) ? ""
    : `<p class="local-note">No release date announced in ${esc(countryName(COUNTRY))} yet — showing the worldwide date.</p>`);
  const origTitle = (m) => (m.originalTitle && m.originalTitle !== title(m) ? m.originalTitle : "");

  // ---------- cards & rows ----------
  function card(m) {
    const art = m.card || m.backdrop || m.poster;
    const d = Math.ceil((time(m) - Date.now()) / DAY);
    const badge = isOut(m) ? `<span class="tag tag-out">${isRe(m) ? "Back in cinemas" : "Out now"}</span>`
      : d <= 30 ? `<span class="tag">${d <= 1 ? "Tomorrow" : `${d} days`}</span>` : "";
    return `
      <a class="card" href="${movieHref(m)}" style="${theme(m.hue)}">
        <div class="card-art ${art ? "has-img" : ""}" style="${bg(art)}">
          ${m.artHasTitle ? "" : titleArt(m, "card-title")}
          ${badge}
          ${isRe(m) ? `<span class="tag tag-re">Re-release</span>`
            : m.lang && m.lang !== LANG_BASE && m.lang !== "en" ? `<span class="tag tag-lang">${esc(languageName(m.lang))}</span>` : ""}
        </div>
        <div class="card-info">
          <strong>${esc(title(m))}</strong>
          <span>${esc(shortDate(time(m)))}${m.certs?.[COUNTRY] ? ` · ${esc(m.certs[COUNTRY])}` : ""}${datedHere(m) ? "" : " · 🌐"}</span>
          ${countdown(m, "cd-mini")}
        </div>
      </a>`;
  }

  const rankCard = (m, i) => `<div class="rank"><span class="rank-n">${i + 1}</span>${card(m)}</div>`;

  function rail(items, render, cls = "") {
    return `
      <div class="rail-wrap">
        <button class="rail-btn prev" type="button" aria-label="Scroll left">‹</button>
        <div class="rail ${cls}">${items.map(render).join("")}</div>
        <button class="rail-btn next" type="button" aria-label="Scroll right">›</button>
      </div>`;
  }

  function row(id, heading, items, render = card, cls = "", extra = "") {
    if (!items.length) return "";
    return `<section class="row" id="${id}"><div class="row-head"><h2 class="row-title">${heading}</h2>${extra}</div>${rail(items, render, cls)}</section>`;
  }

  // Rows of upcoming films grouped by original language — local languages first.
  function languageRows() {
    const up = upcoming();
    const groups = {};
    for (const m of up) if (m.lang) (groups[m.lang] ||= []).push(m);
    const localLangs = new Set(up.filter((m) => m.origin?.includes(COUNTRY)).map((m) => m.lang));
    return Object.entries(groups)
      .filter(([, list]) => list.length >= 3)
      .sort((a, b) => (localLangs.has(b[0]) - localLangs.has(a[0])) || b[1].length - a[1].length)
      .slice(0, 8)
      .map(([lang, list]) => row(`row-lang-${lang}`, `${esc(languageName(lang))} Films`, list.slice(0, 20)))
      .join("");
  }

  // Local ⇄ Worldwide switch
  function scopeSwitch() {
    return `<div class="seg scope" role="group" aria-label="Release region">
      <button type="button" class="${isWorld() ? "" : "active"}" data-scope="${esc(HOME_COUNTRY)}">📍 ${esc(countryName(HOME_COUNTRY))}</button>
      <button type="button" class="${isWorld() ? "active" : ""}" data-scope="WW">🌐 Worldwide</button>
    </div>`;
  }

  // ---------- home ----------
  function renderHome() {
    document.title = "Countdown — movie release countdowns";
    const top = anticipated();
    const hero = top[0] || upcomingHere()[0] || upcoming()[0] || released()[0];
    const here = esc(countryName(COUNTRY));
    const inHere = isWorld() ? "Worldwide" : `in ${here}`;
    const weekEnd = startOfDay() + 7 * DAY;
    const thisWeek = upcomingHere().filter((m) => time(m) < weekEnd);

    if (!hero) {
      app.innerHTML = `<section class="empty-state"><h1>No movies yet</h1>
        <p>Run the “Update movies & deploy” GitHub Action (or <code>npm run update</code>) to load movies from TMDB, or press + Add.</p></section>`;
      return;
    }
    const heroRank = hero.hot?.[rankKey()];
    app.innerHTML = `
      <header class="billboard cine" style="${theme(hero.hue)}">
        ${fireLayers(hero.backdrop)}
        <div class="billboard-body">
          <p class="kicker">${heroRank === 1 ? `#1 most anticipated in ${rankKey() === "WW" ? "the world" : here}` : isOut(hero) ? "Now showing" : "Next release"}</p>
          <h1 class="bb-title">${hero.logo && !TR[hero.tmdb]?.title ? `<img class="bb-logo" src="${esc(hero.logo)}" alt="${esc(title(hero))}">` : esc(title(hero))}</h1>
          ${origTitle(hero) ? `<p class="bb-orig">${esc(origTitle(hero))}</p>` : ""}
          <p class="bb-meta">${esc(longDate(time(hero)))}${hero.certs?.[COUNTRY] ? ` · <span class="cert">${esc(hero.certs[COUNTRY])}</span>` : ""}${hero.genres?.length ? " · " + hero.genres.slice(0, 3).map(esc).join(" · ") : ""}</p>
          ${synopsis(hero) ? `<p class="bb-text">${esc(synopsis(hero))}</p>` : ""}
          ${countdown(hero, "cd-bb")}
          <div class="cta">
            <a class="btn btn-solid" href="${movieHref(hero)}">ⓘ More Info</a>
            ${ticketBtn(hero)}
            ${trailerBtn(hero)}
          </div>
        </div>
      </header>
      <div class="rows">
        <div class="home-tools">
          <button class="search-bar" type="button" data-open-search>
            <span aria-hidden="true">🔍</span> Search movies, actors, directors…
            <kbd>/</kbd>
          </button>
          <a class="btn btn-ghost" href="${calHref(dayKey(Date.now()))}">📅 Release calendar</a>
          ${scopeSwitch()}
        </div>
        <nav class="chips home-filters" aria-label="Browse">
          ${BROWSE_TABS.map(([k, label]) => `<a href="#/browse/${k}">${label}</a>`).join("")}
          <a href="#/anime">🎌 Anime</a>
          <a href="#/feed">📰 Feed</a>
          <a href="#/rankings">🔥 Rankings</a>
          <a href="#/clashes">⚔ Clashes</a>
          <a href="#/delays">⏰ Delays</a>
          <a href="#/history/today">🗓 On this day</a>
          <a href="#/global">🌍 Compare</a>
          <button type="button" data-surprise>🎲 Surprise me</button>
        </nav>
        ${row("row-waiting", "⏳ Your Waiting Room", waitingMovies(), card, "", `<a class="row-link" href="#/browse/watchlist">See all ›</a>`)}
        ${row("row-top", `Top 10 Most Anticipated in ${rankKey() === "WW" ? "the World" : here}`, top.slice(0, 10), rankCard, "rail-ranked")}
        ${row("row-week", `Releasing This Week ${inHere}`, thisWeek, card, "",
          `<a class="row-link" href="${calHref(dayKey(Date.now()), "week")}">Open calendar ›</a>`)}
        ${row("row-upcoming", `Coming Soon ${inHere}`, upcomingHere().slice(0, 30))}
        ${rankKey() !== "WW" ? row("row-world", "Worldwide Most Anticipated", anticipated("WW").slice(0, 20)) : ""}
        ${row("row-ott", `📺 Coming to Streaming ${inHere}`,
          listed().filter((m) => dgDate(m) && parseDay(dgDate(m)) >= startOfDay()).sort((a, b) => parseDay(dgDate(a)) - parseDay(dgDate(b))).slice(0, 20),
          card, "", `<a class="row-link" href="#/browse/ott">All OTT ›</a>`)}
        ${row("row-rereleases", `Back in Cinemas · ${here}`, rereleases())}
        ${languageRows()}
        <div id="animeAiring"></div>
        <div id="onThisDay"></div>
        ${row("row-mine", "My Countdowns", custom.slice().sort(byDate))}
        ${row("row-out", `Out Now ${inHere}`, released().slice(0, 20))}
      </div>`;
    startEmbers($(".billboard canvas"), hero.hue);
    fillOnThisDay(routeToken);
    fillAnimeRow(routeToken);
  }

  // ---------- release calendar ----------
  function firstDayOfWeek() {
    try {
      const loc = new Intl.Locale(`${LANG_BASE}-${COUNTRY}`);
      const info = loc.getWeekInfo?.() || loc.weekInfo;
      if (info?.firstDay) return info.firstDay % 7; // 0 = Sunday
    } catch (_) { /* ignore */ }
    return ["US", "CA", "JP", "BR", "IN", "MX", "KR", "PH", "IL", "ZA", "AU"].includes(COUNTRY) ? 0 : 1;
  }

  let calType = (() => { try { return localStorage.getItem("movie-countdown:caltype") || "all"; } catch (_) { return "all"; } })();
  function releasesByDay() {
    const map = new Map();
    for (const m of listed()) {
      for (const e of eventsFor(m, false)) {
        if (calType !== "all" && !(e.type === calType || (calType === "cinema" && e.type === "rerelease"))) continue;
        const k = dayKey(e.t);
        if (!map.has(k)) map.set(k, []);
        map.get(k).push(e);
      }
    }
    const order = { cinema: 0, rerelease: 1, stream: 2, premiere: 3 };
    for (const list of map.values()) {
      list.sort((a, b) => (order[a.type] - order[b.type]) || datedHere(b.m) - datedHere(a.m) ||
        (a.m.hot?.[rankKey()] || 999) - (b.m.hot?.[rankKey()] || 999));
    }
    return map;
  }

  function rangeFor(selT, mode) {
    const d = new Date(selT);
    if (mode === "month") {
      return [new Date(d.getFullYear(), d.getMonth(), 1).getTime(), new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime()];
    }
    if (mode === "week") {
      const shift = (d.getDay() - firstDayOfWeek() + 7) % 7;
      const s = new Date(d.getFullYear(), d.getMonth(), d.getDate() - shift).getTime();
      return [s, new Date(new Date(s).setDate(new Date(s).getDate() + 7)).getTime()];
    }
    return [selT, new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime()];
  }

  function countIn(map, [a, b]) {
    let n = 0;
    for (const [k, list] of map) { const t = parseDay(k); if (t >= a && t < b) n += list.length; }
    return n;
  }

  function calendarEntry(e) {
    const m = e.m;
    const orig = origTitle(m);
    return `
      <a class="cal-item" href="${movieHref(m)}" style="${theme(m.hue)}">
        <div class="cal-poster" style="${bg(m.poster || m.card)}"></div>
        <div class="cal-body">
          <strong>${esc(title(m))}</strong>
          ${orig ? `<span class="cal-orig">${esc(orig)}</span>` : ""}
          <span class="cal-meta">
            <span class="pill pill-type t-${e.type}">${TYPES[e.type].icon} ${esc(evLabel(e))}</span>
            ${m.lang ? `<span class="pill">${esc(languageName(m.lang))}</span>` : ""}
            ${m.certs?.[COUNTRY] ? `<span class="cert">${esc(m.certs[COUNTRY])}</span>` : ""}
            ${e.worldwide ? `<span class="pill" title="No date announced in ${esc(countryName(COUNTRY))}">🌐 Worldwide date</span>` : ""}
            ${m.genres?.length ? `<span>${m.genres.slice(0, 3).map(esc).join(" · ")}</span>` : ""}
          </span>
          ${m.people?.length ? `<span class="cal-people">${m.people.slice(0, 3).map(esc).join(", ")}</span>` : ""}
        </div>
        <div class="cal-side">${countdownAt(e.t, "cd-mini", e.type === "stream" ? "Streaming now" : e.type === "premiere" ? "Premiered" : isRe(m) ? "Back in cinemas" : "Out now")}</div>
      </a>`;
  }

  function renderCalendar(selKey, mode = "day") {
    document.title = "Release Calendar — Countdown";
    const todayT = startOfDay();
    const selT = selKey && /^\d{4}-\d{2}-\d{2}$/.test(selKey) ? parseDay(selKey) : todayT;
    const sel = new Date(selT);
    const map = releasesByDay();
    const here = esc(countryName(COUNTRY));

    const todayN = countIn(map, rangeFor(todayT, "day"));
    const weekN = countIn(map, rangeFor(todayT, "week"));
    const monthN = countIn(map, rangeFor(todayT, "month"));

    // Month grid
    const first = new Date(sel.getFullYear(), sel.getMonth(), 1);
    const lead = (first.getDay() - firstDayOfWeek() + 7) % 7;
    const gridStart = new Date(first.getFullYear(), first.getMonth(), 1 - lead);
    const weeks = Math.ceil((lead + new Date(sel.getFullYear(), sel.getMonth() + 1, 0).getDate()) / 7);
    const weekdayNames = Array.from({ length: 7 }, (_, i) =>
      new Date(2024, 0, 7 + ((firstDayOfWeek() + i) % 7)).toLocaleDateString(LANG, { weekday: "short" }));
    const [rs, re] = rangeFor(selT, mode);

    let cells = "";
    for (let i = 0; i < weeks * 7; i++) {
      const d = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
      const t = d.getTime(), k = dayKey(t);
      const list = map.get(k) || [];
      const cls = [
        "cal-cell",
        d.getMonth() !== sel.getMonth() ? "other" : "",
        t === todayT ? "today" : "",
        t === selT ? "selected" : "",
        t >= rs && t < re && mode !== "day" ? "in-range" : "",
        list.length ? "has" : "",
      ].join(" ");
      cells += `
        <a class="${cls}" href="${calHref(k, mode)}" aria-label="${esc(longDate(t))}: ${plural(list.length, "release", "releases")}">
          <span class="cal-num">${d.getDate()}</span>
          ${list.length ? `<span class="cal-count">${list.length}</span>` : ""}
          <span class="cal-thumbs">${list.slice(0, 3).map((e) => `<i style="${bg(e.m.poster)}"></i>`).join("")}</span>
        </a>`;
    }

    // Selected range list, grouped by day
    const days = [...map.keys()].filter((k) => { const t = parseDay(k); return t >= rs && t < re; }).sort();
    const total = days.reduce((n, k) => n + map.get(k).length, 0);
    const rangeLabel = mode === "day" ? longDate(selT)
      : mode === "week" ? `${fmt(rs, { month: "short", day: "numeric" })} – ${fmt(re - DAY, { month: "short", day: "numeric", year: "numeric" })}`
        : fmt(selT, { month: "long", year: "numeric" });
    const prevMonth = dayKey(new Date(sel.getFullYear(), sel.getMonth() - 1, 1).getTime());
    const nextMonth = dayKey(new Date(sel.getFullYear(), sel.getMonth() + 1, 1).getTime());
    const step = mode === "week" ? 7 : 1;
    const prevStep = mode === "month" ? prevMonth : dayKey(new Date(sel.getFullYear(), sel.getMonth(), sel.getDate() - step).getTime());
    const nextStep = mode === "month" ? nextMonth : dayKey(new Date(sel.getFullYear(), sel.getMonth(), sel.getDate() + step).getTime());

    app.innerHTML = `
      <section class="calendar">
        <header class="cal-head">
          <div>
            <p class="kicker">Release calendar · ${here}</p>
            <h1 class="cal-title">${esc(fmt(selT, { month: "long", year: "numeric" }))}</h1>
          </div>
          ${scopeSwitch()}
          <div class="cal-stats">
            <a class="stat ${mode === "day" && selT === todayT ? "active" : ""}" href="${calHref(dayKey(todayT))}"><b>${todayN}</b><span>Today</span></a>
            <a class="stat ${mode === "week" && rs <= todayT && todayT < re ? "active" : ""}" href="${calHref(dayKey(todayT), "week")}"><b>${weekN}</b><span>This week</span></a>
            <a class="stat ${mode === "month" && rs <= todayT && todayT < re ? "active" : ""}" href="${calHref(dayKey(todayT), "month")}"><b>${monthN}</b><span>This month</span></a>
          </div>
        </header>

        <div class="cal-layout">
          <div class="cal-month">
            <div class="cal-controls">
              <a class="round" href="${calHref(prevMonth, mode)}" aria-label="Previous month">‹</a>
              <a class="btn btn-solid btn-sm" href="${calHref(dayKey(todayT), mode)}">Today</a>
              <a class="round" href="${calHref(nextMonth, mode)}" aria-label="Next month">›</a>
              <div class="seg">
                ${["day", "week", "month"].map((x) => `<a class="${x === mode ? "active" : ""}" href="${calHref(dayKey(selT), x)}">${x[0].toUpperCase() + x.slice(1)}</a>`).join("")}
              </div>
            </div>
            <div class="chips cal-types">
              ${[["all", "All"], ["cinema", "🎬 Cinemas"], ["stream", "📺 Streaming"], ["premiere", "🌟 Premieres"]].map(([k, l]) =>
                `<button type="button" class="${calType === k ? "active" : ""}" data-caltype="${k}">${l}</button>`).join("")}
            </div>
            <div class="cal-grid">
              ${weekdayNames.map((w) => `<span class="cal-wd">${esc(w)}</span>`).join("")}
              ${cells}
            </div>
            <p class="muted small">${isWorld() ? "Showing each film's main worldwide release date." : `🌐 = no date announced in ${here} yet, so the worldwide date is used.`}</p>
          </div>

          <div class="cal-list">
            <div class="cal-list-head">
              <a class="round" href="${calHref(prevStep, mode)}" aria-label="Previous">‹</a>
              <div>
                <h2>${esc(rangeLabel)}</h2>
                <p class="muted">${plural(total, "release", "releases")}${selT === todayT && mode === "day" ? " today" : ""}</p>
              </div>
              <a class="round" href="${calHref(nextStep, mode)}" aria-label="Next">›</a>
            </div>
            ${days.length ? days.map((k) => `
              ${mode === "day" ? "" : `<h3 class="cal-day">${esc(longDate(parseDay(k)))} <span>${map.get(k).length}</span></h3>`}
              ${map.get(k).map(calendarEntry).join("")}`).join("")
              : `<div class="cal-empty">No releases on our list for this ${mode}.</div>`}
          </div>
        </div>
      </section>`;
  }

  // ---------- movie page ----------
  function personCard(c) {
    const inner = `
      <div class="person-photo ${c.photo ? "has-img" : ""}" style="${bg(c.photo)}">
        ${c.photo ? "" : `<span>${esc(initials(c.actor))}</span>`}
      </div>
      <p class="person-actor">${esc(c.role ? c.actor : "Cast")}</p>
      <h3 class="person-role">${esc(c.role || c.actor)}</h3>
      ${c.tmdb ? `<span class="btn btn-outline btn-sm">See More</span>` : ""}`;
    return c.tmdb ? `<a class="person" href="${personHref(c.tmdb)}">${inner}</a>` : `<article class="person">${inner}</article>`;
  }

  const ytThumb = (v, q = "hqdefault") => `https://i.ytimg.com/vi/${encodeURIComponent(v.key)}/${q}.jpg`;
  const playerPoster = (v, i) => `
    <button class="player-poster" type="button" data-inline-play="${i}" style="${bg(ytThumb(v))}">
      <span class="vt-play big">▶</span><span class="player-name">${esc(v.name)}</span>
    </button>`;
  const embed = (v, name) => `
    <iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(v.key)}?autoplay=1&rel=0&modestbranding=1&playsinline=1"
      title="${esc(name)} — ${esc(v.name)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;

  function videoSection(m) {
    if (!m.trailers?.length) return "";
    return `
      <section class="watch" id="watch">
        <p class="kicker">Trailers &amp; teasers</p>
        <div class="player" data-player="${esc(m.id)}">${playerPoster(m.trailers[0], 0)}</div>
        ${m.trailers.length > 1 ? `
        <div class="video-list">
          ${m.trailers.map((v, i) => `
            <button class="video-thumb ${i === 0 ? "active" : ""}" type="button" data-inline="${i}">
              <img src="${ytThumb(v, "mqdefault")}" alt="" loading="lazy">
              <span class="vt-name">${esc(v.name)}</span>
              <span class="vt-meta">${esc(v.type)}${v.published ? " · " + esc(shortDate(parseDay(v.published))) : ""}</span>
            </button>`).join("")}
        </div>` : ""}
      </section>`;
  }

  // Official artwork with download buttons.
  let artTab = "posters";
  function artworkSection(m) {
    const art = m.artwork;
    if (!art) return "";
    const tabs = [["posters", "Posters"], ["backdrops", "Backdrops"], ["logos", "Logos"]].filter(([k]) => art[k]?.length);
    if (!tabs.length) return "";
    if (!art[artTab]?.length) artTab = tabs[0][0];
    const thumbSize = artTab === "posters" ? "w342" : artTab === "logos" ? "w300" : "w780";
    return `
      <section class="artwork" id="artwork">
        <div class="art-head">
          <p class="kicker">Artwork</p>
          <div class="seg">${tabs.map(([k, label]) =>
            `<button type="button" class="${k === artTab ? "active" : ""}" data-art-tab="${k}">${label} <small>${art[k].length}</small></button>`).join("")}</div>
        </div>
        <div class="art-grid art-${artTab}">
          ${art[artTab].map(([path, w, h], i) => `
            <figure class="art-item">
              <div class="art-img"><img src="${IMG}/${thumbSize}${esc(path)}" alt="${esc(title(m))} ${artTab.slice(0, -1)} ${i + 1}" loading="lazy"></div>
              <figcaption>
                <span>${w} × ${h}</span>
                <button class="btn btn-ghost btn-sm" type="button" data-download="${esc(path)}" data-name="${esc(`${m.id}-${artTab.slice(0, -1)}-${i + 1}`)}">⤓ Download</button>
              </figcaption>
            </figure>`).join("")}
        </div>
        <p class="muted small">Official promotional artwork via TMDB, full resolution. For personal use — artwork belongs to the studios.</p>
      </section>`;
  }

  async function downloadArt(path, name) {
    const url = `${IMG}/original${path}`;
    const ext = (path.match(/\.\w+$/) || [".jpg"])[0];
    try {
      const res = await fetch(url, { mode: "cors" });
      if (!res.ok) throw new Error(res.status);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name + ext;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      toast("Downloading…");
    } catch (_) {
      open(url, "_blank", "noopener"); // fall back: open full size, long-press / right-click to save
    }
  }

  let currentMovie = null;
  function renderMovie(m, token) {
    currentMovie = m;
    document.title = `${title(m)} — Countdown`;
    if (m.tmdb && !m._loaded) {
      loadDetail(m).then(() => { if (token === routeToken && m._loaded) { const y = scrollY; renderMovie(m, token); scrollTo(0, y); } });
    }
    const cast = m.cast || [];
    const more = upcoming().filter((x) => x.id !== m.id && (x.lang === m.lang || x.genres?.some((g) => m.genres?.includes(g)))).slice(0, 20);
    const isCustom = custom.some((c) => c.id === m.id);
    const cert = m.certs?.[COUNTRY];
    const byline = m.directors?.length
      ? m.directors.map((d) => `<a href="${personHref(d.id)}">${esc(d.name)}</a>`).join(" &amp; ")
      : esc(m.director || "");
    const orig = origTitle(m);
    const rank = m.hot?.[rankKey()];

    app.innerHTML = `
      <header class="cine hero" style="${theme(m.hue)}">
        ${fireLayers(m.backdrop, orb)}
        <div class="hero-body">
          ${isRe(m) ? `<p class="byline re">Re-release · Originally ${esc(m.originalDate?.slice(0, 4) || "")}</p>`
            : rank && rank <= 10 ? `<p class="byline re">#${rank} most anticipated in ${rankKey() === "WW" ? "the world" : esc(countryName(COUNTRY))}</p>` : ""}
          ${byline ? `<p class="byline">A film by <strong>${byline}</strong></p>` : ""}
          <h1 class="mega" style="--len:${longestWord(title(m))}">${esc(title(m))}</h1>
          ${orig ? `<p class="orig-title" lang="${esc(m.lang || "")}">${esc(orig)}</p>` : ""}
          ${tagline(m) ? `<p class="tagline">${esc(tagline(m))}</p>` : ""}
          ${countdown(m, "cd-hero")}
          ${localNote(m)}
          ${(() => {
            const ch = (m.changes || []).filter(([cc]) => cc === COUNTRY || cc === "WW").pop();
            return ch ? `<p class="local-note">${parseDay(ch[2]) > parseDay(ch[1]) ? "⏰ Delayed" : "⏩ Moved earlier"}: was ${esc(shortDate(parseDay(ch[1])))} · <a href="#/delays">delays tracker</a></p>` : "";
          })()}
          ${(() => {
            const c = !isOut(m) && clashFor(m);
            const others = c ? c.list.filter((x) => x !== m) : [];
            return others.length ? `<p class="local-note">⚔ Clashes with ${others.slice(0, 2).map((x) => `<a href="${movieHref(x)}">${esc(title(x))}</a>`).join(" &amp; ")}${others.length > 2 ? ` +${others.length - 2}` : ""} · <a href="#/clashes">all clashes</a></p>` : "";
          })()}
          <div class="cta cta-center">
            ${ticketBtn(m)}
            ${trailerBtn(m)}
          </div>
          ${!isOut(m) ? `<div class="wr-join">${waitBtn(m, "btn btn-ghost btn-sm")}</div>` : ""}
          <div class="hero-links">
            <button class="link" type="button" data-ics="${esc(m.id)}">＋ Add to calendar</button>
            <a class="link" href="${calHref(dateStr(m))}">📅 See what else releases that day</a>
          </div>
        </div>
        <a class="scroll-hint" href="#about" data-scroll="${cast.length ? "cast" : "about"}" aria-label="Scroll down">⌄</a>
      </header>

      ${cast.length ? `
      <section class="cine cast" id="cast" style="${theme(m.hue)}">
        ${fireLayers(m.backdrop)}
        <div class="cast-body">
          <p class="kicker">Cast</p>
          <h2 class="cast-title">${esc(title(m))}</h2>
          ${countdown(m, "cd-small")}
          <div class="rail-wrap"><div class="rail cast-rail">${cast.map(personCard).join("")}</div></div>
          <div class="rail-arrows">
            <button class="round prev" type="button" aria-label="Previous">‹</button>
            <button class="round next" type="button" aria-label="Next">›</button>
          </div>
        </div>
      </section>` : m.tmdb && !m._loaded ? `<div class="loading-strip"><div class="spinner"></div></div>` : ""}

      ${videoSection(m)}

      ${whereToWatch(m)}

      ${artworkSection(m)}

      ${globalDatesSection(m)}

      <section class="about" id="about">
        <div>
          <p class="kicker">About the film</p>
          <p class="about-text">${esc(synopsis(m) || tagline(m) || "More details coming soon.")}</p>
        </div>
        <dl class="facts">
          <div><dt>${isWorld() ? "Worldwide release" : `Release in ${esc(countryName(COUNTRY))}`}</dt><dd>${datedHere(m) ? esc(longDate(time(m))) : "Not announced yet"}</dd></div>
          ${!datedHere(m) ? `<div><dt>Worldwide release</dt><dd>${esc(longDate(parseDay(m.date)))}</dd></div>` : ""}
          ${thDate(m) && dgDate(m) ? `<div><dt>In cinemas</dt><dd>${esc(longDate(parseDay(thDate(m))))}</dd></div>` : ""}
          ${dgDate(m) ? `<div><dt>Streaming / digital</dt><dd>${esc(longDate(parseDay(dgDate(m))))}${ottHere(m).length ? ` · ${ottHere(m).map(esc).join(", ")}` : ""}</dd></div>`
            : ottHere(m).length ? `<div><dt>Streaming on</dt><dd>${ottHere(m).map(esc).join(", ")}</dd></div>` : ""}
          ${premiereOf(m) ? `<div><dt>Premiere</dt><dd>${esc(longDate(premiereOf(m).t))}${premiereOf(m).note ? ` · ${esc(premiereOf(m).note)}` : ""}</dd></div>` : ""}
          ${isRe(m) && m.originalDate ? `<div><dt>Original release</dt><dd>${esc(longDate(parseDay(m.originalDate)))}</dd></div>` : ""}
          ${m.lang ? `<div><dt>Language</dt><dd>${esc(languageName(m.lang))}${m.origin?.length ? ` · ${m.origin.map((c) => esc(countryName(c))).join(", ")}` : ""}</dd></div>` : ""}
          ${cert ? `<div><dt>Rating</dt><dd><span class="cert">${esc(cert)}</span></dd></div>` : ""}
          ${byline ? `<div><dt>Director</dt><dd>${byline}</dd></div>` : ""}
          ${m.genres?.length ? `<div><dt>Genre</dt><dd>${m.genres.map(esc).join(", ")}</dd></div>` : ""}
          ${m.runtime ? `<div><dt>Runtime</dt><dd>${Math.floor(m.runtime / 60)}h ${m.runtime % 60}m</dd></div>` : ""}
          ${cast.length ? `<div><dt>Starring</dt><dd>${cast.slice(0, 4).map((c) =>
            c.tmdb ? `<a href="${personHref(c.tmdb)}">${esc(c.actor)}</a>` : esc(c.actor)).join(", ")}</dd></div>` : ""}
        </dl>
        ${m.official ? `<div class="links"><a class="btn btn-ghost btn-sm" href="${esc(m.official)}" target="_blank" rel="noopener">Official site ↗</a></div>` : ""}
        ${isCustom ? `<button class="btn btn-ghost btn-sm" type="button" data-remove="${esc(m.id)}">Remove this countdown</button>` : ""}
      </section>

      <div class="rows">${row("row-more", "You Might Also Like", more)}</div>`;

    startEmbers($(".hero canvas"), m.hue);
    const castCanvas = $(".cast canvas");
    if (castCanvas) startEmbers(castCanvas, m.hue, 0.5);
  }

  // ---------- people ----------
  const peopleCache = new Map();
  function loadPerson(id) {
    if (!peopleCache.has(id)) {
      peopleCache.set(id, fetch(`data/people/${encodeURIComponent(id)}.json`)
        .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
        .catch((e) => { peopleCache.delete(id); throw e; }));
    }
    return peopleCache.get(id);
  }

  function creditInfo(f, personId) {
    const full = byTmdb.get(f.id);
    if (full) return { href: movieHref(full), t: time(full), title: title(full), poster: full.poster || f.poster, full };
    return {
      href: `#/film/${encodeURIComponent(f.id)}/${encodeURIComponent(personId)}`,
      t: f.date ? parseDay(f.date) : null, title: f.title, poster: f.poster, full: null,
    };
  }

  function pcard(f, personId) {
    const c = creditInfo(f, personId);
    const future = c.t === null || c.t > Date.now();
    return `
      <a class="pcard" href="${c.href}">
        <div class="pcard-art ${c.poster ? "has-img" : ""}" style="${bg(c.poster)}">
          ${c.poster ? "" : `<span>${esc(c.title)}</span>`}
          ${c.full && isRe(c.full) ? `<span class="tag tag-re">Re-release</span>` : ""}
        </div>
        <strong>${esc(c.title)}</strong>
        <span class="pcard-role">${esc(f.roles.join(", "))}</span>
        <span class="pcard-date">${c.t ? esc(shortDate(c.t)) : "Date TBA"}</span>
        ${future && c.t ? countdownAt(c.t, "cd-mini") : ""}
      </a>`;
  }

  const followBtn = (p) => follows[p.id]
    ? `<button class="btn btn-solid btn-sm follow on" type="button" data-follow="${p.id}">✓ Following</button>`
    : `<button class="btn btn-outline btn-sm follow" type="button" data-follow="${p.id}">＋ Follow</button>`;

  function age(birthday, end) {
    const b = new Date(birthday), e = end ? new Date(end) : new Date();
    let a = e.getFullYear() - b.getFullYear();
    if (e.getMonth() < b.getMonth() || (e.getMonth() === b.getMonth() && e.getDate() < b.getDate())) a--;
    return a;
  }

  function renderPersonPage(p) {
    document.title = `${p.name} — Countdown`;
    const now = Date.now();
    const credits = p.credits || [];
    const tOf = (f) => creditInfo(f, p.id).t;
    const upcomingCredits = credits.filter((f) => {
      const c = creditInfo(f, p.id);
      return (c.t === null || c.t > now) && !(c.full && isRe(c.full));
    }).sort((a, b) => (tOf(a) ?? Infinity) - (tOf(b) ?? Infinity));
    const backInCinemas = credits.filter((f) => { const m = byTmdb.get(f.id); return m && isRe(m) && visible(m); });
    const known = (p.knownFor || []).map((id) => credits.find((f) => f.id === id)).filter(Boolean);
    const past = credits.filter((f) => f.date && parseDay(f.date) <= now && !upcomingCredits.includes(f));
    const backdrop = credits.map((f) => byTmdb.get(f.id)?.backdrop).find(Boolean) || known.map((f) => f.backdrop).find(Boolean);

    const byYear = {};
    for (const f of credits) (byYear[f.date ? f.date.slice(0, 4) : "TBA"] ||= []).push(f);
    const years = Object.keys(byYear).sort((a, b) => (b === "TBA") - (a === "TBA") || b.localeCompare(a));

    const bio = (p.bio || "").split(/\n+/).filter(Boolean);
    const born = p.birthday ? `Born ${esc(longDate(parseDay(p.birthday)))}${p.deathday ? "" : ` (age ${age(p.birthday)})`}` : "";
    const died = p.deathday ? `Died ${esc(longDate(parseDay(p.deathday)))} (aged ${age(p.birthday, p.deathday)})` : "";
    const posters = (f) => pcard(f, p.id);

    app.innerHTML = `
      <header class="cine phero" style="${theme(p.hue)}">
        ${fireLayers(backdrop)}
        <div class="phero-body">
          <div class="pphoto ${p.photo ? "has-img" : ""}" style="${bg(p.photo)}">${p.photo ? "" : `<span>${esc(initials(p.name))}</span>`}</div>
          <div class="pinfo">
            ${p.dept ? `<p class="kicker">${esc(p.dept === "Acting" ? "Actor" : p.dept)}</p>` : ""}
            <h1 class="pname">${esc(p.name)}</h1>
            ${followBtn(p)}
            <p class="pmeta">${[born, died, p.place ? esc(p.place) : ""].filter(Boolean).join(" · ")}</p>
            <div class="pstats">
              <div><b>${credits.length}</b><span>Films</span></div>
              <div><b>${upcomingCredits.length}</b><span>Upcoming</span></div>
              ${backInCinemas.length ? `<div><b>${backInCinemas.length}</b><span>Back in cinemas</span></div>` : ""}
            </div>
            ${bio.length ? `
              <div class="pbio clamp">${bio.map((t) => `<p>${esc(t)}</p>`).join("")}</div>
              <button class="link more-bio" type="button">Read full biography</button>` : ""}
          </div>
        </div>
      </header>

      <div class="rows prows">
        ${row("p-upcoming", "Upcoming", upcomingCredits, posters, "rail-posters")}
        ${row("p-back", `Back in Cinemas · ${esc(countryName(COUNTRY))}`, backInCinemas, posters, "rail-posters")}
        ${row("p-known", "Known For", known, posters, "rail-posters")}
        ${row("p-past", "Latest Films", past.slice(0, 20), posters, "rail-posters")}
      </div>

      ${p.photos?.length > 1 ? `
      <section class="row gallery">
        <div class="row-head"><h2 class="row-title">Photos</h2></div>
        ${rail(p.photos, (u) => `<div class="gphoto" style="${bg(u)}"></div>`)}
      </section>` : ""}

      <section class="filmography">
        <h2 class="row-title">Filmography</h2>
        ${years.map((y) => `
          <div class="fy">
            <div class="fy-year">${y}</div>
            <ul>${byYear[y].map((f) => {
              const c = creditInfo(f, p.id);
              return `<li><a href="${c.href}">${esc(c.title)}</a><span>${esc(f.roles.join(", "))}</span></li>`;
            }).join("")}</ul>
          </div>`).join("")}
      </section>`;

    startEmbers($(".phero canvas"), p.hue, 0.6);
  }

  function renderFilmPage(p, f) {
    document.title = `${f.title} — Countdown`;
    const t = f.date ? parseDay(f.date) : null;
    const others = (p.credits || []).filter((x) => x.id !== f.id && x.poster).slice(0, 20);
    app.innerHTML = `
      <header class="cine hero" style="${theme(p.hue)}">
        ${fireLayers(f.backdrop || f.poster, orb)}
        <div class="hero-body">
          <p class="byline">${t ? esc(t > Date.now() ? "Coming " + longDate(t) : "Released " + longDate(t)) : "Release date TBA"}</p>
          <h1 class="mega" style="--len:${longestWord(f.title)}">${esc(f.title)}</h1>
          <p class="tagline">${esc(p.name)} · ${esc(f.roles.join(", "))}</p>
          ${t && t > Date.now() ? countdownAt(t, "cd-hero") : ""}
          <div class="cta cta-center"><a class="btn btn-outline" href="${personHref(p.id)}">← ${esc(p.name)}</a></div>
        </div>
      </header>
      <section class="about">
        <div>
          <p class="kicker">About the film</p>
          <p class="about-text">${esc(f.overview || "No description available yet.")}</p>
        </div>
        <dl class="facts">
          <div><dt>Release</dt><dd>${t ? esc(longDate(t)) : "TBA"}</dd></div>
          <div><dt>${esc(p.name)}</dt><dd>${esc(f.roles.join(", "))}</dd></div>
        </dl>
      </section>
      <div class="rows">${row("f-more", `More with ${esc(p.name)}`, others, (x) => pcard(x, p.id), "rail-posters")}</div>`;
    startEmbers($(".hero canvas"), p.hue, 0.7);
  }

  function renderMessage(heading, text) {
    app.innerHTML = `<section class="empty-state"><h1>${esc(heading)}</h1><p>${esc(text)}</p>
      <p><a class="btn btn-solid" href="#/">Back to home</a></p></section>`;
  }

  // ---------- search ----------
  const searchDlg = $("#search");
  const searchInput = $("#searchInput");
  const searchResults = $("#searchResults");
  let peopleIndex = null;
  let searchFilter = "all";
  const norm = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");

  function openSearch() {
    if (!searchDlg.open) searchDlg.showModal();
    searchInput.select();
    if (!peopleIndex) {
      peopleIndex = [];
      fetch("data/people-index.json").then((r) => (r.ok ? r.json() : [])).then((list) => {
        peopleIndex = list.map(([id, name, photo, dept]) => ({ id, name, photo: photo ? `${IMG}/w185${photo}` : null, dept, n: norm(name) }));
        runSearch();
      }).catch(() => {});
    }
    runSearch();
  }

  function runSearch() {
    const raw = searchInput.value.trim();
    if (searchFilter === "anime") {
      searchResults.innerHTML = raw.length < 2 ? `<p class="search-empty">Search anime on AniList — e.g. Frieren, One Piece.</p>` : `<div id="animeResults"></div>`;
      if (raw.length >= 2) animeSearchInto(raw, $("#animeResults"));
      return;
    }
    const q = norm(searchInput.value.trim());
    if (!q) {
      const pick = anticipated().slice(0, 8);
      searchResults.innerHTML = `<p class="search-label">Most anticipated ${isWorld() ? "worldwide" : `in ${esc(countryName(COUNTRY))}`}</p>${pick.map(searchMovie).join("")}`;
      return;
    }
    const words = q.split(/\s+/);
    const score = (hay, extra = "") => {
      const h = norm(hay), x = norm(extra);
      if (!words.every((w) => h.includes(w) || x.includes(w))) return 0;
      return (h.startsWith(q) ? 3 : h.includes(q) ? 2 : 1);
    };
    const f = searchFilter;
    const isDirector = (p) => p.dept === "Directing";
    const isActor = (p) => p.dept === "Acting";
    let movies = f === "actors" || f === "directors" ? [] : all().map((m) => {
      const s = Math.max(
        score(title(m)), score(m.title), score(m.originalTitle || ""),
        score([title(m), m.originalTitle, m.title].join(" "), [m.director, ...(m.people || []), ...(m.genres || []), languageName(m.lang || "")].join(" ")) * 0.5,
      );
      return [s, m];
    }).filter(([s]) => s > 0).sort((a, b) => b[0] - a[0] || byDate(a[1], b[1])).slice(0, 12).map(([, m]) => m);
    const people = f === "movies" ? [] : (peopleIndex || [])
      .filter((p) => (f === "directors" ? isDirector(p) : f === "actors" ? isActor(p) : true))
      .filter((p) => words.every((w) => p.n.includes(w)))
      .sort((a, b) => b.n.startsWith(q) - a.n.startsWith(q)).slice(0, 12);

    // With the Actors / Directors filter, also list their films on our countdown list.
    let label = "Movies";
    if (f === "actors" || f === "directors") {
      const field = (m) => (f === "directors" ? [m.director || ""] : m.people || []);
      movies = all().filter((m) => field(m).some((n) => words.every((w) => norm(n).includes(w)))).sort(byDate).slice(0, 12);
      label = f === "directors" ? "Directed by" : "Starring";
    }

    searchResults.innerHTML = `
      ${people.length ? `<p class="search-label">${f === "directors" ? "Directors" : f === "actors" ? "Actors" : "People"}</p><div class="search-people">${people.map((p) => `
        <a class="sp" href="${personHref(p.id)}">
          <span class="sp-photo" style="${bg(p.photo)}">${p.photo ? "" : esc(initials(p.name))}</span>
          <strong>${esc(p.name)}</strong><span>${esc(p.dept === "Acting" ? "Actor" : p.dept === "Directing" ? "Director" : p.dept || "")}</span>
        </a>`).join("")}</div>` : ""}
      ${movies.length ? `<p class="search-label">${label}</p>${movies.map(searchMovie).join("")}` : ""}
      ${f === "all" ? `<div id="animeResults"></div>` : ""}
      ${!movies.length && !people.length && f !== "all" ? `<p class="search-empty">No results for “${esc(searchInput.value)}”.</p>` : ""}`;
    if (f === "all") animeSearchInto(searchInput.value.trim(), $("#animeResults"));
  }

  function searchMovie(m) {
    const orig = origTitle(m);
    return `
      <a class="sm" href="${movieHref(m)}">
        <span class="sm-poster" style="${bg(m.poster)}"></span>
        <span class="sm-body">
          <strong>${esc(title(m))}</strong>
          ${orig ? `<span class="sm-orig">${esc(orig)}</span>` : ""}
          <span class="sm-meta">${esc(shortDate(time(m)))}${m.lang ? ` · ${esc(languageName(m.lang))}` : ""}${m.people?.length ? ` · ${m.people.slice(0, 2).map(esc).join(", ")}` : ""}</span>
        </span>
        <span class="sm-cd">${isOut(m) ? `<span class="muted small">${isRe(m) ? "Back in cinemas" : "Out now"}</span>` : `${Math.ceil((time(m) - Date.now()) / DAY)}<small>days</small>`}</span>
      </a>`;
  }

  searchInput.addEventListener("input", runSearch);
  $("#searchFilters").addEventListener("click", (e) => {
    const b = e.target.closest("[data-filter]");
    if (!b) return;
    searchFilter = b.dataset.filter;
    $$("#searchFilters button").forEach((x) => x.classList.toggle("active", x === b));
    searchInput.placeholder = { all: "Search movies, actors, directors, languages…", movies: "Search movie titles…",
      actors: "Search actors…", directors: "Search directors…", anime: "Search anime on AniList…" }[searchFilter];
    searchInput.focus();
    runSearch();
  });
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { const first = $("a", searchResults); if (first) { location.hash = first.getAttribute("href"); searchDlg.close(); } }
  });
  searchResults.addEventListener("click", (e) => { if (e.target.closest("a")) searchDlg.close(); });
  searchDlg.addEventListener("click", (e) => { if (e.target === searchDlg) searchDlg.close(); });
  $("#searchBtn").addEventListener("click", openSearch);
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && !/input|textarea|select/i.test(document.activeElement?.tagName || "") && !searchDlg.open) {
      e.preventDefault(); openSearch();
    }
  });


  // =====================================================================
  // Release types: cinema, streaming (OTT), premieres, trailers
  // =====================================================================
  const earliest = (map) => (map ? Object.values(map).sort()[0] || null : null);
  const thDate = (m) => (isWorld() ? earliest(m.th) : m.th?.[COUNTRY]) || null;
  const dgDate = (m) => (isWorld() ? earliest(m.dg) : m.dg?.[COUNTRY]) || null;
  const ottHere = (m) => (isWorld() ? [...new Set(Object.values(m.ott || {}).flat())] : m.ott?.[COUNTRY] || []).slice(0, 4);
  const premiereOf = (m) => (m.premiere ? { t: parseDay(m.premiere[0]), note: m.premiere[1], cc: m.premiere[2] } : null);
  const isRegional = (m) => (isWorld() ? m.lang && m.lang !== "en" : !!m.origin?.includes(COUNTRY) && m.lang !== "en");

  const TYPES = {
    cinema: { icon: "🎬", label: "In cinemas" },
    rerelease: { icon: "🔁", label: "Back in cinemas" },
    stream: { icon: "📺", label: "Streaming" },
    premiere: { icon: "🌟", label: "Premiere" },
    trailer: { icon: "▶", label: "New trailer" },
    milestone: { icon: "⏳", label: "Countdown" },
  };

  // Every dated event for one movie, in the visitor's country.
  function eventsFor(m, withTrailers = true) {
    const ev = [];
    const th = thDate(m), dg = dgDate(m);
    if (th) ev.push({ type: isRe(m) ? "rerelease" : "cinema", t: parseDay(th), m });
    if (dg) {
      const names = ottHere(m);
      ev.push({ type: "stream", t: parseDay(dg), m, label: names.length ? `Streaming on ${names.join(", ")}` : "Streaming / digital release" });
    }
    if (!th && !dg && visible(m)) ev.push({ type: isRe(m) ? "rerelease" : "cinema", t: time(m), m, worldwide: !datedHere(m) });
    const pr = premiereOf(m);
    if (pr && !isRe(m)) ev.push({ type: "premiere", t: pr.t, m, label: pr.note ? `Premiere · ${pr.note}` : `Premiere in ${countryName(pr.cc)}` });
    if (withTrailers && m.trailerDate) ev.push({ type: "trailer", t: parseDay(m.trailerDate), m });
    return ev;
  }
  const evLabel = (e) => e.label || (e.type === "cinema" && e.worldwide ? "Worldwide release" : TYPES[e.type].label);

  // =====================================================================
  // Personal lists: waiting room + followed people (stored in this browser)
  // =====================================================================
  const WAIT_KEY = "movie-countdown:waiting";
  const FOLLOW_KEY = "movie-countdown:follow";
  const readJSON = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || "") || d; } catch (_) { return d; } };
  const writeJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* ignore */ } };
  let waiting = readJSON(WAIT_KEY, {});   // movie id -> joined timestamp
  let follows = readJSON(FOLLOW_KEY, {}); // person id -> { name, photo, dept }
  const isWaiting = (m) => !!waiting[m.id];
  const waitingMovies = () => all().filter(isWaiting).sort(byDate);
  const followedNames = () => new Set(Object.values(follows).map((p) => norm(p.name)));
  const byFollowed = (m) => {
    const names = followedNames();
    if (!names.size) return false;
    return [m.director || "", ...(m.people || [])].some((n) => n.split(" & ").some((x) => names.has(norm(x))));
  };

  function toggleWaiting(m) {
    if (isWaiting(m)) { delete waiting[m.id]; toast("Left the waiting room"); }
    else { waiting[m.id] = Date.now(); toast(`You're in the waiting room for ${title(m)}`); }
    writeJSON(WAIT_KEY, waiting);
  }
  function toggleFollow(p) {
    if (follows[p.id]) { delete follows[p.id]; toast(`Unfollowed ${p.name}`); }
    else { follows[p.id] = { name: p.name, photo: p.thumb || p.photo || null, dept: p.dept || "" }; toast(`Following ${p.name} — their films appear in your feed`); }
    writeJSON(FOLLOW_KEY, follows);
  }
  const waitBtn = (m, cls = "btn btn-ghost") => isWaiting(m)
    ? `<a class="${cls} joined" href="#/wait/${encodeURIComponent(m.id)}">⏳ Enter waiting room</a>`
    : `<button class="${cls}" type="button" data-wait="${esc(m.id)}">⏳ Join waiting room</button>`;

  // =====================================================================
  // Poster grid card (Browse pages)
  // =====================================================================
  function gridCard(m, e) {
    const t = e ? e.t : time(m);
    const names = ottHere(m);
    return `
      <a class="gcard" href="${movieHref(m)}" style="${theme(m.hue)}">
        <div class="gcard-art" style="${bg(m.poster || m.card)}">
          ${e ? `<span class="tag tag-type t-${e.type}">${TYPES[e.type].icon} ${esc(e.type === "stream" && names.length ? names[0] : TYPES[e.type].label)}</span>` : ""}
          ${m.lang && m.lang !== "en" ? `<span class="tag tag-lang">${esc(languageName(m.lang))}</span>` : ""}
        </div>
        <strong>${esc(title(m))}</strong>
        ${origTitle(m) ? `<span class="gcard-orig">${esc(origTitle(m))}</span>` : ""}
        <span class="gcard-meta">${esc(shortDate(t))}${m.certs?.[COUNTRY] ? ` · ${esc(m.certs[COUNTRY])}` : ""}</span>
        ${e?.type === "premiere" && e.label ? `<span class="gcard-note">${esc(e.label.replace(/^Premiere · /, ""))}</span>` : ""}
        ${countdownAt(t, "cd-mini", e?.type === "stream" ? "Streaming now" : e?.type === "premiere" ? "Premiered" : "Out now")}
      </a>`;
  }
  const gridSection = (heading, items, extra = "") => (items.length ? `
    <section class="gsection"><div class="row-head"><h2 class="row-title">${heading}</h2>${extra}</div>
      <div class="ggrid">${items.map(([m, e]) => gridCard(m, e)).join("")}</div></section>` : "");

  // =====================================================================
  // Browse: Theatrical · OTT · Premieres · Regional · Watchlist
  // =====================================================================
  const BROWSE_TABS = [
    ["theatrical", "🎬 Theatrical"], ["ott", "📺 OTT"], ["premieres", "🌟 Premieres"],
    ["regional", "🗺 Regional"], ["watchlist", "⭐ My Watchlist"],
  ];
  let browseSub = "";

  function renderBrowse(tab = "theatrical", sub = "") {
    if (!BROWSE_TABS.some(([k]) => k === tab)) tab = "theatrical";
    browseSub = sub;
    document.title = `${BROWSE_TABS.find(([k]) => k === tab)[1].replace(/^\S+ /, "")} — Countdown`;
    const now = Date.now(), today = startOfDay();
    const inHere = isWorld() ? "worldwide" : `in ${esc(countryName(COUNTRY))}`;
    const pairs = (type) => listed().flatMap((m) => eventsFor(m, false).filter((e) => e.type === type).map((e) => [m, e]));
    let body = "", chips = "";

    if (tab === "theatrical") {
      const ev = [...pairs("cinema"), ...pairs("rerelease")].filter(([, e]) => !e.worldwide);
      body = gridSection(`Coming to cinemas ${inHere}`, ev.filter(([, e]) => e.t >= today).sort((a, b) => a[1].t - b[1].t)) +
        gridSection(`In cinemas now ${inHere}`, ev.filter(([, e]) => e.t < today && e.t > now - 35 * DAY).sort((a, b) => b[1].t - a[1].t));
    }

    if (tab === "ott") {
      const ev = pairs("stream");
      const withProv = listed().filter((m) => ottHere(m).length);
      const counts = {};
      for (const m of new Set([...ev.map(([m]) => m), ...withProv])) for (const n of ottHere(m)) counts[n] = (counts[n] || 0) + 1;
      const provs = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([n]) => n);
      chips = `<div class="chips browse-chips">
        <a class="${!sub ? "active" : ""}" href="#/browse/ott">All services</a>
        ${provs.map((n) => `<a class="${sub === n ? "active" : ""}" href="#/browse/ott/${encodeURIComponent(n)}">${esc(n)}</a>`).join("")}
      </div>`;
      const match = (m) => !sub || ottHere(m).includes(sub);
      const upcomingStream = ev.filter(([m, e]) => e.t >= today && match(m)).sort((a, b) => a[1].t - b[1].t);
      const nowStreaming = [
        ...ev.filter(([m, e]) => e.t < today && match(m)).sort((a, b) => b[1].t - a[1].t),
        ...withProv.filter((m) => match(m) && !ev.some(([x]) => x === m)).map((m) => [m, { type: "stream", t: parseDay(dgDate(m) || m.date), m }]),
      ];
      body = gridSection(`Coming to streaming ${inHere}${sub ? ` · ${esc(sub)}` : ""}`, upcomingStream) +
        gridSection(`Streaming now ${inHere}${sub ? ` · ${esc(sub)}` : ""}`, nowStreaming.slice(0, 40)) +
        (!upcomingStream.length && !nowStreaming.length ? `<div class="cal-empty">No streaming releases on our list ${inHere} yet.</div>` : "") +
        `<p class="muted small browse-note">Streaming services come from TMDB / JustWatch and are usually listed once a film is available. Dates are the digital release in your country.</p>`;
    }

    if (tab === "premieres") {
      const ev = pairs("premiere");
      body = gridSection("Upcoming premieres", ev.filter(([, e]) => e.t >= today).sort((a, b) => a[1].t - b[1].t)) +
        gridSection("Recent premieres", ev.filter(([, e]) => e.t < today && e.t > now - 120 * DAY).sort((a, b) => b[1].t - a[1].t)) +
        `<p class="muted small browse-note">World premieres and festival screenings (Venice, Toronto, Cannes, Busan…) — usually before the public release.</p>`;
    }

    if (tab === "regional") {
      const films = upcoming().filter(isRegional);
      const langs = {};
      for (const m of films) langs[m.lang] = (langs[m.lang] || 0) + 1;
      const order = Object.entries(langs).sort((a, b) => b[1] - a[1]).map(([l]) => l);
      chips = `<div class="chips browse-chips">
        <a class="${!sub ? "active" : ""}" href="#/browse/regional">All languages</a>
        ${order.map((l) => `<a class="${sub === l ? "active" : ""}" href="#/browse/regional/${l}">${esc(languageName(l))} <small>${langs[l]}</small></a>`).join("")}
      </div>`;
      const pick = films.filter((m) => !sub || m.lang === sub).map((m) => [m, null]);
      const heading = isWorld() ? "World cinema — films not in English" : `Regional cinema from ${esc(countryName(COUNTRY))}`;
      body = gridSection(`${heading}${sub ? ` · ${esc(languageName(sub))}` : ""}`, pick) ||
        `<div class="cal-empty">No upcoming local-language films on our list for ${esc(countryName(COUNTRY))} yet.</div>`;
    }

    if (tab === "watchlist") {
      const wm = waitingMovies();
      const people = Object.entries(follows);
      body = `
        ${wm.length ? gridSection("⏳ Your waiting room", wm.map((m) => [m, null]))
          : `<div class="empty-card"><h3>⏳ Your waiting room is empty</h3><p>Open any movie and tap <b>Join waiting room</b> to count down together with its own page.</p></div>`}
        <section class="gsection">
          <div class="row-head"><h2 class="row-title">Directors &amp; actors you follow</h2></div>
          ${people.length ? `<div class="follow-list">${people.map(([id, p]) => `
            <a class="sp" href="${personHref(id)}">
              <span class="sp-photo" style="${bg(p.photo)}">${p.photo ? "" : esc(initials(p.name))}</span>
              <strong>${esc(p.name)}</strong><span>${esc(p.dept === "Directing" ? "Director" : p.dept === "Acting" ? "Actor" : p.dept)}</span>
            </a>`).join("")}</div>`
            : `<div class="empty-card"><h3>Follow your favourite directors and actors</h3><p>Open anyone's profile and tap <b>＋ Follow</b>. Their upcoming films show up here and in your feed.</p>
                <button class="btn btn-solid btn-sm" type="button" data-open-search>🔍 Find people</button></div>`}
        </section>
        <div id="followFilms">${people.length ? `<div class="loading-strip"><div class="spinner"></div></div>` : ""}</div>`;
    }

    app.innerHTML = `
      <section class="browse">
        <header class="browse-head">
          <p class="kicker">Browse · ${esc(countryName(COUNTRY))}</p>
          <h1 class="cal-title">${esc(BROWSE_TABS.find(([k]) => k === tab)[1].replace(/^\S+ /, ""))}</h1>
          ${scopeSwitch()}
        </header>
        <nav class="tabs">${BROWSE_TABS.map(([k, label]) => `<a class="${k === tab ? "active" : ""}" href="#/browse/${k}">${label}</a>`).join("")}</nav>
        ${chips}
        ${body}
      </section>`;

    if (tab === "watchlist" && Object.keys(follows).length) loadFollowedFilms();
  }

  // Upcoming films of everyone you follow (loads their profiles).
  async function loadFollowedFilms() {
    const token = routeToken;
    const people = await Promise.all(Object.keys(follows).map((id) => loadPerson(id).catch(() => null)));
    if (token !== routeToken) return;
    const seen = new Set(), items = [];
    for (const p of people.filter(Boolean)) {
      for (const f of p.credits || []) {
        const c = creditInfo(f, p.id);
        if ((c.t === null || c.t > Date.now()) && !seen.has(f.id)) { seen.add(f.id); items.push({ f, p, c }); }
      }
    }
    items.sort((a, b) => (a.c.t ?? Infinity) - (b.c.t ?? Infinity));
    const el = $("#followFilms");
    if (!el) return;
    el.innerHTML = items.length ? `
      <section class="gsection"><div class="row-head"><h2 class="row-title">Their upcoming films</h2></div>
        <div class="ggrid">${items.slice(0, 60).map(({ f, p }) => pcard(f, p.id).replace('class="pcard"', 'class="pcard in-grid"')).join("")}</div></section>`
      : `<div class="empty-card"><p>No upcoming films announced yet for the people you follow.</p></div>`;
  }

  // =====================================================================
  // Feed: what's coming next
  // =====================================================================
  const FEED_FILTERS = [["all", "All"], ["foryou", "⭐ For you"], ["cinema", "🎬 Cinemas"], ["stream", "📺 Streaming"], ["premiere", "🌟 Premieres"], ["trailer", "▶ Trailers"]];
  const relTime = (t) => {
    const d = Math.round((startOfDay(t) - startOfDay()) / DAY);
    try {
      return new Intl.RelativeTimeFormat(LANG, { numeric: "auto" }).format(d, "day");
    } catch (_) { return d === 0 ? "today" : d > 0 ? `in ${d} days` : `${-d} days ago`; }
  };

  function renderFeed(filter = "all") {
    document.title = "Feed — Countdown";
    const now = Date.now(), today = startOfDay();
    const from = today - 14 * DAY, to = today + 180 * DAY;
    let events = [];
    for (const m of listed()) {
      for (const e of eventsFor(m)) {
        if (e.t < from || e.t > to) continue;
        if (e.type === "trailer" && e.t > now) continue;
        e.mine = isWaiting(m) || byFollowed(m);
        events.push(e);
      }
      // Milestones for films in your waiting room.
      if (isWaiting(m) && !isOut(m)) {
        for (const d of [100, 50, 30, 14, 7, 3, 1]) {
          const t = time(m) - d * DAY;
          if (t >= from && t <= to) events.push({ type: "milestone", t, m, mine: true, label: `${d} ${d === 1 ? "day" : "days"} to go` });
        }
      }
    }
    if (filter === "foryou") events = events.filter((e) => e.mine);
    else if (filter !== "all") events = events.filter((e) => e.type === filter || (filter === "cinema" && e.type === "rerelease"));

    const rank = (e) => e.m.hot?.[rankKey()] || 999;
    const buckets = [
      ["Just dropped", (e) => e.t < today, (a, b) => b.t - a.t],
      ["Today", (e) => e.t >= today && e.t < today + DAY],
      ["Tomorrow", (e) => e.t >= today + DAY && e.t < today + 2 * DAY],
      ["This week", (e) => e.t >= today + 2 * DAY && e.t < today + 7 * DAY],
      ["This month", (e) => e.t >= today + 7 * DAY && e.t < today + 30 * DAY],
      ["Coming up", (e) => e.t >= today + 30 * DAY],
    ];
    const mineCount = events.filter((e) => e.mine).length;

    const item = (e) => {
      const m = e.m;
      return `
        <article class="feed-item ${e.mine ? "mine" : ""}" style="${theme(m.hue)}">
          <span class="fi-icon t-${e.type}">${TYPES[e.type].icon}</span>
          <a class="fi-poster" href="${movieHref(m)}" style="${bg(m.poster || m.card)}" aria-label="${esc(title(m))}"></a>
          <div class="fi-body">
            <p class="fi-when">${esc(relTime(e.t))} · ${esc(shortDate(e.t))}${e.mine ? ` · <span class="fi-mine">${isWaiting(m) ? "In your waiting room" : "From people you follow"}</span>` : ""}</p>
            <a class="fi-title" href="${movieHref(m)}">${esc(title(m))}</a>
            <p class="fi-label">${esc(evLabel(e))}${m.lang && m.lang !== "en" ? ` · ${esc(languageName(m.lang))}` : ""}${rank(e) <= 10 ? ` · 🔥 #${rank(e)} most anticipated` : ""}</p>
            <div class="fi-actions">
              ${e.type === "trailer" ? `<button class="btn btn-solid btn-sm" type="button" data-trailer="${esc(m.id)}">▶ Watch trailer</button>` : ""}
              ${e.type === "stream" && e.t < now ? "" : e.t > now ? countdownAt(e.t, "cd-mini") : ""}
              ${!isOut(m) ? waitBtn(m, "btn btn-ghost btn-sm") : ""}
            </div>
          </div>
        </article>`;
    };

    const sections = buckets.map(([name, test, sort]) => {
      const list = events.filter(test).sort(sort || ((a, b) => a.t - b.t || (b.mine - a.mine) || rank(a) - rank(b)));
      return list.length ? `<h2 class="feed-bucket">${name} <span>${list.length}</span></h2>${list.slice(0, name === "Coming up" ? 40 : 60).map(item).join("")}` : "";
    }).join("");

    app.innerHTML = `
      <section class="feed">
        <header class="browse-head">
          <p class="kicker">What's next · ${esc(countryName(COUNTRY))}</p>
          <h1 class="cal-title">Your feed</h1>
          ${scopeSwitch()}
        </header>
        <div class="chips browse-chips">${FEED_FILTERS.map(([k, label]) =>
          `<a class="${k === filter ? "active" : ""}" href="#/feed${k === "all" ? "" : "/" + k}">${label}${k === "foryou" && mineCount ? ` <small>${mineCount}</small>` : ""}</a>`).join("")}</div>
        ${filter === "foryou" && !mineCount ? `<div class="empty-card"><h3>Make this feed yours</h3>
          <p>Join a movie's <b>waiting room</b> or <b>follow</b> directors and actors — their releases, trailers and countdown milestones appear here.</p>
          <a class="btn btn-solid btn-sm" href="#/browse/watchlist">⭐ My Watchlist</a></div>` : ""}
        <div class="feed-list">${sections || (filter === "foryou" ? "" : `<div class="cal-empty">Nothing here yet.</div>`)}</div>
      </section>`;
  }

  // =====================================================================
  // Waiting room
  // =====================================================================
  let slideTimer = null;
  function renderWaitingRoom(m, token) {
    document.title = `Waiting for ${title(m)} — Countdown`;
    if (m.tmdb && !m._loaded) loadDetail(m).then(() => { if (token === routeToken) renderWaitingRoom(m, token); });
    const joined = waiting[m.id];
    const t = time(m), now = Date.now();
    const out = t <= now;
    const start = joined || now;
    const pct = out ? 100 : Math.max(0, Math.min(100, ((now - start) / Math.max(1, t - start)) * 100));
    const daysWaited = joined ? Math.floor((now - joined) / DAY) : 0;
    const left = Math.ceil((t - now) / DAY);
    const slides = (m.artwork?.backdrops || []).slice(0, 8).map(([p]) => `${IMG}/w1280${p}`);
    if (!slides.length && m.backdrop) slides.push(m.backdrop);
    const milestones = [100, 50, 30, 14, 7, 3, 1].filter((d) => t - d * DAY > (joined || now) - 365 * DAY);

    app.innerHTML = `
      <section class="wroom cine" style="${theme(m.hue)}">
        <div class="wr-slides" aria-hidden="true">${slides.map((u, i) => `<div class="wr-slide ${i === 0 ? "on" : ""}" style="${bg(u)}"></div>`).join("")}</div>
        ${fireLayers(null, orb)}
        <div class="wr-body">
          <p class="kicker">⏳ Waiting room</p>
          ${m.logo && !TR[m.tmdb]?.title ? `<img class="wr-logo" src="${esc(m.logo)}" alt="${esc(title(m))}">` : `<h1 class="mega" style="--len:${longestWord(title(m))}">${esc(title(m))}</h1>`}
          <p class="tagline">${out ? "🎉 It's here!" : `${esc(isRe(m) ? "Back in cinemas" : "Releases")} ${esc(longDate(t))}${datedHere(m) ? ` in ${esc(countryName(COUNTRY))}` : ""}`}</p>
          ${out ? `<div class="wr-out">The wait is over. Enjoy the movie!</div>` : countdownAt(t, "cd-hero")}
          <div class="wr-progress" role="progressbar" aria-valuenow="${Math.round(pct)}" aria-valuemin="0" aria-valuemax="100">
            <div class="wr-bar"><span style="width:${pct.toFixed(1)}%"></span></div>
            <p>${joined ? `You joined ${daysWaited === 0 ? "today" : `${plural(daysWaited, "day", "days")} ago`} · ${Math.round(pct)}% of your wait done` : "Join to track your wait"}${!out ? ` · ${plural(left, "day", "days")} to go` : ""}</p>
          </div>
          ${!out ? `<div class="wr-miles">${milestones.map((d) => `<span class="${left <= d ? "done" : ""}">${left <= d ? "✓ " : ""}${d} ${d === 1 ? "day" : "days"}</span>`).join("")}</div>` : ""}
          <div class="cta cta-center">
            ${out ? ticketBtn(m, "btn btn-solid") : ""}
            ${trailerBtn(m)}
            <button class="btn btn-outline" type="button" data-share="${esc(m.id)}">↗ Invite friends</button>
            ${joined ? "" : `<button class="btn btn-solid" type="button" data-wait="${esc(m.id)}">⏳ Join this waiting room</button>`}
          </div>
          <div class="hero-links">
            <button class="link" type="button" data-ics="${esc(m.id)}">＋ Add release day to calendar</button>
            ${"Notification" in window && !out ? `<button class="link" type="button" data-notify="${esc(m.id)}">🔔 Alert me at release (keep this page open)</button>` : ""}
            <a class="link" href="${movieHref(m)}">ⓘ Movie details</a>
            ${joined ? `<button class="link" type="button" data-wait="${esc(m.id)}">Leave waiting room</button>` : ""}
          </div>
        </div>
      </section>`;
    startEmbers($(".wroom canvas"), m.hue, 0.9);
    clearInterval(slideTimer);
    if (slides.length > 1) {
      let i = 0;
      slideTimer = setInterval(() => {
        const els = $$(".wr-slide");
        if (!els.length) return clearInterval(slideTimer);
        els[i].classList.remove("on"); i = (i + 1) % els.length; els[i].classList.add("on");
      }, 7000);
    }
  }

  async function shareMovie(m) {
    const url = `${location.origin}${location.pathname}#/wait/${encodeURIComponent(m.id)}`;
    const text = `⏳ ${title(m)} — ${isOut(m) ? "out now" : `${Math.ceil((time(m) - Date.now()) / DAY)} days to go`}! Join the waiting room:`;
    try {
      if (navigator.share) await navigator.share({ title: title(m), text, url });
      else { await navigator.clipboard.writeText(`${text} ${url}`); toast("Link copied — share it with friends"); }
    } catch (_) { /* cancelled */ }
  }

  // Release-time alert while the page is open.
  const alerts = new Set();
  async function armAlert(m) {
    if (!("Notification" in window)) return;
    const perm = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
    if (perm !== "granted") return toast("Notifications are blocked in this browser");
    alerts.add(m.id);
    toast("We'll alert you the moment it releases — keep this tab open");
  }
  setInterval(() => {
    for (const id of alerts) {
      const m = all().find((x) => x.id === id);
      if (m && isOut(m)) {
        alerts.delete(id);
        try { new Notification(`${title(m)} is out now! 🎉`, { body: "Your wait is over.", icon: m.poster || undefined }); } catch (_) { /* ignore */ }
      }
    }
  }, 1000);


  // =====================================================================
  // Explore hub
  // =====================================================================
  const EXPLORE = [
    ["#/history", "📜", "Release history", "See what launched on any date in film history."],
    ["#/history/today", "🗓", "On this day", "Famous films released on this day in previous years."],
    ["#/delays", "⏰", "Delayed releases", "Postponed films and their new dates."],
    ["#/rankings", "🔥", "Anticipation rankings", "The most-followed upcoming releases, with daily movement."],
    ["#/clashes", "⚔", "Release clashes", "Big films opening on the same day."],
    ["#/global", "🌍", "Global release comparison", "Compare release dates between countries."],
    ["surprise", "🎲", "Surprise me", "Discover a random upcoming release."],
  ];
  function renderExplore() {
    document.title = "Explore — Countdown";
    app.innerHTML = `
      <section class="browse">
        <header class="browse-head"><p class="kicker">Explore</p><h1 class="cal-title">Explore</h1>${scopeSwitch()}</header>
        <div class="explore-grid">
          ${EXPLORE.map(([href, icon, name, text]) => href === "surprise"
            ? `<button class="xtile" type="button" data-surprise><span class="xi">${icon}</span><strong>${name}</strong><span>${text}</span></button>`
            : `<a class="xtile" href="${href}"><span class="xi">${icon}</span><strong>${name}</strong><span>${text}</span></a>`).join("")}
        </div>
        <p class="muted small">Albums and games aren't covered yet — Countdown's data source (TMDB) is film-only.</p>
      </section>`;
  }
  const pageHead = (kicker, heading, extra = "") => `
    <header class="browse-head"><p class="kicker">${kicker}</p><h1 class="cal-title">${heading}</h1>${extra}</header>
    <nav class="tabs xtabs">${EXPLORE.filter(([h]) => h !== "#/history/today").map(([href, icon, name]) => href === "surprise"
      ? `<button type="button" data-surprise>${icon} ${name}</button>`
      : `<a class="${location.hash.startsWith(href) ? "active" : ""}" href="${href}">${icon} ${name}</a>`).join("")}</nav>`;

  // =====================================================================
  // Release history / On this day (film archive by month)
  // =====================================================================
  const historyCache = new Map();
  const loadHistoryMonth = (mm) => {
    if (!historyCache.has(mm)) {
      historyCache.set(mm, fetch(`data/history/${mm}.json`).then((r) => (r.ok ? r.json() : [])).catch(() => { historyCache.delete(mm); return []; }));
    }
    return historyCache.get(mm);
  };
  const MILESTONE_YEARS = new Set([5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 100]);
  function historyCard([id, name, date, poster, lang], showDate = false) {
    const years = new Date().getFullYear() - +date.slice(0, 4);
    const full = byTmdb.get(id);
    const inner = `
      <div class="gcard-art" style="${bg(`${IMG}/w342${poster}`)}">
        ${MILESTONE_YEARS.has(years) ? `<span class="tag tag-anniv">🎉 ${years} years</span>` : ""}
        ${lang && lang !== "en" ? `<span class="tag tag-lang">${esc(languageName(lang))}</span>` : ""}
      </div>
      <strong>${esc(name)}</strong>
      <span class="gcard-meta">${showDate ? esc(longDate(parseDay(date))) : `${date.slice(0, 4)} · ${plural(years, "year", "years")} ago`}</span>`;
    return full ? `<a class="gcard" href="${movieHref(full)}">${inner}</a>` : `<div class="gcard">${inner}</div>`;
  }
  async function renderHistory(key, token) {
    const today = new Date();
    let md = key && /^\d{2}-\d{2}$/.test(key) ? key : `${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    const isToday = !key || key === "today" || md === `${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    const label = new Date(2000, +md.slice(0, 2) - 1, +md.slice(3)).toLocaleDateString(LANG, { month: "long", day: "numeric" });
    document.title = `${isToday ? "On this day" : "Released on " + label} — Countdown`;
    app.innerHTML = `<section class="browse">${pageHead(isToday ? "This day in entertainment" : "Release history", isToday ? `On this day · ${esc(label)}` : `Released on ${esc(label)}`)}
      <div class="loading-strip"><div class="spinner"></div></div></section>`;
    const list = (await loadHistoryMonth(md.slice(0, 2))).filter((r) => r[2].slice(5) === md);
    if (token !== routeToken) return;
    const d = new Date(2000, +md.slice(0, 2) - 1, +md.slice(3));
    const shift = (n) => { const x = new Date(2000, d.getMonth(), d.getDate() + n); return `${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };
    const byDecade = {};
    for (const r of list) (byDecade[`${r[2].slice(0, 3)}0s`] ||= []).push(r);
    const anniv = list.filter((r) => MILESTONE_YEARS.has(today.getFullYear() - +r[2].slice(0, 4)));
    app.innerHTML = `
      <section class="browse">
        ${pageHead(isToday ? "This day in entertainment" : "Release history", isToday ? `On this day · ${esc(label)}` : `Released on ${esc(label)}`)}
        <div class="hist-controls">
          <a class="round" href="#/history/${shift(-1)}" aria-label="Previous day">‹</a>
          <label class="hist-pick">📅 <input type="date" id="histDate" value="${today.getFullYear()}-${md}" aria-label="Pick a date"></label>
          <a class="round" href="#/history/${shift(1)}" aria-label="Next day">›</a>
          <a class="btn btn-solid btn-sm" href="#/history/today">Today</a>
          <span class="muted small">${plural(list.length, "famous film", "famous films")} released on ${esc(label)}</span>
        </div>
        ${anniv.length ? `<section class="gsection"><div class="row-head"><h2 class="row-title">🎉 Anniversaries</h2></div>
          <div class="ggrid">${anniv.map((r) => historyCard(r)).join("")}</div></section>` : ""}
        ${Object.keys(byDecade).sort().reverse().map((dec) => `
          <section class="gsection"><div class="row-head"><h2 class="row-title">${dec}</h2></div>
            <div class="ggrid">${byDecade[dec].sort((a, b) => b[2].localeCompare(a[2])).map((r) => historyCard(r)).join("")}</div></section>`).join("")
          || `<div class="cal-empty">No famous releases found for ${esc(label)}.</div>`}
        <p class="muted small">Well-known films (by TMDB vote count) from 1940 to last year. Albums and games aren't covered — TMDB is film-only.</p>
      </section>`;
    $("#histDate")?.addEventListener("change", (e) => { const v = e.target.value; if (v) location.hash = `#/history/${v.slice(5)}`; });
  }

  // Home row: on this day
  async function fillOnThisDay(token) {
    const el = $("#onThisDay");
    if (!el) return;
    const t = new Date(), md = `${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
    const list = (await loadHistoryMonth(pad(t.getMonth() + 1))).filter((r) => r[2].slice(5) === md).sort((a, b) => b[5] - a[5]).slice(0, 20);
    if (token !== routeToken || !list.length) return;
    el.outerHTML = row("row-history", `🗓 On This Day in Film · ${esc(t.toLocaleDateString(LANG, { month: "long", day: "numeric" }))}`,
      list, (r) => historyCard(r).replace('class="gcard"', 'class="gcard in-rail"'), "rail-posters", `<a class="row-link" href="#/history/today">See all ›</a>`);
  }

  // =====================================================================
  // Delayed releases tracker
  // =====================================================================
  function renderDelays(scope = "") {
    document.title = "Delayed releases — Countdown";
    const mine = scope !== "all" && !isWorld();
    const rows = [];
    for (const m of listed()) {
      for (const [cc, from, to, on] of m.changes || []) {
        if (mine && cc !== COUNTRY && cc !== "WW") continue;
        rows.push({ m, cc, from, to, on, days: Math.round((parseDay(to) - parseDay(from)) / DAY) });
      }
    }
    rows.sort((a, b) => b.on.localeCompare(a.on) || Math.abs(b.days) - Math.abs(a.days));
    const fmtShift = (d) => {
      const a = Math.abs(d);
      const unit = a >= 60 ? `${Math.round(a / 30)} months` : a >= 14 ? `${Math.round(a / 7)} weeks` : plural(a, "day", "days");
      return d > 0 ? `Delayed by ${unit}` : `Moved earlier by ${unit}`;
    };
    app.innerHTML = `
      <section class="browse">
        ${pageHead("Delayed releases tracker", "Delays & date changes", scopeSwitch())}
        <div class="chips browse-chips">
          <a class="${scope !== "all" ? "active" : ""}" href="#/delays">${isWorld() ? "🌐 Worldwide dates" : `📍 ${esc(countryName(COUNTRY))}`}</a>
          <a class="${scope === "all" ? "active" : ""}" href="#/delays/all">All countries</a>
        </div>
        <div class="delay-list">
          ${rows.length ? rows.map(({ m, cc, from, to, on, days }) => `
            <a class="delay ${days > 0 ? "late" : "early"}" href="${movieHref(m)}" style="${theme(m.hue)}">
              <span class="delay-poster" style="${bg(m.poster)}"></span>
              <span class="delay-body">
                <strong>${esc(title(m))}</strong>
                <span class="delay-shift">${days > 0 ? "⏰" : "⏩"} ${fmtShift(days)} ${cc === "WW" ? "worldwide" : `in ${esc(countryName(cc))}`}</span>
                <span class="delay-dates"><s>${esc(shortDate(parseDay(from)))}</s> → <b>${esc(shortDate(parseDay(to)))}</b></span>
                <span class="muted small">Changed ${esc(relTime(parseDay(on)))}</span>
              </span>
              ${countdownAt(parseDay(to), "cd-mini")}
            </a>`).join("")
          : `<div class="cal-empty">No date changes spotted ${mine ? `in ${esc(countryName(COUNTRY))} ` : ""}recently. <a class="row-link" href="#/delays/all">See all countries ›</a></div>`}
        </div>
        <p class="muted small">Countdown checks every film's dates daily and compares them with the day before, plus TMDB's change log for the last 14 days.</p>
      </section>`;
  }

  // =====================================================================
  // Anticipation rankings (TMDB popularity = views, watchlist adds, votes)
  // =====================================================================
  function renderRankings(mode = "") {
    document.title = "Anticipation rankings — Countdown";
    const up = upcoming().filter((m) => m.pop);
    const genres = [...new Set(up.flatMap((m) => m.genres || []))].sort();
    let list, note;
    if (mode === "local") {
      list = anticipated(); note = isWorld() ? "Worldwide most anticipated list" : `Most anticipated in ${esc(countryName(COUNTRY))}: the biggest releases there mixed with local films`;
    } else {
      list = up.filter((m) => !mode || m.genres?.includes(mode)).sort((a, b) => b.pop - a.pop);
      note = "Ranked by TMDB popularity — how many people are viewing, adding to watchlists and rating each film. ▲▼ shows movement since yesterday.";
    }
    const globalRank = new Map(up.slice().sort((a, b) => b.pop - a.pop).map((m, i) => [m.id, i + 1]));
    app.innerHTML = `
      <section class="browse">
        ${pageHead("Anticipation rankings", "Most anticipated", scopeSwitch())}
        <div class="chips browse-chips">
          <a class="${!mode ? "active" : ""}" href="#/rankings">🌍 Global</a>
          <a class="${mode === "local" ? "active" : ""}" href="#/rankings/local">📍 ${esc(isWorld() ? "Worldwide list" : countryName(COUNTRY))}</a>
          ${genres.map((g) => `<a class="${mode === g ? "active" : ""}" href="#/rankings/${encodeURIComponent(g)}">${esc(g)}</a>`).join("")}
        </div>
        <p class="muted small">${note}</p>
        <ol class="rank-list">
          ${list.slice(0, 50).map((m, i) => {
            const was = !mode ? m.popWas : null, now = globalRank.get(m.id);
            const move = was && now ? was - now : 0;
            return `
            <li><a class="rank-item" href="${movieHref(m)}" style="${theme(m.hue)}">
              <span class="ri-n">${i + 1}</span>
              <span class="ri-move ${move > 0 ? "up" : move < 0 ? "down" : ""}">${move > 0 ? `▲${move}` : move < 0 ? `▼${-move}` : was ? "—" : "NEW"}</span>
              <span class="ri-poster" style="${bg(m.poster)}"></span>
              <span class="ri-body">
                <strong>${esc(title(m))}</strong>
                <span class="muted small">${esc(shortDate(time(m)))}${m.lang ? ` · ${esc(languageName(m.lang))}` : ""}${m.genres?.length ? ` · ${m.genres.slice(0, 2).map(esc).join(", ")}` : ""}</span>
              </span>
              <span class="ri-score" title="TMDB popularity">🔥 ${Math.round(m.pop)}</span>
              ${countdownAt(time(m), "cd-mini")}
            </a></li>`;
          }).join("")}
        </ol>
      </section>`;
  }

  // =====================================================================
  // Release clash detector
  // =====================================================================
  function clashes() {
    const byDay = new Map();
    for (const m of upcoming()) {
      const k = thDate(m) || (datedHere(m) ? dateStr(m) : null);
      if (!k || isRe(m)) continue;
      if (!byDay.has(k)) byDay.set(k, []);
      byDay.get(k).push(m);
    }
    const r = (m) => m.hot?.[rankKey()] || 999;
    return [...byDay].filter(([, l]) => l.length > 1)
      .map(([k, l]) => ({ k, list: l.sort((a, b) => (b.pop || 0) - (a.pop || 0)), big: l.filter((m) => r(m) <= 25 || (m.pop || 0) > 30).length }))
      .sort((a, b) => a.k.localeCompare(b.k));
  }
  function renderClashes(filter = "") {
    document.title = "Release clashes — Countdown";
    let list = clashes();
    if (filter === "big") list = list.filter((c) => c.big >= 2);
    app.innerHTML = `
      <section class="browse">
        ${pageHead("Release clash detector", `Release clashes ${isWorld() ? "worldwide" : `in ${esc(countryName(COUNTRY))}`}`, scopeSwitch())}
        <div class="chips browse-chips">
          <a class="${!filter ? "active" : ""}" href="#/clashes">All clashes</a>
          <a class="${filter === "big" ? "active" : ""}" href="#/clashes/big">💥 Big clashes only</a>
        </div>
        ${list.length ? list.map(({ k, list: films, big }) => `
          <article class="clash ${big >= 2 ? "big" : ""}">
            <header><span>${big >= 2 ? "💥 Big clash" : "⚔ Clash"}</span><strong>${esc(longDate(parseDay(k)))}</strong>
              <span class="muted small">${plural(films.length, "film", "films")} · ${esc(relTime(parseDay(k)))}</span></header>
            <div class="clash-row">
              ${films.slice(0, 6).map((m, i) => `${i ? `<span class="vs">VS</span>` : ""}
                <a class="clash-film" href="${movieHref(m)}" style="${theme(m.hue)}">
                  <span class="clash-poster" style="${bg(m.poster)}"></span>
                  <strong>${esc(title(m))}</strong>
                  <span class="muted small">${m.lang ? esc(languageName(m.lang)) : ""}${m.hot?.[rankKey()] ? ` · #${m.hot[rankKey()]}` : ""}</span>
                </a>`).join("")}
              ${films.length > 6 ? `<span class="muted small">+${films.length - 6} more</span>` : ""}
            </div>
          </article>`).join("") : `<div class="cal-empty">No release clashes on our list.</div>`}
      </section>`;
  }
  const clashFor = (m) => clashes().find((c) => c.list.includes(m));

  // =====================================================================
  // Global release comparison
  // =====================================================================
  const CMP_KEY = "movie-countdown:compare";
  function renderGlobal() {
    document.title = "Global release comparison — Countdown";
    let picked = readJSON(CMP_KEY, null);
    if (!picked) picked = [...new Set([HOME_COUNTRY, "US", "GB", "JP", "KR", "FR", "DE", "BR"])].slice(0, 6);
    const choices = [...new Set([HOME_COUNTRY, ...REGIONS])];
    const films = anticipated("WW").slice(0, 40);
    app.innerHTML = `
      <section class="browse">
        ${pageHead("Global release comparison", "Release dates around the world")}
        <div class="chips browse-chips wrap">
          ${choices.map((c) => `<button type="button" class="${picked.includes(c) ? "active" : ""}" data-cmp="${c}">${esc(countryName(c))}</button>`).join("")}
        </div>
        <div class="cmp-wrap"><table class="cmp">
          <thead><tr><th>Film</th>${picked.map((c) => `<th>${esc(countryName(c))}</th>`).join("")}</tr></thead>
          <tbody>${films.map((m) => {
            const ds = picked.map((c) => m.dates?.[c] || null);
            const known = ds.filter(Boolean).sort();
            return `<tr><td><a href="${movieHref(m)}">${esc(title(m))}</a></td>${ds.map((d) => {
              if (!d) return `<td class="na">—</td>`;
              const diff = Math.round((parseDay(d) - parseDay(known[0])) / DAY);
              return `<td class="${d === known[0] && known.length > 1 && known[known.length - 1] !== d ? "first" : ""}">${esc(fmt(parseDay(d), { month: "short", day: "numeric" }))}${diff ? `<small>+${diff}d</small>` : ""}</td>`;
            }).join("")}</tr>`;
          }).join("")}</tbody>
        </table></div>
        <p class="muted small">Green = releases there first. +Nd = days after the earliest country. Tap countries above to compare.</p>
      </section>`;
  }

  // Movie page: release dates in every country
  function globalDatesSection(m) {
    if (!m.dates || Object.keys(m.dates).length < 2) return "";
    const entries = Object.entries(m.dates).sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]));
    const mine = m.dates[HOME_COUNTRY];
    const first = entries[0][1];
    const shown = entries.slice(0, 24);
    return `
      <section class="globaldates" id="world">
        <div class="art-head"><p class="kicker">Release dates around the world</p><a class="row-link" href="#/global">Compare countries ›</a></div>
        <p class="muted small">${plural(entries.length, "country", "countries")} · first in ${esc(countryName(entries[0][0]))} on ${esc(shortDate(parseDay(first)))}${mine ? ` · ${esc(countryName(HOME_COUNTRY))}: ${esc(shortDate(parseDay(mine)))}` : ""}</p>
        <ul class="gd-list">${shown.map(([cc, d]) => {
          const rel = mine ? Math.round((parseDay(d) - parseDay(mine)) / DAY) : null;
          return `<li class="${cc === HOME_COUNTRY ? "me" : ""}"><span>${esc(countryName(cc))}</span><b>${esc(shortDate(parseDay(d)))}</b>
            <small>${cc === HOME_COUNTRY ? "you" : rel === null ? "" : rel === 0 ? "same day" : rel < 0 ? `${-rel}d earlier` : `${rel}d later`}</small></li>`;
        }).join("")}</ul>
        ${entries.length > shown.length ? `<p class="muted small">+${entries.length - shown.length} more countries</p>` : ""}
      </section>`;
  }

  // Movie page: where to watch (legitimate services, via TMDB / JustWatch)
  function whereToWatch(m) {
    if (!m.tmdb || !m._loaded) return "";
    const cc = isWorld() ? HOME_COUNTRY : COUNTRY;
    const w = m.watch?.[cc];
    const P = DATA.providers || {};
    const link = `https://www.themoviedb.org/movie/${m.tmdb}/watch?locale=${cc}`;
    const group = (ids, label) => ids?.length ? `
      <div class="ww-group"><p>${label}</p><div class="ww-logos">${ids.map((id) => P[id] ? `
        <a class="ww-p" href="${esc(link)}" target="_blank" rel="noopener" title="${esc(P[id][0])}">
          <img src="${IMG}/w92${esc(P[id][1])}" alt="" loading="lazy"><span>${esc(P[id][0])}</span></a>` : "").join("")}</div></div>` : "";
    const body = w ? group(w.f, "Stream") + group(w.a, "Free with ads") + group(w.r, "Rent") + group(w.b, "Buy") : "";
    return `
      <section class="watchwhere" id="where">
        <div class="art-head"><p class="kicker">Where to watch · ${esc(countryName(cc))}</p></div>
        ${body || `<p class="ww-none">${isOut(m) ? `Not available to stream or buy in ${esc(countryName(cc))} yet.` : `Not streaming yet — ${thDate(m) ? `in cinemas from ${esc(shortDate(parseDay(thDate(m))))}` : `releases ${esc(shortDate(time(m)))}`}.`}
          ${!isOut(m) ? `<button class="btn btn-outline btn-sm" type="button" data-tickets="${esc(m.id)}">🎟 Get Tickets</button>` : ""}</p>`}
        <p class="muted small">Official services only. Availability by <a href="https://www.justwatch.com" target="_blank" rel="noopener">JustWatch</a> via TMDB.</p>
      </section>`;
  }

  // =====================================================================
  // Surprise me
  // =====================================================================
  const surpriseDlg = $("#surprise");
  let surpriseTimer = null;
  function surprise() {
    const pool_ = upcoming().filter((m) => m.poster);
    if (!pool_.length) return;
    if (!surpriseDlg.open) surpriseDlg.showModal();
    const box = $(".sp-box", surpriseDlg);
    let n = 0;
    clearInterval(surpriseTimer);
    const pickOne = () => pool_[Math.floor(Math.random() * pool_.length)];
    surpriseTimer = setInterval(() => {
      const m = pickOne();
      box.innerHTML = `<div class="sp-spin" style="${bg(m.poster)}"></div>`;
      if (++n > 12) {
        clearInterval(surpriseTimer);
        const pick = pickOne();
        box.innerHTML = `
          <div class="sp-result" style="${theme(pick.hue)}">
            <div class="sp-poster" style="${bg(pick.poster)}"></div>
            <div class="sp-info">
              <p class="kicker">🎲 Your surprise</p>
              <h2>${esc(title(pick))}</h2>
              ${origTitle(pick) ? `<p class="muted">${esc(origTitle(pick))}</p>` : ""}
              <p class="muted small">${esc(longDate(time(pick)))}${pick.lang ? ` · ${esc(languageName(pick.lang))}` : ""}${pick.genres?.length ? ` · ${pick.genres.slice(0, 2).map(esc).join(", ")}` : ""}</p>
              <p class="sp-blurb">${esc(synopsis(pick) || "")}</p>
              ${countdown(pick, "cd-small")}
              <div class="cta">
                <a class="btn btn-solid btn-sm" href="${movieHref(pick)}" data-close-surprise>ⓘ Open</a>
                <button class="btn btn-outline btn-sm" type="button" data-surprise>🎲 Spin again</button>
                ${waitBtn(pick, "btn btn-ghost btn-sm")}
              </div>
            </div>
          </div>`;
      }
    }, 90);
  }
  surpriseDlg.addEventListener("click", (e) => {
    if (e.target === surpriseDlg || e.target.closest(".close") || e.target.closest("[data-close-surprise]") || e.target.closest("[data-wait]")) surpriseDlg.close();
  });


  // =====================================================================
  // Anime (AniList provider → unified Release objects)
  // Pages here only use Release fields; AniList specifics live in providers/anilist.js.
  // =====================================================================
  const anime = window.Countdown?.providers?.anilist;
  const animeHref = (r) => `#/anime/${encodeURIComponent(r.sourceId)}`;
  const relHue = (r) => { const h = r.color ? hexToHue(r.color) : 330; return [h, (h + 30) % 360]; };
  const SEASON_LABEL = { WINTER: "Winter", SPRING: "Spring", SUMMER: "Summer", FALL: "Fall" };
  const seasonLabel = (s) => (s ? `${SEASON_LABEL[s.name] || s.name} ${s.year}` : "");
  const timeOfDay = (t) => new Date(t).toLocaleTimeString(LANG, { hour: "numeric", minute: "2-digit" });
  const STATUS_LABEL = { upcoming: "Not yet aired", releasing: "Airing", finished: "Finished", cancelled: "Cancelled", hiatus: "On hiatus", unknown: "" };

  function releaseDateLabel(r) {
    if (!r.releaseDate) return r.season ? seasonLabel(r.season) : "Date TBA";
    const t = parseDay(r.releaseDate);
    if (r.datePrecision === "day") return shortDate(t);
    if (r.datePrecision === "month") return fmt(t, { month: "long", year: "numeric" });
    return r.season ? seasonLabel(r.season) : r.releaseDate.slice(0, 4);
  }

  function animeCard(r) {
    const ep = r.nextEpisode;
    return `
      <a class="gcard" href="${animeHref(r)}" style="${theme(relHue(r))}">
        <div class="gcard-art" style="${bg(r.poster)}">
          <span class="tag tag-type t-anime">🎌 ${esc(r.format || "Anime")}</span>
          ${r.score ? `<span class="tag tag-score">★ ${r.score}</span>` : ""}
        </div>
        <strong>${esc(r.title)}</strong>
        ${r.originalTitle ? `<span class="gcard-orig">${esc(r.originalTitle)}</span>` : ""}
        <span class="gcard-meta">${ep ? `Ep ${ep.number}${r.episodes ? `/${r.episodes}` : ""} · ${esc(fmt(ep.airingAt, { weekday: "short" }))} ${esc(timeOfDay(ep.airingAt))}`
          : esc(releaseDateLabel(r))}${r.studios[0] ? ` · ${esc(r.studios[0].name)}` : ""}</span>
        ${r.countdownTo ? countdownAt(r.countdownTo, "cd-mini", ep ? "Aired" : "Out now") : ""}
      </a>`;
  }
  const animeRailCard = (r) => animeCard(r).replace('class="gcard"', 'class="gcard in-rail"');

  const ANIME_TABS = [["schedule", "📅 Airing schedule"], ["season", "🍂 This season"], ["upcoming", "🔜 Upcoming"], ["search", "🔍 Search"]];
  const animeTabs = (active) => `<nav class="tabs">${ANIME_TABS.map(([k, label]) =>
    `<a class="${k === active ? "active" : ""}" href="#/anime/${k}">${label}</a>`).join("")}</nav>`;
  const animeHead = (heading, active, extra = "") => `
    <header class="browse-head"><p class="kicker">🎌 Anime · via AniList</p><h1 class="cal-title">${heading}</h1>${extra}</header>
    ${animeTabs(active)}`;
  const animeError = (err) => `<div class="cal-empty">Couldn't reach AniList right now (${esc(err.message || err)}).
    <button class="btn btn-ghost btn-sm" type="button" data-anime-retry>Try again</button></div>`;

  // Paged list: renders page 1, then "Load more" appends the next page.
  const pagers = new Map();
  async function mountPaged(id, load, render, { empty = "Nothing here yet.", wrap = (h) => h } = {}) {
    const el = document.getElementById(id);
    if (!el) return;
    const state = { page: 0, load, render, wrap, items: [], hasNext: true, empty, token: routeToken };
    pagers.set(id, state);
    await loadMore(id);
  }
  async function loadMore(id) {
    const st = pagers.get(id), el = document.getElementById(id);
    if (!st || !el) return;
    const btn = $(`[data-more="${id}"]`);
    if (btn) { btn.disabled = true; btn.textContent = "Loading…"; }
    try {
      const res = await st.load(st.page + 1);
      if (st.token !== routeToken) return;
      st.page = res.page.current; st.hasNext = res.page.hasNext;
      st.items.push(...res.items);
      el.innerHTML = st.items.length ? st.wrap(st.items.map(st.render).join("")) +
        (st.hasNext ? `<div class="more-wrap"><button class="btn btn-ghost" type="button" data-more="${id}">Load more</button></div>` : "")
        : `<div class="cal-empty">${st.empty}</div>`;
    } catch (err) {
      if (st.token !== routeToken) return;
      if (st.items.length && btn) { btn.disabled = false; btn.textContent = "Couldn't load — try again"; }
      else el.innerHTML = animeError(err);
    }
  }

  function renderAnime(tab = "schedule", arg = "", arg2 = "") {
    if (!anime) return renderMessage("Anime unavailable", "The AniList provider didn't load.");
    if (/^\d+$/.test(tab)) return renderAnimeDetail(tab);
    if (!ANIME_TABS.some(([k]) => k === tab)) tab = "schedule";
    document.title = "Anime — Countdown";
    const spinner = `<div class="loading-strip"><div class="spinner"></div></div>`;

    if (tab === "schedule") {
      const day = arg && /^\d{4}-\d{2}-\d{2}$/.test(arg) ? parseDay(arg) : startOfDay();
      const days = Array.from({ length: 8 }, (_, i) => startOfDay() + (i - 1) * DAY);
      app.innerHTML = `<section class="browse">
        ${animeHead("Airing schedule", "schedule")}
        <div class="chips browse-chips">${days.map((d) => `<a class="${d === day ? "active" : ""}" href="#/anime/schedule/${dayKey(d)}">
          ${d === startOfDay() ? "Today" : d === startOfDay() + DAY ? "Tomorrow" : d === startOfDay() - DAY ? "Yesterday" : esc(fmt(d, { weekday: "short", day: "numeric" }))}</a>`).join("")}</div>
        <p class="muted small">Episode times in your time zone · ${esc(longDate(day))}</p>
        <div id="animeList">${spinner}</div></section>`;
      return mountPaged("animeList", (page) => anime.schedule({ from: day, to: day + DAY, page, perPage: 50 }), scheduleItem,
        { empty: "No episodes scheduled for this day.", wrap: (h) => `<div class="sched">${h}</div>` });
    }

    if (tab === "season") {
      const cur = anime.currentSeason();
      const s = arg && arg2 ? { name: arg2.toUpperCase(), year: +arg } : cur;
      const sort = new URLSearchParams(location.hash.split("?")[1] || "").get("sort") || "POPULARITY_DESC";
      const prev = anime.shiftSeason(s, -1), next = anime.shiftSeason(s, 1);
      const base = `#/anime/season/${s.year}/${s.name.toLowerCase()}`;
      app.innerHTML = `<section class="browse">
        ${animeHead(`${seasonLabel(s)} anime`, "season")}
        <div class="hist-controls">
          <a class="round" href="#/anime/season/${prev.year}/${prev.name.toLowerCase()}" aria-label="Previous season">‹</a>
          <strong>${esc(seasonLabel(s))}</strong>
          <a class="round" href="#/anime/season/${next.year}/${next.name.toLowerCase()}" aria-label="Next season">›</a>
          ${s.name !== cur.name || s.year !== cur.year ? `<a class="btn btn-solid btn-sm" href="#/anime/season">This season</a>` : ""}
          <div class="seg">${[["POPULARITY_DESC", "Popular"], ["SCORE_DESC", "Top rated"], ["START_DATE", "Start date"], ["TRENDING_DESC", "Trending"]]
            .map(([k, l]) => `<a class="${k === sort ? "active" : ""}" href="${base}?sort=${k}">${l}</a>`).join("")}</div>
        </div>
        <div id="animeList">${spinner}</div></section>`;
      return mountPaged("animeList", (page) => anime.seasonal({ season: s.name, year: s.year, page, sort }), animeCard,
        { empty: "No anime announced for this season yet.", wrap: (h) => `<div class="ggrid">${h}</div>` });
    }

    if (tab === "upcoming") {
      app.innerHTML = `<section class="browse">
        ${animeHead("Upcoming anime", "upcoming")}
        <p class="muted small">Announced and not yet aired, most anticipated first (AniList popularity).</p>
        <div id="animeList">${spinner}</div></section>`;
      return mountPaged("animeList", (page) => anime.upcoming({ page }), animeCard,
        { wrap: (h) => `<div class="ggrid">${h}</div>` });
    }

    // search
    const q = decodeURIComponent(arg || "");
    app.innerHTML = `<section class="browse">
      ${animeHead("Search anime", "search")}
      <form class="anime-search" id="animeSearchForm">
        <input id="animeQ" type="search" value="${esc(q)}" placeholder="Search anime titles (English, romaji or Japanese)…" autocomplete="off" aria-label="Search anime">
        <button class="btn btn-solid" type="submit">Search</button>
      </form>
      <div id="animeList">${q ? spinner : `<div class="cal-empty">Type a title — e.g. Frieren, One Piece, 葬送のフリーレン.</div>`}</div></section>`;
    $("#animeSearchForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const v = $("#animeQ").value.trim();
      if (v) location.hash = `#/anime/search/${encodeURIComponent(v)}`;
    });
    if (q) mountPaged("animeList", (page) => anime.search({ query: q, page }), animeCard,
      { empty: `No anime found for “${esc(q)}”.`, wrap: (h) => `<div class="ggrid">${h}</div>` });
  }

  function scheduleItem({ release: r, episode, airingAt }) {
    return `
      <a class="sched-item ${airingAt <= Date.now() ? "aired" : ""}" href="${animeHref(r)}" style="${theme(relHue(r))}">
        <span class="sched-time">${esc(timeOfDay(airingAt))}</span>
        <span class="sched-poster" style="${bg(r.poster)}"></span>
        <span class="sched-body">
          <strong>${esc(r.title)}</strong>
          <span class="muted small">Episode ${episode}${r.episodes ? ` of ${r.episodes}` : ""} · ${esc(r.format)}${r.studios[0] ? ` · ${esc(r.studios[0].name)}` : ""}</span>
        </span>
        ${countdownAt(airingAt, "cd-mini", "Aired")}
      </a>`;
  }

  async function renderAnimeDetail(id) {
    const token = routeToken;
    app.innerHTML = `<section class="empty-state"><div class="spinner"></div></section>`;
    let r;
    try { r = await anime.detail(id); } catch (err) {
      if (token === routeToken) app.innerHTML = `<section class="browse">${animeError(err)}</section>`;
      return;
    }
    if (token !== routeToken) return;
    if (!r) return renderMessage("Anime not found", "AniList has no anime with this id.");
    document.title = `${r.title} — Countdown`;
    const hue = relHue(r);
    const ep = r.nextEpisode;
    const aired = ep ? ep.number - 1 : r.status === "finished" ? r.episodes : 0;
    const studios = r.studios.map((s) => esc(s.name)).join(" &amp; ");
    const facts = [
      ["Format", r.format], ["Status", STATUS_LABEL[r.status]],
      ["Episodes", r.episodes ? `${r.episodes}${r.duration ? ` × ${r.duration} min` : ""}` : r.duration ? `${r.duration} min` : ""],
      ["Season", seasonLabel(r.season)], ["Start date", r.releaseDate ? releaseDateLabel(r) : ""],
      ["Studio", r.studios.map((s) => s.name).join(", ")], ["Source", r.extra?.source ? r.extra.source.replace(/_/g, " ").toLowerCase() : ""],
      ["Score", r.score ? `${r.score}%` : ""], ["Popularity", r.popularity ? `${r.popularity.toLocaleString(LANG)} members` : ""],
      ["Genres", r.genres.join(", ")], ["Country", r.country ? countryName(r.country) : ""],
    ].filter(([, v]) => v);
    const ORDER = ["SEQUEL", "PREQUEL", "PARENT", "SIDE_STORY", "SPIN_OFF", "ALTERNATIVE"];
    const rel = (r.extra?.relations || []).filter((x) => x.release)
      .sort((a, b) => ((ORDER.indexOf(a.relation) + 1 || 99) - (ORDER.indexOf(b.relation) + 1 || 99))).slice(0, 24);
    const recs = (r.extra?.recommendations || []).filter(Boolean);
    currentAnime = r;

    app.innerHTML = `
      <header class="cine hero anime-hero" style="${theme(hue)}">
        ${fireLayers(r.banner || r.posterLarge, orb)}
        <div class="hero-body">
          <p class="byline re">🎌 ${esc(r.format || "Anime")}${r.season ? ` · ${esc(seasonLabel(r.season))}` : ""}${STATUS_LABEL[r.status] ? ` · ${esc(STATUS_LABEL[r.status])}` : ""}</p>
          ${studios ? `<p class="byline">Animation by <strong>${studios}</strong></p>` : ""}
          <h1 class="mega" style="--len:${longestWord(r.title)}">${esc(r.title)}</h1>
          ${r.originalTitle ? `<p class="orig-title" lang="ja">${esc(r.originalTitle)}</p>` : ""}
          ${ep ? `<p class="tagline">Episode ${ep.number}${r.episodes ? ` of ${r.episodes}` : ""} airs ${esc(fmt(ep.airingAt, { weekday: "long", month: "short", day: "numeric" }))} at ${esc(timeOfDay(ep.airingAt))}</p>`
            : r.status === "upcoming" ? `<p class="tagline">Premieres ${esc(releaseDateLabel(r))}</p>` : ""}
          ${r.countdownTo ? countdownAt(r.countdownTo, "cd-hero", ep ? "Airing now" : "Out now") : r.status === "upcoming" ? `<p class="local-note">Exact date not announced yet.</p>` : ""}
          ${r.episodes && aired > 0 && r.status === "releasing" ? `
            <div class="wr-progress"><div class="wr-bar"><span style="width:${Math.min(100, (aired / r.episodes) * 100).toFixed(1)}%"></span></div>
            <p>${aired} of ${r.episodes} episodes aired</p></div>` : ""}
          <div class="cta cta-center">
            ${r.trailer ? `<button class="play" type="button" data-anime-trailer><span>▶</span> Watch Trailer</button>` : ""}
            ${r.watch.length ? `<a class="btn btn-outline" href="#where" data-scroll="where">📺 Where to watch</a>` : ""}
          </div>
        </div>
      </header>

      <section class="about">
        <div>
          <p class="kicker">Synopsis</p>
          <div class="about-text anime-desc">${(r.description || "No description yet.").split(/\n+/).map((t) => `<p>${esc(t)}</p>`).join("")}</div>
          ${r.tags.length ? `<div class="chips anime-tags">${r.tags.map((t) => `<span class="pill">${esc(t)}</span>`).join("")}</div>` : ""}
        </div>
        <dl class="facts">${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>
      </section>

      <section class="watchwhere" id="where">
        <div class="art-head"><p class="kicker">Where to watch</p></div>
        ${r.watch.length ? `<div class="ww-links">${r.watch.map((w) => `
          <a class="ww-link" href="${esc(w.url)}" target="_blank" rel="noopener" style="--wc:${esc(w.color || "#444")}">
            ${w.icon ? `<img src="${esc(w.icon)}" alt="" loading="lazy">` : ""}<span>${esc(w.name)}</span>${w.language ? `<small>${esc(w.language)}</small>` : ""}</a>`).join("")}</div>`
          : `<p class="ww-none">No official streaming links listed yet.</p>`}
        <p class="muted small">Official streaming links from <a href="${esc(r.sourceUrl)}" target="_blank" rel="noopener">AniList</a>. Availability depends on your region.</p>
      </section>

      <div class="rows anime-rows">
        ${rel.length ? row("anime-rel", "Related", rel, ({ relation, release }) => animeRailCard(release)
          .replace('<strong>', `<span class="rel-type">${esc(relation.replace(/_/g, " ").toLowerCase())}</span><strong>`), "rail-posters") : ""}
        ${recs.length ? row("anime-recs", "Recommended", recs, animeRailCard, "rail-posters") : ""}
      </div>
      <p class="muted small attribution">Anime data from <a href="https://anilist.co" target="_blank" rel="noopener">AniList</a>.</p>`;
    startEmbers($(".anime-hero canvas"), hue, 0.7);
  }
  let currentAnime = null;

  // Home row: episodes airing in the next 24 hours.
  async function fillAnimeRow(token) {
    const el = $("#animeAiring");
    if (!el || !anime) return;
    try {
      const res = await anime.schedule({ from: Date.now(), to: Date.now() + DAY, perPage: 50 });
      if (token !== routeToken) return;
      const seen = new Set();
      const items = res.items.filter((x) => !seen.has(x.release.id) && seen.add(x.release.id))
        .sort((a, b) => (b.release.popularity || 0) - (a.release.popularity || 0)).slice(0, 20)
        .sort((a, b) => a.airingAt - b.airingAt);
      if (!items.length) return el.remove();
      el.outerHTML = row("row-anime", "🎌 Anime Airing in the Next 24 Hours", items,
        ({ release, episode, airingAt }) => animeRailCard({ ...release, nextEpisode: { number: episode, airingAt }, countdownTo: airingAt }),
        "rail-posters", `<a class="row-link" href="#/anime">Full schedule ›</a>`);
    } catch (_) { el.remove(); }
  }

  // Anime results inside the main search dialog (debounced; AniList is rate-limited).
  let animeSearchTimer = null;
  function animeSearchInto(q, el) {
    clearTimeout(animeSearchTimer);
    if (!anime || q.length < 2) { el.innerHTML = ""; return; }
    el.innerHTML = `<p class="search-label">🎌 Anime</p><p class="muted small" style="padding:0 10px">Searching AniList…</p>`;
    animeSearchTimer = setTimeout(async () => {
      try {
        const res = await anime.search({ query: q, perPage: 8 });
        if (searchInput.value.trim() !== q) return;
        el.innerHTML = res.items.length ? `<p class="search-label">🎌 Anime</p>${res.items.map((r) => `
          <a class="sm" href="${animeHref(r)}">
            <span class="sm-poster" style="${bg(r.poster)}"></span>
            <span class="sm-body"><strong>${esc(r.title)}</strong>${r.originalTitle ? `<span class="sm-orig">${esc(r.originalTitle)}</span>` : ""}
              <span class="sm-meta">${esc(r.format)} · ${esc(STATUS_LABEL[r.status] || "")}${r.studios[0] ? ` · ${esc(r.studios[0].name)}` : ""}</span></span>
            <span class="sm-cd">${r.countdownTo ? `${Math.max(0, Math.ceil((r.countdownTo - Date.now()) / DAY))}<small>${r.nextEpisode ? `days · ep ${r.nextEpisode.number}` : "days"}</small>` : `<span class="muted small">${esc(releaseDateLabel(r))}</span>`}</span>
          </a>`).join("")}` : "";
      } catch (_) { el.innerHTML = ""; }
    }, 450);
  }

  // ---------- embers (canvas particles) ----------
  let embers = [];
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Pre-rendered glow sprites (one per hue) — far cheaper than canvas shadowBlur.
  const spriteCache = new Map();
  function glowSprite(hue) {
    const key = Math.round(hue / 5) * 5;
    if (!spriteCache.has(key)) {
      const c = document.createElement("canvas");
      c.width = c.height = 32;
      const g = c.getContext("2d");
      const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
      grad.addColorStop(0, `hsla(${key},100%,85%,1)`);
      grad.addColorStop(0.25, `hsla(${key},100%,62%,.9)`);
      grad.addColorStop(1, `hsla(${key},100%,50%,0)`);
      g.fillStyle = grad;
      g.fillRect(0, 0, 32, 32);
      spriteCache.set(key, c);
    }
    return spriteCache.get(key);
  }

  function startEmbers(canvas, hue, density = 1) {
    if (!canvas || reduceMotion) return;
    const ctx = canvas.getContext("2d");
    const hues = hue || [20, 40];
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    let w, h, ps;
    const make = (fresh) => {
      const hh = (hues[Math.random() < 0.6 ? 0 : 1] + Math.random() * 20 - 10 + 360) % 360;
      return {
        x: Math.random() * w, y: fresh ? Math.random() * h : h + 10,
        r: (Math.random() * 5 + 3) * dpr, vy: (Math.random() * 0.6 + 0.2) * dpr,
        vx: (Math.random() - 0.5) * 0.3 * dpr, life: Math.random(), sprite: glowSprite(hh),
      };
    };
    const resize = () => {
      w = canvas.width = canvas.offsetWidth * dpr;
      h = canvas.height = canvas.offsetHeight * dpr;
      const n = Math.min(110, Math.round((w * h) / (11000 * dpr * dpr) * density));
      ps = Array.from({ length: n }, () => make(true));
    };
    resize();
    const state = { canvas, raf: 0, resize, visible: true, io: null };
    // Only animate while the canvas is on screen.
    if ("IntersectionObserver" in window) {
      state.io = new IntersectionObserver(([e]) => { state.visible = e.isIntersecting; });
      state.io.observe(canvas);
    }
    let last = 0;
    const frame = (now) => {
      state.raf = requestAnimationFrame(frame);
      if (!state.visible || document.hidden || now - last < 33) return; // ~30 fps is plenty
      last = now;
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      for (const p of ps) {
        p.y -= p.vy; p.x += p.vx + Math.sin((p.y + p.life * 500) / 60) * 0.25;
        p.life += 0.004;
        if (p.y < -10) Object.assign(p, make(false));
        ctx.globalAlpha = 0.35 + 0.5 * Math.abs(Math.sin(p.life * 6));
        ctx.drawImage(p.sprite, p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
      }
      ctx.globalAlpha = 1;
    };
    state.raf = requestAnimationFrame(frame);
    embers.push(state);
  }

  function stopEmbers() {
    embers.forEach((e) => { cancelAnimationFrame(e.raf); e.io?.disconnect(); });
    embers = [];
  }
  addEventListener("resize", () => embers.forEach((e) => e.resize()));

  // ---------- routing ----------
  let routeToken = 0;
  const section = (h) => (h.match(/^#\/(\w+)/) || [, "home"])[1];

  function route() {
    stopEmbers();
    const token = ++routeToken;
    const h = decodeURIComponent(location.hash);
    let m;
    const sec = h.startsWith("#/browse/watchlist") ? "watchlist"
      : ["explore", "history", "delays", "rankings", "clashes", "global"].includes(section(h)) ? "explore" : section(h);
    $$(".nav-links a, .tabbar a").forEach((a) => a.classList.toggle("active", a.dataset.section === sec ||
      (a.dataset.section === "browse" && sec === "watchlist" && a.closest(".nav-links"))));

    if ((m = h.match(/^#\/movie\/(.+)$/))) {
      const movie = all().find((x) => x.id === m[1]);
      return movie ? renderMovie(movie, token) : renderHome();
    }
    clearInterval(slideTimer);
    if ((m = h.match(/^#\/anime(?:\/([^/?]+))?(?:\/([^/?]+))?(?:\/([^/?]+))?/))) return renderAnime(m[1] || "schedule", m[2] || "", m[3] || "");
    if (h === "#/explore") return renderExplore();
    if ((m = h.match(/^#\/history(?:\/([\w-]+))?$/))) return renderHistory(m[1], token);
    if ((m = h.match(/^#\/delays(?:\/(all))?$/))) return renderDelays(m[1] || "");
    if ((m = h.match(/^#\/rankings(?:\/(.+))?$/))) return renderRankings(m[1] || "");
    if ((m = h.match(/^#\/clashes(?:\/(big))?$/))) return renderClashes(m[1] || "");
    if (h === "#/global") return renderGlobal();
    if ((m = h.match(/^#\/browse(?:\/(\w+))?(?:\/(.+))?$/))) return renderBrowse(m[1], m[2] || "");
    if ((m = h.match(/^#\/feed(?:\/(\w+))?$/))) return renderFeed(m[1] || "all");
    if ((m = h.match(/^#\/wait\/(.+)$/))) {
      const movie = all().find((x) => x.id === m[1]);
      return movie ? renderWaitingRoom(movie, token) : renderMessage("Waiting room not found", "This movie isn't on our list any more.");
    }
    if ((m = h.match(/^#\/calendar(?:\/(\d{4}-\d{2}-\d{2}))?(?:\/(week|month))?$/))) {
      return renderCalendar(m[1], m[2] || "day");
    }
    if ((m = h.match(/^#\/person\/(\d+)$/))) {
      app.innerHTML = `<section class="empty-state"><div class="spinner"></div></section>`;
      return loadPerson(m[1]).then((p) => { if (token === routeToken) renderPersonPage(p); })
        .catch(() => token === routeToken && renderMessage("Profile not available", "We don't have a profile for this person yet."));
    }
    if ((m = h.match(/^#\/film\/(\d+)\/(\d+)$/))) {
      const [, filmId, personId] = m;
      const full = byTmdb.get(+filmId);
      if (full) { location.replace(movieHref(full)); return; }
      app.innerHTML = `<section class="empty-state"><div class="spinner"></div></section>`;
      return loadPerson(personId).then((p) => {
        if (token !== routeToken) return;
        const f = p.credits.find((x) => x.id === +filmId);
        f ? renderFilmPage(p, f) : renderMessage("Film not found", "This film isn't in our database.");
      }).catch(() => token === routeToken && renderMessage("Film not available", "Please try again later."));
    }
    renderHome();
  }

  let lastHash = location.hash;
  addEventListener("hashchange", () => {
    const keepScroll = section(lastHash) === "calendar" && section(location.hash) === "calendar";
    lastHash = location.hash;
    route();
    if (!keepScroll) scrollTo(0, 0);
  });

  // ---------- interactions ----------
  document.addEventListener("click", (e) => {
    const t = e.target;

    if (t.closest("[data-open-search]")) return openSearch();

    const scrollLink = t.closest("[data-scroll]");
    if (scrollLink) {
      e.preventDefault();
      const go = () => document.getElementById(scrollLink.dataset.scroll)?.scrollIntoView({ behavior: "smooth" });
      if (!document.getElementById(scrollLink.dataset.scroll)) { location.hash = "#/"; setTimeout(go, 80); } else go();
      return;
    }

    const railBtn = t.closest("button.rail-btn, button.round");
    if (railBtn) {
      const scope = railBtn.closest(".rail-wrap") || railBtn.closest(".cast-body");
      const r = scope && $(".rail", scope);
      if (r) r.scrollBy({ left: (railBtn.classList.contains("next") ? 1 : -1) * r.clientWidth * 0.85, behavior: "smooth" });
      return;
    }

    const tr_ = t.closest("[data-trailer]");
    if (tr_) {
      const m = all().find((x) => x.id === tr_.dataset.trailer);
      if (m) loadDetail(m).then(() => openTrailer(m, +(tr_.dataset.index || 0)));
      return;
    }

    const pick = t.closest("[data-video]");
    if (pick) return playVideo(+pick.dataset.video);

    const tk = t.closest("[data-tickets]");
    if (tk) return openTickets(all().find((x) => x.id === tk.dataset.tickets));

    const dl = t.closest("[data-download]");
    if (dl) return downloadArt(dl.dataset.download, dl.dataset.name);

    const at = t.closest("[data-art-tab]");
    if (at) {
      artTab = at.dataset.artTab;
      const sec = $("#artwork");
      if (currentMovie && sec) sec.outerHTML = artworkSection(currentMovie);
      return;
    }

    if (t.closest("[data-open-location]")) return openLocation();

    const w = t.closest("[data-wait]");
    if (w) {
      const m = all().find((x) => x.id === w.dataset.wait);
      if (!m) return;
      const wasIn = isWaiting(m);
      toggleWaiting(m);
      if (!wasIn && section(location.hash) !== "wait") { location.hash = `#/wait/${encodeURIComponent(m.id)}`; return; }
      const y = scrollY; route(); scrollTo(0, y);
      return;
    }
    const sh = t.closest("[data-share]");
    if (sh) { const m = all().find((x) => x.id === sh.dataset.share); if (m) shareMovie(m); return; }
    const nt = t.closest("[data-notify]");
    if (nt) { const m = all().find((x) => x.id === nt.dataset.notify); if (m) armAlert(m); return; }
    const fl = t.closest("[data-follow]");
    if (fl) {
      loadPerson(fl.dataset.follow).then((p) => {
        toggleFollow(p);
        fl.outerHTML = followBtn(p);
      });
      return;
    }

    if (t.closest("[data-surprise]")) { e.preventDefault(); return surprise(); }
    const more = t.closest("[data-more]");
    if (more) return loadMore(more.dataset.more);
    if (t.closest("[data-anime-retry]")) return route();
    if (t.closest("[data-anime-trailer]") && currentAnime?.trailer) {
      return openTrailer({ id: currentAnime.id, title: currentAnime.title, trailers: [currentAnime.trailer] });
    }
    const cmp = t.closest("[data-cmp]");
    if (cmp) {
      let picked = readJSON(CMP_KEY, null) || [...new Set([HOME_COUNTRY, "US", "GB", "JP", "KR", "FR", "DE", "BR"])].slice(0, 6);
      const c = cmp.dataset.cmp;
      picked = picked.includes(c) ? picked.filter((x) => x !== c) : [...picked, c].slice(-8);
      writeJSON(CMP_KEY, picked);
      return renderGlobal();
    }

    const ct = t.closest("[data-caltype]");
    if (ct) {
      calType = ct.dataset.caltype;
      try { localStorage.setItem("movie-countdown:caltype", calType); } catch (_) { /* ignore */ }
      const y = scrollY; route(); scrollTo(0, y);
      return;
    }

    const scope = t.closest("[data-scope]");
    if (scope) return setCountry(scope.dataset.scope);

    const inline = t.closest("[data-inline], [data-inline-play]");
    if (inline) {
      const player = $("[data-player]");
      const m = all().find((x) => x.id === player?.dataset.player);
      if (!m) return;
      const i = +(inline.dataset.inline ?? inline.dataset.inlinePlay);
      player.innerHTML = embed(m.trailers[i], title(m));
      $$(".video-list .video-thumb").forEach((b) => b.classList.toggle("active", +b.dataset.inline === i));
      if (inline.dataset.inline !== undefined) player.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    const moreBio = t.closest(".more-bio");
    if (moreBio) {
      const open_ = $(".pbio").classList.toggle("clamp");
      moreBio.textContent = open_ ? "Read full biography" : "Show less";
      return;
    }

    const ics = t.closest("[data-ics]");
    if (ics) return downloadIcs(all().find((m) => m.id === ics.dataset.ics));

    const rm = t.closest("[data-remove]");
    if (rm && confirm("Remove this countdown?")) {
      custom = custom.filter((c) => c.id !== rm.dataset.remove);
      saveCustom();
      location.hash = "#/";
      toast("Countdown removed");
    }
  });

  // Trailer pop-up
  const trailer = $("#trailer");
  let playing = null;
  function openTrailer(m, index = 0) {
    if (!m?.trailers?.length) return toast("No trailer yet");
    $$("[data-player] iframe").forEach((f) => f.remove());
    playing = { m, vids: m.trailers };
    $(".playlist", trailer).innerHTML = playing.vids.length > 1
      ? playing.vids.map((v, i) => `<button type="button" data-video="${i}">${esc(v.name)}</button>`).join("") : "";
    playVideo(index);
    if (!trailer.open) trailer.showModal();
  }
  function playVideo(i) {
    if (!playing) return;
    const v = playing.vids[i] || playing.vids[0];
    $(".video", trailer).innerHTML = embed(v, title(playing.m));
    $$(".playlist button", trailer).forEach((b) => b.classList.toggle("active", +b.dataset.video === i));
  }
  trailer.addEventListener("close", () => {
    $(".video", trailer).innerHTML = ""; playing = null;
    const player = $("[data-player]");
    const m = player && all().find((x) => x.id === player.dataset.player);
    if (m && !player.querySelector(".player-poster")) player.innerHTML = playerPoster(m.trailers[0], 0);
  });
  $(".close", trailer).addEventListener("click", () => trailer.close());
  trailer.addEventListener("click", (e) => { if (e.target === trailer) trailer.close(); });

  // Calendar (.ics)
  function downloadIcs(m) {
    if (!m) return;
    const start = new Date(time(m)), end = new Date(time(m) + DAY);
    const ymd = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    const ics = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Movie Countdown//EN", "BEGIN:VEVENT",
      `UID:${m.id}-${COUNTRY}@movie-countdown`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${ymd(start)}`, `DTEND;VALUE=DATE:${ymd(end)}`,
      `SUMMARY:${title(m).replace(/[,;]/g, "\\$&")} — in cinemas`,
      "END:VEVENT", "END:VCALENDAR",
    ].join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    a.download = `${m.id}.ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // Location: country + city
  const locDialog = $("#locDialog");
  const countrySel = $("#country");
  const cityInput = $("#cityInput");
  function updateLocText() {
    $("#locText").textContent = isWorld() ? "Worldwide" : CITY ? `${CITY}` : countryName(COUNTRY);
    $("#locBtn").firstElementChild.textContent = isWorld() ? "🌐" : "📍";
    $("#locBtn").title = `${CITY ? CITY + ", " : ""}${countryName(COUNTRY)}`;
  }
  function renderCityChips() {
    const cities = TICKETS[COUNTRY]?.cities || [];
    $("#cityChips").innerHTML = isWorld() ? `<p class="muted small">Pick a country to choose a city.</p>` : cities.length
      ? [`<button type="button" class="${!CITY ? "active" : ""}" data-city="">Whole country</button>`,
        ...cities.map((c) => `<button type="button" class="${c === CITY ? "active" : ""}" data-city="${esc(c)}">${esc(c)}</button>`)].join("")
      : `<p class="muted small">No city list for ${esc(countryName(COUNTRY))} yet — type your city below.</p>`;
    cityInput.value = CITY && !cities.includes(CITY) ? CITY : "";
  }
  function setCity(c) {
    CITY = c.trim();
    try { CITY ? localStorage.setItem(cityKey(COUNTRY), CITY) : localStorage.removeItem(cityKey(COUNTRY)); } catch (_) { /* ignore */ }
    renderCityChips();
    updateLocText();
    if (ticketDialog.open && ticketFor) openTickets(ticketFor);
  }
  function openLocation() {
    renderCityChips();
    if (!locDialog.open) locDialog.showModal();
  }
  $("#locBtn").addEventListener("click", openLocation);
  $("#cityChips").addEventListener("click", (e) => { const b = e.target.closest("[data-city]"); if (b) setCity(b.dataset.city); });
  cityInput.addEventListener("change", () => setCity(cityInput.value));
  $("#locDone").addEventListener("click", () => { if (cityInput.value.trim() && cityInput.value.trim() !== CITY) setCity(cityInput.value); locDialog.close(); });
  locDialog.addEventListener("click", (e) => { if (e.target === locDialog) locDialog.close(); });

  // Tickets: where to buy in the visitor's city
  const ticketDialog = $("#ticketDialog");
  let ticketFor = null;
  const gsearch = (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`;
  function openTickets(m) {
    if (!m) return;
    ticketFor = m;
    if (isWorld()) {
      $(".tk-body", ticketDialog).innerHTML = `
        <div class="tk-movie" style="${theme(m.hue)}">
          <span class="tk-poster" style="${bg(m.poster)}"></span>
          <div><p class="kicker">Get tickets</p><h2>${esc(title(m))}</h2>
          <p class="muted">Worldwide release: ${esc(longDate(parseDay(m.date)))}</p></div>
        </div>
        <p class="tk-status">Ticket sites and release dates depend on where you are. Pick your country to see where to book.</p>
        <button class="btn btn-solid" type="button" data-scope="${esc(HOME_COUNTRY)}">📍 Show tickets in ${esc(countryName(HOME_COUNTRY))}</button>
        <button class="tk-loc" type="button" data-open-location><span>🌍 Choose another country</span><span class="tk-change">›</span></button>`;
      if (!ticketDialog.open) ticketDialog.showModal();
      return;
    }
    const info = TICKETS[COUNTRY];
    const place = CITY || countryName(COUNTRY);
    const name = title(m);
    const days = Math.ceil((time(m) - Date.now()) / DAY);
    const status = !datedHere(m)
      ? `<p class="tk-status warn">No release date announced in ${esc(countryName(COUNTRY))} yet. Worldwide release: ${esc(longDate(parseDay(m.date)))}.</p>`
      : isOut(m)
        ? `<p class="tk-status ok">● ${isRe(m) ? "Back in cinemas" : "Now showing"} in ${esc(countryName(COUNTRY))}</p>`
        : `<p class="tk-status">Releases ${esc(longDate(time(m)))} — in ${plural(days, "day", "days")}. Advance bookings usually open 1–4 weeks before release.</p>`;
    $(".tk-body", ticketDialog).innerHTML = `
      <div class="tk-movie" style="${theme(m.hue)}">
        <span class="tk-poster" style="${bg(m.poster)}"></span>
        <div>
          <p class="kicker">Get tickets</p>
          <h2>${esc(name)}</h2>
          <p class="muted">${esc(countryName(COUNTRY))}${m.certs?.[COUNTRY] ? ` · <span class="cert">${esc(m.certs[COUNTRY])}</span>` : ""}${m.runtime ? ` · ${Math.floor(m.runtime / 60)}h ${m.runtime % 60}m` : ""}</p>
        </div>
      </div>
      ${status}
      <button class="tk-loc" type="button" data-open-location>
        <span>📍 ${esc(CITY ? `${CITY}, ${countryName(COUNTRY)}` : countryName(COUNTRY))}</span>
        <span class="tk-change">${CITY ? "Change city" : "Choose your city"} ›</span>
      </button>
      <p class="search-label">Where to book in ${esc(place)}</p>
      <div class="tk-list">
        ${(info?.providers || []).map((p) => `
          <a class="tk-provider" href="${esc(gsearch(`${name} ${CITY || ""} tickets site:${p.domain}`))}" target="_blank" rel="noopener">
            <span class="tk-logo">${esc(p.name.slice(0, 1))}</span>
            <span class="tk-name"><strong>${esc(p.name)}</strong><small>${esc(p.domain)}</small></span>
            <span class="tk-go">Book ›</span>
          </a>`).join("")}
        <a class="tk-provider all" href="${esc(gsearch(`${name} showtimes ${place}`))}" target="_blank" rel="noopener">
          <span class="tk-logo">🎬</span>
          <span class="tk-name"><strong>All showtimes in ${esc(place)}</strong><small>Every cinema near you</small></span>
          <span class="tk-go">Open ›</span>
        </a>
      </div>
      ${!info ? `<p class="muted small">We don't have a list of ticket sites for ${esc(countryName(COUNTRY))} yet.</p>` : ""}
      <button class="link" type="button" data-ics="${esc(m.id)}">＋ Remind me — add release day to my calendar</button>`;
    if (!ticketDialog.open) ticketDialog.showModal();
  }
  $(".close", ticketDialog).addEventListener("click", () => ticketDialog.close());
  ticketDialog.addEventListener("click", (e) => { if (e.target === ticketDialog) ticketDialog.close(); });

  // Country list
  function fillCountries() {
    const codes = new Set([HOME_COUNTRY, ...REGIONS]);
    if (!isWorld()) codes.add(COUNTRY);
    DATA.movies.forEach((m) => Object.keys(m.dates || {}).forEach((c) => codes.add(c)));
    const list = [...codes].map((c) => [c, countryName(c)]).sort((a, b) => a[1].localeCompare(b[1], LANG));
    countrySel.innerHTML = `<option value="WW" ${isWorld() ? "selected" : ""}>🌐 Worldwide — all countries</option>` +
      list.map(([c, n]) => `<option value="${c}" ${c === COUNTRY ? "selected" : ""}>${esc(n)}</option>`).join("");
  }
  function setCountry(cc) {
    if (!cc) return;
    COUNTRY = cc;
    if (cc !== "WW") {
      HOME_COUNTRY = cc;
      try { localStorage.setItem(HOME_KEY, cc); } catch (_) { /* ignore */ }
    }
    try { localStorage.setItem(COUNTRY_KEY, COUNTRY); } catch (_) { /* ignore */ }
    CITY = isWorld() ? "" : loadCity(COUNTRY);
    fillCountries();
    renderCityChips();
    updateLocText();
    const y = scrollY;
    route();
    if (section(location.hash) === "home" || section(location.hash) === "calendar") scrollTo(0, y);
    if (ticketDialog.open && ticketFor) openTickets(ticketFor);
    toast(isWorld() ? "Showing worldwide releases" : `Showing ${countryName(COUNTRY)}`);
  }
  countrySel.addEventListener("change", () => setCountry(countrySel.value));

  // Add custom movie
  const addDialog = $("#addDialog");
  const addForm = $("#addForm");
  $("#addBtn").addEventListener("click", () => { addForm.reset(); addDialog.showModal(); });
  $("[data-close]", addDialog).addEventListener("click", () => addDialog.close());
  addForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = addForm.elements;
    const name = f.title.value.trim();
    if (!name || !f.date.value) return;
    const hue = hexToHue(f.color.value);
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "movie";
    const m = {
      id: `${slug}-${Date.now().toString(36)}`,
      title: name, date: f.date.value,
      director: f.director.value.trim(),
      tagline: f.tagline.value.trim(),
      backdrop: f.image.value.trim(),
      hue: [hue, (hue + 25) % 360],
    };
    custom.push(m);
    saveCustom();
    addDialog.close();
    toast(`Added “${name}”`);
    location.hash = movieHref(m);
  });

  function hexToHue(hex) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    if (!d) return 20;
    const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return Math.round((h * 60 + 360) % 360);
  }

  // Toast
  const toastEl = $("#toast");
  let toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2200);
  }

  // Solid nav after scrolling
  const onScroll = () => nav.classList.toggle("solid", scrollY > 40);
  addEventListener("scroll", onScroll, { passive: true });

  if (DATA.updated) {
    $("#updated").textContent = `Last updated ${new Date(DATA.updated).toLocaleString(LANG, { dateStyle: "medium", timeStyle: "short" })}`;
  }
  document.documentElement.lang = LANG;

  // ---------- installable app (PWA) ----------
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
  let installPrompt = null;
  const installBtn = $("#installBtn");
  addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installPrompt = e;
    installBtn.hidden = false;
  });
  installBtn.addEventListener("click", async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice.catch(() => {});
    installPrompt = null;
    installBtn.hidden = true;
  });
  addEventListener("appinstalled", () => { installBtn.hidden = true; toast("Countdown installed — find it on your home screen"); });
  // Offline notice (the app keeps working from its saved copy).
  const netToast = () => toast(navigator.onLine ? "Back online" : "You're offline — showing saved data");
  addEventListener("online", netToast);
  addEventListener("offline", netToast);

  fillCountries();
  updateLocText();
  route();
  onScroll();
  setInterval(tick, 1000);
})();
