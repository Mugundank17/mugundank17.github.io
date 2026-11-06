(() => {
  "use strict";

  const STORE = "movie-countdown:custom:v1";
  const COUNTRY_KEY = "movie-countdown:country";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const app = $("#app");
  const nav = $("#nav");
  const DAY = 86400000;

  // ---------- data ----------
  const DATA = window.MOVIE_DATA || { movies: [] };
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

  // ---------- locale: language + country ----------
  const LANG = (navigator.languages && navigator.languages[0]) || navigator.language || "en-US";
  const LANG_BASE = LANG.split("-")[0].toLowerCase();

  // Time zone → country, so release dates follow where the visitor actually is.
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

  const regionNames = (() => { try { return new Intl.DisplayNames([LANG], { type: "region" }); } catch (_) { return null; } })();
  const countryName = (cc) => { try { return regionNames?.of(cc) || cc; } catch (_) { return cc; } };

  // Translated titles / overviews / taglines from TMDB, loaded only for the visitor's language.
  let TR = {};
  if (LANG_BASE !== "en") {
    fetch(`data/i18n/${encodeURIComponent(LANG_BASE)}.json`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((t) => { TR = t || {}; route(); })
      .catch(() => {});
  }
  const tr = (m, field, fallback) => TR[m.tmdb]?.[field] || fallback;
  const title = (m) => tr(m, "title", m.title);
  const synopsis = (m) => tr(m, "overview", m.synopsis);
  const tagline = (m) => tr(m, "tagline", m.tagline);

  // Countdown unit labels in the visitor's language ("Days", "Tage", "jours", "दिन" …).
  const unitLabel = (unit, fallback) => {
    try {
      const parts = new Intl.NumberFormat(LANG, { style: "unit", unit, unitDisplay: "long" }).formatToParts(2);
      const label = parts.filter((p) => p.type === "unit").map((p) => p.value).join("").trim();
      return label || fallback;
    } catch (_) { return fallback; }
  };
  const UNITS = [unitLabel("day", "Days"), unitLabel("hour", "Hours"), unitLabel("minute", "Minutes"), unitLabel("second", "Seconds")];

  // ---------- dates (per country) ----------
  const dateStr = (m) => m.dates?.[COUNTRY] || m.date;
  const datedHere = (m) => !m.dates || !!m.dates[COUNTRY];
  const parseDay = (s) => { const [y, mo, d] = s.split("-").map(Number); return new Date(y, mo - 1, d || 1).getTime(); };
  const time = (m) => parseDay(dateStr(m));
  const isOut = (m) => time(m) <= Date.now();
  const byDate = (a, b) => time(a) - time(b);
  const visible = (m) => m.kind !== "rerelease" || !!m.dates?.[COUNTRY]; // re-releases are local events
  const isRe = (m) => m.kind === "rerelease";

  const upcoming = () => all().filter((m) => visible(m) && !isRe(m) && !isOut(m)).sort(byDate);
  const released = () => all().filter((m) => visible(m) && !isRe(m) && isOut(m)).sort((a, b) => byDate(b, a));
  const rereleases = () => all().filter((m) => visible(m) && isRe(m)).sort(byDate);

  // ---------- helpers ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pad = (n) => String(n).padStart(2, "0");
  const fmt = (t, opts) => new Date(t).toLocaleDateString(LANG, opts);
  const longDate = (t) => fmt(t, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const shortDate = (t) => fmt(t, { month: "short", day: "numeric", year: "numeric" });
  const theme = (h) => `--h1:${h?.[0] ?? 20};--h2:${h?.[1] ?? 40}`;
  const bg = (u) => (u ? `background-image:url(&quot;${esc(encodeURI(u))}&quot;)` : "");
  const initials = (n) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const longestWord = (t) => Math.max(...t.split(/\s+/).map((w) => w.length));
  const movieHref = (m) => `#/movie/${encodeURIComponent(m.id)}`;
  const personHref = (id) => `#/person/${encodeURIComponent(id)}`;

  function parts(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    return [Math.floor(s / 86400), Math.floor((s % 86400) / 3600), Math.floor((s % 3600) / 60), s % 60];
  }

  // A countdown block for a timestamp; tick() keeps every [data-t] live.
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
    const first = m.trailers?.[0];
    if (!first) return `<button class="play" type="button" disabled><span>▶</span> Trailer coming soon</button>`;
    const label = first.type === "Teaser" ? "Watch Teaser" : "Watch Trailer";
    return `<button class="play" type="button" data-trailer="${esc(m.id)}"><span>▶</span> ${label}</button>`;
  }

  function titleArt(m, cls) {
    const useLogo = m.logo && (LANG_BASE === "en" || !TR[m.tmdb]?.title);
    return useLogo
      ? `<img class="${cls} logo" src="${esc(m.logo)}" alt="${esc(title(m))}" loading="lazy">`
      : `<span class="${cls}">${esc(title(m))}</span>`;
  }
  function ticketHref(m) {
    return m.tickets || `https://www.google.com/search?q=${encodeURIComponent(title(m) + " movie tickets near me")}`;
  }
  const localNote = (m) => (datedHere(m) ? ""
    : `<p class="local-note">No release date announced in ${esc(countryName(COUNTRY))} yet — showing the worldwide date.</p>`);

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
          ${isRe(m) ? `<span class="tag tag-re">Re-release</span>` : ""}
        </div>
        <div class="card-info">
          <strong>${esc(title(m))}</strong>
          <span>${esc(shortDate(time(m)))}${m.certs?.[COUNTRY] ? ` · ${esc(m.certs[COUNTRY])}` : ""}</span>
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

  function row(id, heading, items, render = card, cls = "") {
    if (!items.length) return "";
    return `<section class="row" id="${id}"><h2 class="row-title">${heading}</h2>${rail(items, render, cls)}</section>`;
  }

  // ---------- home ----------
  function renderHome() {
    document.title = "Movie Countdown";
    const up = upcoming();
    const hero = up[0] || released()[0];
    const years = [...new Set(up.map((m) => dateStr(m).slice(0, 4)))];

    if (!hero) {
      app.innerHTML = `<section class="empty-state"><h1>No movies yet</h1>
        <p>Run the “Update movies” GitHub Action (or <code>npm run update</code>) to load movies from TMDB, or press + Add.</p></section>`;
      return;
    }
    app.innerHTML = `
      <header class="billboard cine" style="${theme(hero.hue)}">
        ${fireLayers(hero.backdrop)}
        <div class="billboard-body">
          <p class="kicker">${isOut(hero) ? "Now showing" : "Next release"} · ${esc(countryName(COUNTRY))}</p>
          <h1 class="bb-title">${hero.logo && !TR[hero.tmdb]?.title ? `<img class="bb-logo" src="${esc(hero.logo)}" alt="${esc(title(hero))}">` : esc(title(hero))}</h1>
          <p class="bb-meta">${esc(longDate(time(hero)))}${hero.certs?.[COUNTRY] ? ` · <span class="cert">${esc(hero.certs[COUNTRY])}</span>` : ""}${hero.genres?.length ? " · " + hero.genres.map(esc).join(" · ") : ""}</p>
          ${synopsis(hero) ? `<p class="bb-text">${esc(synopsis(hero))}</p>` : ""}
          ${countdown(hero, "cd-bb")}
          <div class="cta">
            <a class="btn btn-solid" href="${movieHref(hero)}">ⓘ More Info</a>
            ${trailerBtn(hero)}
          </div>
        </div>
      </header>
      <div class="rows">
        ${row("row-top", "Next to Release", up.slice(0, 5), rankCard, "rail-ranked")}
        ${row("row-upcoming", "Coming Soon", up)}
        ${row("row-rereleases", `Back in Cinemas · ${esc(countryName(COUNTRY))}`, rereleases())}
        ${years.map((y) => row(`row-${y}`, `Coming in ${y}`, up.filter((m) => dateStr(m).startsWith(y)))).join("")}
        ${row("row-mine", "My Countdowns", custom.slice().sort(byDate))}
        ${row("row-out", "Out Now", released())}
      </div>`;
    startEmbers($(".billboard canvas"), hero.hue);
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
    return c.tmdb
      ? `<a class="person" href="${personHref(c.tmdb)}">${inner}</a>`
      : `<article class="person">${inner}</article>`;
  }

  function videoSection(m) {
    if (!m.trailers?.length) return "";
    const first = m.trailers[0];
    return `
      <section class="watch" id="watch">
        <p class="kicker">Trailers &amp; teasers</p>
        <div class="player" data-player="${esc(m.id)}">
          ${playerPoster(first, 0)}
        </div>
        ${m.trailers.length > 1 ? `
        <div class="video-list">
          ${m.trailers.map((v, i) => `
            <button class="video-thumb ${i === 0 ? "active" : ""}" type="button" data-inline="${i}">
              <img src="https://i.ytimg.com/vi/${encodeURIComponent(v.key)}/mqdefault.jpg" alt="" loading="lazy">
              <span class="vt-name">${esc(v.name)}</span>
              <span class="vt-meta">${esc(v.type)}${v.published ? " · " + esc(shortDate(parseDay(v.published))) : ""}</span>
            </button>`).join("")}
        </div>` : ""}
      </section>`;
  }
  const playerPoster = (v, i) => `
    <button class="player-poster" type="button" data-inline-play="${i}" style="${bg(`https://i.ytimg.com/vi/${v.key}/hqdefault.jpg`)}">
      <span class="vt-play big">▶</span><span class="player-name">${esc(v.name)}</span>
    </button>`;
  const embed = (v, title_) => `
    <iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(v.key)}?autoplay=1&rel=0&modestbranding=1&playsinline=1"
      title="${esc(title_)} — ${esc(v.name)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;

  function renderMovie(m) {
    document.title = `${title(m)} — Movie Countdown`;
    const cast = m.cast || [];
    const more = upcoming().filter((x) => x.id !== m.id);
    const isCustom = custom.some((c) => c.id === m.id);
    const cert = m.certs?.[COUNTRY];
    const byline = m.directors?.length
      ? m.directors.map((d) => `<a href="${personHref(d.id)}">${esc(d.name)}</a>`).join(" &amp; ")
      : esc(m.director || "");

    app.innerHTML = `
      <header class="cine hero" style="${theme(m.hue)}">
        ${fireLayers(m.backdrop, orb)}
        <div class="hero-body">
          ${isRe(m) ? `<p class="byline re">Re-release · Originally ${esc(m.originalDate?.slice(0, 4) || "")}</p>` : ""}
          ${byline ? `<p class="byline">A film by <strong>${byline}</strong></p>` : ""}
          <h1 class="mega" style="--len:${longestWord(title(m))}">${esc(title(m))}</h1>
          ${tagline(m) ? `<p class="tagline">${esc(tagline(m))}</p>` : ""}
          ${countdown(m, "cd-hero")}
          ${localNote(m)}
          <div class="cta cta-center">
            <a class="btn btn-outline" href="${esc(ticketHref(m))}" target="_blank" rel="noopener">Get Tickets</a>
            ${trailerBtn(m)}
          </div>
          <button class="link" type="button" data-ics="${esc(m.id)}">＋ Add to calendar</button>
        </div>
        <a class="scroll-hint" href="#cast" data-scroll="${cast.length ? "cast" : "about"}" aria-label="Scroll down">⌄</a>
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
      </section>` : ""}

      ${videoSection(m)}

      <section class="about" id="about">
        <div>
          <p class="kicker">About the film</p>
          <p class="about-text">${esc(synopsis(m) || tagline(m) || "More details coming soon.")}</p>
        </div>
        <dl class="facts">
          <div><dt>Release in ${esc(countryName(COUNTRY))}</dt><dd>${datedHere(m) ? esc(longDate(time(m))) : "Not announced yet"}</dd></div>
          ${!datedHere(m) ? `<div><dt>Worldwide release</dt><dd>${esc(longDate(parseDay(m.date)))}</dd></div>` : ""}
          ${isRe(m) && m.originalDate ? `<div><dt>Original release</dt><dd>${esc(longDate(parseDay(m.originalDate)))}</dd></div>` : ""}
          ${cert ? `<div><dt>Rating</dt><dd><span class="cert">${esc(cert)}</span></dd></div>` : ""}
          ${byline ? `<div><dt>Director</dt><dd>${byline}</dd></div>` : ""}
          ${m.genres?.length ? `<div><dt>Genre</dt><dd>${m.genres.map(esc).join(", ")}</dd></div>` : ""}
          ${m.runtime ? `<div><dt>Runtime</dt><dd>${Math.floor(m.runtime / 60)}h ${m.runtime % 60}m</dd></div>` : ""}
          ${cast.length ? `<div><dt>Starring</dt><dd>${cast.slice(0, 4).map((c) =>
            c.tmdb ? `<a href="${personHref(c.tmdb)}">${esc(c.actor)}</a>` : esc(c.actor)).join(", ")}</dd></div>` : ""}
        </dl>
        ${isCustom ? `<button class="btn btn-ghost btn-sm" type="button" data-remove="${esc(m.id)}">Remove this countdown</button>` : ""}
      </section>

      <div class="rows">${row("row-more", "More Countdowns", more)}</div>`;

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

  // A credit from a person's filmography, linked to the full page when we have it.
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
    const upcomingCredits = credits.filter((f) => {
      const c = creditInfo(f, p.id);
      return (c.t === null || c.t > now) && !(c.full && isRe(c.full));
    }).sort((a, b) => (creditInfo(a, p.id).t ?? Infinity) - (creditInfo(b, p.id).t ?? Infinity));
    const backInCinemas = credits.filter((f) => { const m = byTmdb.get(f.id); return m && isRe(m) && visible(m); });
    const known = (p.knownFor || []).map((id) => credits.find((f) => f.id === id)).filter(Boolean);
    const past = credits.filter((f) => f.date && parseDay(f.date) <= now && !upcomingCredits.includes(f));
    const backdrop = credits.map((f) => byTmdb.get(f.id)?.backdrop).find(Boolean) ||
      known.map((f) => f.backdrop).find(Boolean);

    const byYear = {};
    for (const f of credits) (byYear[f.date ? f.date.slice(0, 4) : "TBA"] ||= []).push(f);
    const years = Object.keys(byYear).sort((a, b) => (b === "TBA") - (a === "TBA") || b.localeCompare(a));

    const bio = (p.bio || "").split(/\n+/).filter(Boolean);
    const born = p.birthday ? `Born ${esc(longDate(parseDay(p.birthday)))}${p.deathday ? "" : ` (age ${age(p.birthday)})`}` : "";
    const died = p.deathday ? `Died ${esc(longDate(parseDay(p.deathday)))} (aged ${age(p.birthday, p.deathday)})` : "";

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
        ${row("p-upcoming", "Upcoming", upcomingCredits, (f) => pcard(f, p.id), "rail-posters")}
        ${row("p-back", `Back in Cinemas · ${esc(countryName(COUNTRY))}`, backInCinemas, (f) => pcard(f, p.id), "rail-posters")}
        ${row("p-known", "Known For", known, (f) => pcard(f, p.id), "rail-posters")}
        ${row("p-past", "Latest Films", past.slice(0, 20), (f) => pcard(f, p.id), "rail-posters")}
      </div>

      ${p.photos?.length > 1 ? `
      <section class="row gallery">
        <h2 class="row-title">Photos</h2>
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

  // A film from someone's filmography that isn't on our countdown list.
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

  // ---------- embers (canvas particles) ----------
  let embers = [];
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  function startEmbers(canvas, hue, density = 1) {
    if (!canvas || reduceMotion) return;
    const ctx = canvas.getContext("2d");
    const hues = hue || [20, 40];
    const dpr = Math.min(devicePixelRatio || 1, 2);
    let w, h, ps;
    const make = (fresh) => ({
      x: Math.random() * w, y: fresh ? Math.random() * h : h + 10,
      r: (Math.random() * 1.8 + 0.4) * dpr, vy: (Math.random() * 0.6 + 0.2) * dpr,
      vx: (Math.random() - 0.5) * 0.3 * dpr, life: Math.random(),
      hue: hues[Math.random() < 0.6 ? 0 : 1] + (Math.random() * 20 - 10),
    });
    const resize = () => {
      w = canvas.width = canvas.offsetWidth * dpr;
      h = canvas.height = canvas.offsetHeight * dpr;
      ps = Array.from({ length: Math.round((w * h) / (9000 * dpr * dpr) * density) }, () => make(true));
    };
    resize();
    const state = { canvas, raf: 0, resize };
    const frame = () => {
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      for (const p of ps) {
        p.y -= p.vy; p.x += p.vx + Math.sin((p.y + p.life * 500) / 60) * 0.25;
        p.life += 0.004;
        if (p.y < -10) Object.assign(p, make(false));
        const a = 0.35 + 0.45 * Math.abs(Math.sin(p.life * 6));
        ctx.fillStyle = `hsla(${p.hue},100%,62%,${a})`;
        ctx.shadowColor = `hsla(${p.hue},100%,55%,1)`;
        ctx.shadowBlur = 8 * dpr;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      }
      state.raf = requestAnimationFrame(frame);
    };
    frame();
    embers.push(state);
  }

  function stopEmbers() {
    embers.forEach((e) => cancelAnimationFrame(e.raf));
    embers = [];
  }
  addEventListener("resize", () => embers.forEach((e) => e.resize()));

  // ---------- routing ----------
  let routeToken = 0;
  function route() {
    stopEmbers();
    const token = ++routeToken;
    const h = decodeURIComponent(location.hash);
    let m;

    if ((m = h.match(/^#\/movie\/(.+)$/))) {
      const movie = all().find((x) => x.id === m[1]);
      return movie ? renderMovie(movie) : renderHome();
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

  addEventListener("hashchange", () => { route(); scrollTo(0, 0); });

  // ---------- interactions ----------
  document.addEventListener("click", (e) => {
    const t = e.target;

    const scrollLink = t.closest("[data-scroll]");
    if (scrollLink) {
      e.preventDefault();
      const go = () => document.getElementById(scrollLink.dataset.scroll)?.scrollIntoView({ behavior: "smooth" });
      if (!document.getElementById(scrollLink.dataset.scroll)) { location.hash = "#/"; setTimeout(go, 80); } else go();
      return;
    }

    const railBtn = t.closest(".rail-btn, .round");
    if (railBtn) {
      const scope = railBtn.closest(".rail-wrap") || railBtn.closest(".cast-body");
      const r = $(".rail", scope);
      r.scrollBy({ left: (railBtn.classList.contains("next") ? 1 : -1) * r.clientWidth * 0.85, behavior: "smooth" });
      return;
    }

    const tr_ = t.closest("[data-trailer]");
    if (tr_) return openTrailer(all().find((m) => m.id === tr_.dataset.trailer), +(tr_.dataset.index || 0));

    const pick = t.closest("[data-video]");
    if (pick) return playVideo(+pick.dataset.video);

    // Inline player on the movie page
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
      const el = $(".pbio");
      const open_ = el.classList.toggle("clamp");
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
    if (!m?.trailers?.length) return;
    $$("[data-player] iframe").forEach((f) => f.remove()); // don't play two at once
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

  // Country picker
  const countrySel = $("#country");
  function fillCountries() {
    const codes = new Set([COUNTRY]);
    DATA.movies.forEach((m) => Object.keys(m.dates || {}).forEach((c) => codes.add(c)));
    const list = [...codes].map((c) => [c, countryName(c)]).sort((a, b) => a[1].localeCompare(b[1], LANG));
    countrySel.innerHTML = list.map(([c, n]) => `<option value="${c}" ${c === COUNTRY ? "selected" : ""}>${esc(n)}</option>`).join("");
  }
  countrySel.addEventListener("change", () => {
    COUNTRY = countrySel.value;
    try { localStorage.setItem(COUNTRY_KEY, COUNTRY); } catch (_) { /* ignore */ }
    route();
    toast(`Showing release dates for ${countryName(COUNTRY)}`);
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
  route();
  onScroll();
  setInterval(tick, 1000);
})();
