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
  DATA.movies.forEach((m) => { m.dates = unpackDates(m.dates); });
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
  const TICKETS = window.TICKETS || {};
  const cityKey = (cc) => `movie-countdown:city:${cc}`;
  const loadCity = (cc) => { try { return localStorage.getItem(cityKey(cc)) || ""; } catch (_) { return ""; } };
  let CITY = loadCity(COUNTRY);

  const displayNames = (type) => { try { return new Intl.DisplayNames([LANG], { type }); } catch (_) { return null; } };
  const regionNames = displayNames("region");
  const languageNames = displayNames("language");
  const countryName = (cc) => { try { return regionNames?.of(cc) || cc; } catch (_) { return cc; } };
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
  const dateStr = (m) => m.dates?.[COUNTRY] || m.date;
  const datedHere = (m) => !m.dates || !!m.dates[COUNTRY];
  const parseDay = (s) => { const [y, mo, d] = s.split("-").map(Number); return new Date(y, mo - 1, d || 1).getTime(); };
  const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const startOfDay = (t = Date.now()) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const time = (m) => parseDay(dateStr(m));
  const isOut = (m) => time(m) <= Date.now();
  const byDate = (a, b) => time(a) - time(b);
  const visible = (m) => m.kind !== "rerelease" || !!m.dates?.[COUNTRY];
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

  // ---------- home ----------
  function renderHome() {
    document.title = "Movie Countdown";
    const top = anticipated();
    const hero = top[0] || upcomingHere()[0] || upcoming()[0] || released()[0];
    const here = esc(countryName(COUNTRY));
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
        </div>
        ${row("row-top", `Top 10 Most Anticipated in ${rankKey() === "WW" ? "the World" : here}`, top.slice(0, 10), rankCard, "rail-ranked")}
        ${row("row-week", `Releasing This Week in ${here}`, thisWeek, card, "",
          `<a class="row-link" href="${calHref(dayKey(Date.now()), "week")}">Open calendar ›</a>`)}
        ${row("row-upcoming", `Coming Soon in ${here}`, upcomingHere().slice(0, 30))}
        ${rankKey() !== "WW" ? row("row-world", "Worldwide Most Anticipated", anticipated("WW").slice(0, 20)) : ""}
        ${row("row-rereleases", `Back in Cinemas · ${here}`, rereleases())}
        ${languageRows()}
        ${row("row-mine", "My Countdowns", custom.slice().sort(byDate))}
        ${row("row-out", `Out Now in ${here}`, released().slice(0, 20))}
      </div>`;
    startEmbers($(".billboard canvas"), hero.hue);
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

  function releasesByDay() {
    const map = new Map();
    for (const m of listed()) {
      const k = dateStr(m);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(m);
    }
    for (const list of map.values()) {
      list.sort((a, b) => datedHere(b) - datedHere(a) || (a.hot?.[rankKey()] || 999) - (b.hot?.[rankKey()] || 999));
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

  function calendarEntry(m) {
    const orig = origTitle(m);
    return `
      <a class="cal-item" href="${movieHref(m)}" style="${theme(m.hue)}">
        <div class="cal-poster" style="${bg(m.poster || m.card)}"></div>
        <div class="cal-body">
          <strong>${esc(title(m))}</strong>
          ${orig ? `<span class="cal-orig">${esc(orig)}</span>` : ""}
          <span class="cal-meta">
            ${m.lang ? `<span class="pill">${esc(languageName(m.lang))}</span>` : ""}
            ${isRe(m) ? `<span class="pill pill-re">Re-release</span>` : ""}
            ${m.certs?.[COUNTRY] ? `<span class="cert">${esc(m.certs[COUNTRY])}</span>` : ""}
            ${datedHere(m) ? "" : `<span class="pill" title="No date announced in ${esc(countryName(COUNTRY))}">🌐 Worldwide date</span>`}
            ${m.genres?.length ? `<span>${m.genres.slice(0, 3).map(esc).join(" · ")}</span>` : ""}
          </span>
          ${m.people?.length ? `<span class="cal-people">${m.people.slice(0, 3).map(esc).join(", ")}</span>` : ""}
        </div>
        <div class="cal-side">${countdown(m, "cd-mini")}</div>
      </a>`;
  }

  function renderCalendar(selKey, mode = "day") {
    document.title = "Release Calendar — Movie Countdown";
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
          <span class="cal-thumbs">${list.slice(0, 3).map((m) => `<i style="${bg(m.poster)}"></i>`).join("")}</span>
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
            <div class="cal-grid">
              ${weekdayNames.map((w) => `<span class="cal-wd">${esc(w)}</span>`).join("")}
              ${cells}
            </div>
            <p class="muted small">🌐 = no date announced in ${here} yet, so the worldwide date is used.</p>
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
    document.title = `${title(m)} — Movie Countdown`;
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
          <div class="cta cta-center">
            ${ticketBtn(m)}
            ${trailerBtn(m)}
          </div>
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

      ${artworkSection(m)}

      <section class="about" id="about">
        <div>
          <p class="kicker">About the film</p>
          <p class="about-text">${esc(synopsis(m) || tagline(m) || "More details coming soon.")}</p>
        </div>
        <dl class="facts">
          <div><dt>Release in ${esc(countryName(COUNTRY))}</dt><dd>${datedHere(m) ? esc(longDate(time(m))) : "Not announced yet"}</dd></div>
          ${!datedHere(m) ? `<div><dt>Worldwide release</dt><dd>${esc(longDate(parseDay(m.date)))}</dd></div>` : ""}
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

  function age(birthday, end) {
    const b = new Date(birthday), e = end ? new Date(end) : new Date();
    let a = e.getFullYear() - b.getFullYear();
    if (e.getMonth() < b.getMonth() || (e.getMonth() === b.getMonth() && e.getDate() < b.getDate())) a--;
    return a;
  }

  function renderPersonPage(p) {
    document.title = `${p.name} — Movie Countdown`;
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
    document.title = `${f.title} — Movie Countdown`;
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
    const q = norm(searchInput.value.trim());
    if (!q) {
      const pick = anticipated().slice(0, 8);
      searchResults.innerHTML = `<p class="search-label">Most anticipated in ${esc(countryName(COUNTRY))}</p>${pick.map(searchMovie).join("")}`;
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
      ${!movies.length && !people.length ? `<p class="search-empty">No results for “${esc(searchInput.value)}”.</p>` : ""}`;
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
      actors: "Search actors…", directors: "Search directors…" }[searchFilter];
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
    $$(".nav-links a").forEach((a) => a.classList.toggle("active", a.dataset.section === section(h)));

    if ((m = h.match(/^#\/movie\/(.+)$/))) {
      const movie = all().find((x) => x.id === m[1]);
      return movie ? renderMovie(movie, token) : renderHome();
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
    $("#locText").textContent = CITY ? `${CITY}` : countryName(COUNTRY);
    $("#locBtn").title = `${CITY ? CITY + ", " : ""}${countryName(COUNTRY)}`;
  }
  function renderCityChips() {
    const cities = TICKETS[COUNTRY]?.cities || [];
    $("#cityChips").innerHTML = cities.length
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
    const codes = new Set([COUNTRY, ...REGIONS]);
    DATA.movies.forEach((m) => Object.keys(m.dates || {}).forEach((c) => codes.add(c)));
    const list = [...codes].map((c) => [c, countryName(c)]).sort((a, b) => a[1].localeCompare(b[1], LANG));
    countrySel.innerHTML = list.map(([c, n]) => `<option value="${c}" ${c === COUNTRY ? "selected" : ""}>${esc(n)}</option>`).join("");
  }
  countrySel.addEventListener("change", () => {
    COUNTRY = countrySel.value;
    try { localStorage.setItem(COUNTRY_KEY, COUNTRY); } catch (_) { /* ignore */ }
    CITY = loadCity(COUNTRY);
    renderCityChips();
    updateLocText();
    route();
    if (ticketDialog.open && ticketFor) openTickets(ticketFor);
  });

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

  fillCountries();
  updateLocText();
  route();
  onScroll();
  setInterval(tick, 1000);
})();
