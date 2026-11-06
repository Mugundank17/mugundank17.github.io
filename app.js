(() => {
  "use strict";

  const STORE = "movie-countdown:custom:v1";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const app = $("#app");
  const nav = $("#nav");

  // ---------- data ----------
  const DATA = window.MOVIE_DATA || { movies: [] };
  let custom = loadCustom();
  const all = () => [...DATA.movies, ...custom];

  function loadCustom() {
    try {
      const v = JSON.parse(localStorage.getItem(STORE) || "[]");
      return Array.isArray(v) ? v : [];
    } catch (_) { return []; }
  }
  function saveCustom() {
    try { localStorage.setItem(STORE, JSON.stringify(custom)); } catch (_) { /* ignore */ }
  }

  const time = (m) => {
    const [y, mo, d] = m.date.split("-").map(Number);
    return new Date(y, mo - 1, d).getTime();
  };
  const isOut = (m) => time(m) <= Date.now();
  const byDate = (a, b) => time(a) - time(b);
  const upcoming = () => all().filter((m) => !isOut(m)).sort(byDate);
  const released = () => all().filter(isOut).sort((a, b) => byDate(b, a));

  // ---------- helpers ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pad = (n) => String(n).padStart(2, "0");
  const fmtDate = (m) => new Date(time(m)).toLocaleDateString(undefined,
    { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const shortDate = (m) => new Date(time(m)).toLocaleDateString(undefined,
    { month: "short", day: "numeric", year: "numeric" });
  const theme = (m) => `--h1:${m.hue?.[0] ?? 20};--h2:${m.hue?.[1] ?? 40}`;
  const img = (u) => (u ? `url("${encodeURI(u)}")` : "none");
  const initials = (n) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const longestWord = (t) => Math.max(...t.split(/\s+/).map((w) => w.length));

  function parts(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    return [Math.floor(s / 86400), Math.floor((s % 86400) / 3600), Math.floor((s % 3600) / 60), s % 60];
  }

  function daysLeft(m) {
    return Math.ceil((time(m) - Date.now()) / 86400000);
  }

  // A countdown block; tick() keeps every [data-t] element live.
  function countdown(m, cls = "") {
    if (isOut(m)) return `<div class="cd ${cls} out">Now in cinemas</div>`;
    const labels = ["Days", "Hours", "Minutes", "Seconds"];
    const p = parts(time(m) - Date.now());
    return `<div class="cd ${cls}" data-t="${time(m)}">${labels.map((l, i) =>
      `<div class="cd-u"><b>${i ? pad(p[i]) : p[i]}</b><span>${l}</span></div>`).join("")}</div>`;
  }

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

  const fireLayers = (m, extra = "") => `
    <div class="fire ${m.backdrop ? "has-img" : ""}" aria-hidden="true">
      <div class="fire-img" style="background-image:${esc(img(m.backdrop))}"></div>
      <div class="smoke s1"></div><div class="smoke s2"></div><div class="smoke s3"></div>
      ${extra}
      <canvas class="embers"></canvas>
      <div class="vignette"></div>
    </div>`;

  function trailerBtn(m) {
    const first = m.trailers?.[0];
    const label = first ? (first.type === "Teaser" ? "Watch Teaser" : "Watch Trailer") : "Find Trailer";
    return `<button class="play" type="button" data-trailer="${esc(m.id)}"><span>▶</span> ${label}</button>`;
  }

  function titleArt(m, cls) {
    return m.logo
      ? `<img class="${cls} logo" src="${esc(m.logo)}" alt="${esc(m.title)}" loading="lazy">`
      : `<span class="${cls}">${esc(m.title)}</span>`;
  }
  function ticketHref(m) {
    return m.tickets || `https://www.google.com/search?q=${encodeURIComponent(m.title + " movie tickets near me")}`;
  }

  // ---------- cards & rows ----------
  function card(m) {
    const art = m.card || m.backdrop || m.poster;
    const d = daysLeft(m);
    const badge = isOut(m) ? `<span class="tag tag-out">Out now</span>`
      : d <= 30 ? `<span class="tag">${d <= 1 ? "Tomorrow" : `${d} days`}</span>` : "";
    return `
      <a class="card" href="#/movie/${encodeURIComponent(m.id)}" style="${theme(m)}">
        <div class="card-art ${art ? "has-img" : ""}" style="background-image:${esc(img(art))}">
          ${titleArt(m, "card-title")}
          ${badge}
        </div>
        <div class="card-info">
          <strong>${esc(m.title)}</strong>
          <span>${esc(shortDate(m))}</span>
          ${countdown(m, "cd-mini")}
        </div>
      </a>`;
  }

  function rankCard(m, i) {
    return `<div class="rank"><span class="rank-n">${i + 1}</span>${card(m)}</div>`;
  }

  function row(id, title, items, ranked = false) {
    if (!items.length) return "";
    return `
      <section class="row" id="${id}">
        <h2 class="row-title">${title}</h2>
        <div class="rail-wrap">
          <button class="rail-btn prev" type="button" aria-label="Scroll left">‹</button>
          <div class="rail ${ranked ? "rail-ranked" : ""}">${items.map(ranked ? rankCard : card).join("")}</div>
          <button class="rail-btn next" type="button" aria-label="Scroll right">›</button>
        </div>
      </section>`;
  }

  // ---------- pages ----------
  function renderHome() {
    document.title = "Movie Countdown";
    const up = upcoming();
    const hero = up[0] || released()[0];
    const years = [...new Set(up.map((m) => m.date.slice(0, 4)))];

    if (!hero) {
      app.innerHTML = `<section class="empty-state"><h1>No movies yet</h1>
        <p>Run the “Update movies” GitHub Action (or <code>npm run update</code>) to load movies from TMDB, or press + Add.</p></section>`;
      return;
    }
    app.innerHTML = `
      ${hero ? `
      <header class="billboard cine" style="${theme(hero)}">
        ${fireLayers(hero)}
        <div class="billboard-body">
          <p class="kicker">${isOut(hero) ? "Now showing" : "Next release"}</p>
          <h1 class="bb-title">${hero.logo ? `<img class="bb-logo" src="${esc(hero.logo)}" alt="${esc(hero.title)}">` : esc(hero.title)}</h1>
          <p class="bb-meta">${esc(fmtDate(hero))}${hero.genres ? " · " + hero.genres.map(esc).join(" · ") : ""}</p>
          ${hero.synopsis ? `<p class="bb-text">${esc(hero.synopsis)}</p>` : ""}
          ${countdown(hero, "cd-bb")}
          <div class="cta">
            <a class="btn btn-solid" href="#/movie/${encodeURIComponent(hero.id)}">ⓘ More Info</a>
            ${trailerBtn(hero)}
          </div>
        </div>
      </header>` : ""}
      <div class="rows">
        ${row("row-top", "Next to Release", up.slice(0, 5), true)}
        ${row("row-upcoming", "Coming Soon", up)}
        ${years.map((y) => row(`row-${y}`, `Coming in ${y}`, up.filter((m) => m.date.startsWith(y)))).join("")}
        ${row("row-mine", "My Countdowns", custom.slice().sort(byDate))}
        ${row("row-out", "Out Now", released())}
      </div>`;
    if (hero) startEmbers($(".billboard canvas"), hero);
  }

  function renderDetail(m) {
    document.title = `${m.title} — Movie Countdown`;
    const cast = m.cast || [];
    const more = upcoming().filter((x) => x.id !== m.id);
    const isCustom = custom.some((c) => c.id === m.id);

    app.innerHTML = `
      <header class="cine hero" style="${theme(m)}">
        ${fireLayers(m, orb)}
        <div class="hero-body">
          ${m.director ? `<p class="byline">A film by <strong>${esc(m.director)}</strong></p>` : ""}
          <h1 class="mega" style="--len:${longestWord(m.title)}">${esc(m.title)}</h1>
          ${m.tagline ? `<p class="tagline">${esc(m.tagline)}</p>` : ""}
          ${countdown(m, "cd-hero")}
          <div class="cta cta-center">
            <a class="btn btn-outline" href="${esc(ticketHref(m))}" target="_blank" rel="noopener">Get Tickets</a>
            ${trailerBtn(m)}
          </div>
          <button class="link" type="button" data-ics="${esc(m.id)}">＋ Add to calendar</button>
        </div>
        <a class="scroll-hint" href="#cast" data-scroll="cast" aria-label="Scroll down">⌄</a>
      </header>

      ${cast.length ? `
      <section class="cine cast" id="cast" style="${theme(m)}">
        ${fireLayers(m)}
        <div class="cast-body">
          <p class="kicker">Cast</p>
          <h2 class="cast-title">${esc(m.title)}</h2>
          ${countdown(m, "cd-small")}
          <div class="rail-wrap">
            <div class="rail cast-rail">
              ${cast.map((c) => `
                <article class="person">
                  <div class="person-photo ${c.photo ? "has-img" : ""}" style="background-image:${esc(img(c.photo))}">
                    ${c.photo ? "" : `<span>${esc(initials(c.actor))}</span>`}
                  </div>
                  <p class="person-actor">${esc(c.role ? c.actor : "Cast")}</p>
                  <h3 class="person-role">${esc(c.role || c.actor)}</h3>
                  <a class="btn btn-outline btn-sm" target="_blank" rel="noopener"
                     href="${c.tmdb ? `https://www.themoviedb.org/person/${encodeURIComponent(c.tmdb)}` : `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(c.actor)}`}">See More</a>
                </article>`).join("")}
            </div>
          </div>
          <div class="rail-arrows">
            <button class="round prev" type="button" aria-label="Previous">‹</button>
            <button class="round next" type="button" aria-label="Next">›</button>
          </div>
        </div>
      </section>` : ""}

      <section class="about">
        <div>
          <p class="kicker">About the film</p>
          <p class="about-text">${esc(m.synopsis || m.tagline || "More details coming soon.")}</p>
        </div>
        <dl class="facts">
          <div><dt>Release</dt><dd>${esc(fmtDate(m))}</dd></div>
          ${m.director ? `<div><dt>Director</dt><dd>${esc(m.director)}</dd></div>` : ""}
          ${m.genres?.length ? `<div><dt>Genre</dt><dd>${m.genres.map(esc).join(", ")}</dd></div>` : ""}
          ${m.runtime ? `<div><dt>Runtime</dt><dd>${Math.floor(m.runtime / 60)}h ${m.runtime % 60}m</dd></div>` : ""}
          ${cast.length ? `<div><dt>Starring</dt><dd>${cast.slice(0, 4).map((c) => esc(c.actor)).join(", ")}</dd></div>` : ""}
        </dl>
        ${m.trailers?.length ? `
        <div class="videos">
          <p class="kicker">Trailers &amp; teasers</p>
          <div class="video-grid">
            ${m.trailers.map((v, i) => `
              <button class="video-thumb" type="button" data-trailer="${esc(m.id)}" data-index="${i}">
                <img src="https://i.ytimg.com/vi/${encodeURIComponent(v.key)}/hqdefault.jpg" alt="" loading="lazy">
                <span class="vt-play">▶</span>
                <span class="vt-name">${esc(v.name)}</span>
                <span class="vt-meta">${esc(v.type)}${v.published ? " · " + esc(v.published) : ""}</span>
              </button>`).join("")}
          </div>
        </div>` : ""}
        ${m.links ? `
        <div class="links">
          ${m.links.official ? `<a class="btn btn-ghost btn-sm" href="${esc(m.links.official)}" target="_blank" rel="noopener">Official site ↗</a>` : ""}
          ${m.links.imdb ? `<a class="btn btn-ghost btn-sm" href="${esc(m.links.imdb)}" target="_blank" rel="noopener">IMDb ↗</a>` : ""}
          ${m.links.letterboxd ? `<a class="btn btn-ghost btn-sm" href="${esc(m.links.letterboxd)}" target="_blank" rel="noopener">Letterboxd ↗</a>` : ""}
          ${m.links.tmdb ? `<a class="btn btn-ghost btn-sm" href="${esc(m.links.tmdb)}" target="_blank" rel="noopener">TMDB ↗</a>` : ""}
        </div>` : ""}
        ${isCustom ? `<button class="btn btn-ghost btn-sm" type="button" data-remove="${esc(m.id)}">Remove this countdown</button>` : ""}
      </section>

      <div class="rows">${row("row-more", "More Countdowns", more)}</div>`;

    startEmbers($(".hero canvas"), m);
    const castCanvas = $(".cast canvas");
    if (castCanvas) startEmbers(castCanvas, m, 0.5);
  }

  // ---------- embers (canvas particles) ----------
  let embers = [];
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  function startEmbers(canvas, m, density = 1) {
    if (!canvas || reduceMotion) return;
    const ctx = canvas.getContext("2d");
    const hues = m.hue || [20, 40];
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
  function route() {
    stopEmbers();
    const match = location.hash.match(/^#\/movie\/(.+)$/);
    const movie = match && all().find((m) => m.id === decodeURIComponent(match[1]));
    if (movie) renderDetail(movie); else renderHome();
    nav.classList.toggle("on-detail", !!movie);
  }

  addEventListener("hashchange", () => { route(); scrollTo(0, 0); });

  // ---------- interactions ----------
  document.addEventListener("click", (e) => {
    const t = e.target;

    const scrollLink = t.closest("[data-scroll]");
    if (scrollLink) {
      const target = document.getElementById(scrollLink.dataset.scroll);
      if (target || location.hash.startsWith("#/movie")) {
        e.preventDefault();
        const go = () => document.getElementById(scrollLink.dataset.scroll)?.scrollIntoView({ behavior: "smooth" });
        if (!target) { location.hash = "#/"; setTimeout(go, 50); } else go();
      }
      return;
    }

    const railBtn = t.closest(".rail-btn, .round");
    if (railBtn) {
      const scope = railBtn.closest(".rail-wrap") || railBtn.closest(".cast-body");
      const rail = $(".rail", scope);
      rail.scrollBy({ left: (railBtn.classList.contains("next") ? 1 : -1) * rail.clientWidth * 0.85, behavior: "smooth" });
      return;
    }

    const tr = t.closest("[data-trailer]");
    if (tr) return openTrailer(all().find((m) => m.id === tr.dataset.trailer), +(tr.dataset.index || 0));

    const pick = t.closest("[data-video]");
    if (pick) return playVideo(+pick.dataset.video);

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

  // Trailer
  const trailer = $("#trailer");
  let playing = null;
  function openTrailer(m, index = 0) {
    if (!m) return;
    const vids = m.trailers || (m.trailer ? [{ key: m.trailer, name: "Trailer", type: "Trailer" }] : []);
    if (!vids.length) {
      open(`https://www.youtube.com/results?search_query=${encodeURIComponent(m.title + " official trailer")}`, "_blank", "noopener");
      return;
    }
    playing = { m, vids };
    $(".playlist", trailer).innerHTML = vids.length > 1
      ? vids.map((v, i) => `<button type="button" data-video="${i}">${esc(v.name)}</button>`).join("") : "";
    playVideo(index);
    if (!trailer.open) trailer.showModal();
  }
  function playVideo(i) {
    if (!playing) return;
    const v = playing.vids[i] || playing.vids[0];
    $(".video", trailer).innerHTML =
      `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(v.key)}?autoplay=1&rel=0"
        title="${esc(playing.m.title)} — ${esc(v.name)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
    $$(".playlist button", trailer).forEach((b) => b.classList.toggle("active", +b.dataset.video === i));
  }
  trailer.addEventListener("close", () => { $(".video", trailer).innerHTML = ""; playing = null; });
  $(".close", trailer).addEventListener("click", () => trailer.close());
  trailer.addEventListener("click", (e) => { if (e.target === trailer) trailer.close(); });

  // Calendar (.ics)
  function downloadIcs(m) {
    if (!m) return;
    const d = m.date.replace(/-/g, "");
    const next = new Date(time(m) + 86400000);
    const d2 = `${next.getFullYear()}${pad(next.getMonth() + 1)}${pad(next.getDate())}`;
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    const ics = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Movie Countdown//EN", "BEGIN:VEVENT",
      `UID:${m.id}@movie-countdown`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${d2}`,
      `SUMMARY:${m.title.replace(/[,;]/g, "\\$&")} — in cinemas`,
      "END:VEVENT", "END:VCALENDAR",
    ].join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    a.download = `${m.id}.ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // Add custom movie
  const addDialog = $("#addDialog");
  const addForm = $("#addForm");
  $("#addBtn").addEventListener("click", () => { addForm.reset(); addDialog.showModal(); });
  $("[data-close]", addDialog).addEventListener("click", () => addDialog.close());
  addForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = addForm.elements;
    const title = f.title.value.trim();
    if (!title || !f.date.value) return;
    const hue = hexToHue(f.color.value);
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "movie";
    const m = {
      id: `${slug}-${Date.now().toString(36)}`,
      title, date: f.date.value,
      director: f.director.value.trim(),
      tagline: f.tagline.value.trim(),
      backdrop: f.image.value.trim(),
      hue: [hue, (hue + 25) % 360],
    };
    custom.push(m);
    saveCustom();
    addDialog.close();
    toast(`Added “${title}”`);
    location.hash = `#/movie/${encodeURIComponent(m.id)}`;
  });

  function hexToHue(hex) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    if (!d) return 20;
    let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
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
    $("#updated").textContent = `Last updated ${new Date(DATA.updated).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`;
  }

  route();
  onScroll();
  setInterval(tick, 1000);
})();
