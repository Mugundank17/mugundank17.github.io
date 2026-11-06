(() => {
  "use strict";

  const STORAGE_KEY = "movie-countdown:v1";

  // Starter list. Release dates move around a lot — users can edit any of these.
  const DEFAULT_MOVIES = [
    { title: "Spider-Man: Brand New Day", date: "2026-07-31", note: "Theaters" },
    { title: "Jumanji 3", date: "2026-12-11", note: "Theaters" },
    { title: "Avengers: Doomsday", date: "2026-12-18", note: "Theaters" },
    { title: "Dune: Part Three", date: "2026-12-18", note: "Theaters & IMAX" },
    { title: "Shrek 5", date: "2027-06-30", note: "Theaters" },
    { title: "The Batman Part II", date: "2027-10-01", note: "Theaters" },
    { title: "Avengers: Secret Wars", date: "2027-12-17", note: "Theaters" },
  ];

  const $ = (sel) => document.querySelector(sel);
  const grid = $("#grid");
  const hero = $("#hero");
  const empty = $("#empty");
  const search = $("#search");
  const dialog = $("#dialog");
  const form = $("#form");
  const toast = $("#toast");

  let filter = "upcoming";
  let editingId = null;
  let movies = load();

  // ---------- storage ----------
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function withIds(list) {
    return list.map((m) => ({ id: uid(), time: "", poster: "", note: "", ...m }));
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (_) { /* storage unavailable — fall back to defaults */ }
    return withIds(DEFAULT_MOVIES);
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(movies)); } catch (_) { /* ignore */ }
  }

  // ---------- time helpers ----------
  function releaseTime(m) {
    const [y, mo, d] = m.date.split("-").map(Number);
    const [h, mi] = (m.time || "00:00").split(":").map(Number);
    return new Date(y, mo - 1, d, h || 0, mi || 0).getTime();
  }

  function parts(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    return {
      days: Math.floor(s / 86400),
      hours: Math.floor((s % 86400) / 3600),
      mins: Math.floor((s % 3600) / 60),
      secs: s % 60,
    };
  }

  const pad = (n) => String(n).padStart(2, "0");

  function formatDate(m) {
    const opts = { weekday: "short", year: "numeric", month: "long", day: "numeric" };
    if (m.time) Object.assign(opts, { hour: "numeric", minute: "2-digit" });
    return new Date(releaseTime(m)).toLocaleString(undefined, opts);
  }

  // ---------- visuals ----------
  function hash(str) {
    let h = 0;
    for (const c of str) h = (h * 31 + c.charCodeAt(0)) | 0;
    return Math.abs(h);
  }

  function gradientFor(title) {
    const h = hash(title) % 360;
    return `linear-gradient(135deg, hsl(${h} 70% 35%), hsl(${(h + 50) % 360} 75% 20%))`;
  }

  function posterStyle(m) {
    if (m.poster) return `background-image:url("${encodeURI(m.poster)}"), ${gradientFor(m.title)}`;
    return `background-image:${gradientFor(m.title)}`;
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function clockHTML(ms) {
    const p = parts(ms);
    return `
      <div class="clock">
        <div class="unit"><b data-u="days">${p.days}</b><span>Days</span></div>
        <div class="unit"><b data-u="hours">${pad(p.hours)}</b><span>Hours</span></div>
        <div class="unit"><b data-u="mins">${pad(p.mins)}</b><span>Mins</span></div>
        <div class="unit"><b data-u="secs">${pad(p.secs)}</b><span>Secs</span></div>
      </div>`;
  }

  // ---------- rendering ----------
  function sorted() {
    const now = Date.now();
    return [...movies].sort((a, b) => {
      const ta = releaseTime(a), tb = releaseTime(b);
      const ra = ta <= now, rb = tb <= now;
      if (ra !== rb) return ra ? 1 : -1;      // upcoming first
      return ra ? tb - ta : ta - tb;          // released: newest first
    });
  }

  function render() {
    const now = Date.now();
    const q = search.value.trim().toLowerCase();
    const list = sorted().filter((m) => {
      const out = releaseTime(m) <= now;
      if (filter === "upcoming" && out) return false;
      if (filter === "released" && !out) return false;
      return !q || m.title.toLowerCase().includes(q);
    });

    grid.innerHTML = list.map((m) => {
      const diff = releaseTime(m) - now;
      const out = diff <= 0;
      const days = Math.floor(diff / 86400000);
      let badge = "";
      if (out) badge = `<span class="badge out">Out now</span>`;
      else if (days < 1) badge = `<span class="badge soon">Today!</span>`;
      else if (days < 30) badge = `<span class="badge soon">${days === 1 ? "Tomorrow" : `In ${days} days`}</span>`;

      return `
        <article class="card" data-id="${m.id}">
          <div class="poster" style="${esc(posterStyle(m))}">
            ${m.poster ? "" : `<span class="poster-initial">${esc(m.title.charAt(0).toUpperCase())}</span>`}
            ${badge}
            <div class="card-actions">
              <button class="icon-btn" data-act="share" title="Copy share link" aria-label="Copy share link for ${esc(m.title)}">🔗</button>
              <button class="icon-btn" data-act="edit" title="Edit" aria-label="Edit ${esc(m.title)}">✎</button>
              <button class="icon-btn del" data-act="delete" title="Delete" aria-label="Delete ${esc(m.title)}">✕</button>
            </div>
          </div>
          <div class="card-body">
            <h3 class="card-title">${esc(m.title)}</h3>
            <p class="card-meta">${esc(formatDate(m))}${m.note ? " · " + esc(m.note) : ""}</p>
            ${out ? `<p class="released-msg">🍿 In release now</p>` : clockHTML(diff)}
          </div>
        </article>`;
    }).join("");

    empty.hidden = list.length > 0;
    renderHero(now);
  }

  function renderHero(now) {
    const next = sorted().find((m) => releaseTime(m) > now);
    if (!next) {
      hero.innerHTML = `<div class="hero-content"><div class="hero-kicker">Nothing on the horizon</div>
        <h2 class="hero-title">Add your next movie</h2>
        <p class="hero-date">Track release dates with a live countdown.</p></div>`;
      hero.dataset.id = "";
      return;
    }
    hero.dataset.id = next.id;
    hero.innerHTML = `
      <div class="hero-bg" style="${esc(posterStyle(next))}"></div>
      <div class="hero-content">
        <div class="hero-kicker">Next up</div>
        <h2 class="hero-title">${esc(next.title)}</h2>
        <p class="hero-date">${esc(formatDate(next))}${next.note ? " · " + esc(next.note) : ""}</p>
        ${clockHTML(releaseTime(next) - now)}
      </div>`;
  }

  // Update only the numbers each second; full re-render when something releases.
  function tick() {
    const now = Date.now();
    let needsRender = false;

    const update = (root, m) => {
      const diff = releaseTime(m) - now;
      if (diff <= 0) { needsRender = true; return; }
      const p = parts(diff);
      root.querySelector('[data-u="days"]').textContent = p.days;
      root.querySelector('[data-u="hours"]').textContent = pad(p.hours);
      root.querySelector('[data-u="mins"]').textContent = pad(p.mins);
      root.querySelector('[data-u="secs"]').textContent = pad(p.secs);
    };

    grid.querySelectorAll(".card").forEach((card) => {
      const m = movies.find((x) => x.id === card.dataset.id);
      if (m && card.querySelector(".clock")) update(card, m);
    });
    const hm = movies.find((x) => x.id === hero.dataset.id);
    if (hm) update(hero, hm);

    if (needsRender) render();
  }

  // ---------- dialog ----------
  function openDialog(movie) {
    editingId = movie ? movie.id : null;
    $("#dialogTitle").textContent = movie ? "Edit movie" : "Add a movie";
    form.reset();
    if (movie) {
      form.title.value = movie.title;
      form.date.value = movie.date;
      form.time.value = movie.time || "";
      form.poster.value = movie.poster || "";
      form.note.value = movie.note || "";
    }
    dialog.showModal();
    form.title.focus();
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = {
      title: form.title.value.trim(),
      date: form.date.value,
      time: form.time.value,
      poster: form.poster.value.trim(),
      note: form.note.value.trim(),
    };
    if (!data.title || !data.date) return;

    if (editingId) {
      movies = movies.map((m) => (m.id === editingId ? { ...m, ...data } : m));
      showToast("Movie updated");
    } else {
      movies.push({ id: uid(), ...data });
      showToast(`Added “${data.title}”`);
    }
    save();
    dialog.close();
    if (releaseTime(data) <= Date.now() && filter === "upcoming") setFilter("all");
    else render();
  });

  $("#cancelBtn").addEventListener("click", () => dialog.close());
  $("#addBtn").addEventListener("click", () => openDialog(null));

  // ---------- card actions ----------
  grid.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const id = btn.closest(".card").dataset.id;
    const m = movies.find((x) => x.id === id);
    if (!m) return;

    if (btn.dataset.act === "edit") openDialog(m);
    if (btn.dataset.act === "delete") {
      if (!confirm(`Remove “${m.title}” from your list?`)) return;
      movies = movies.filter((x) => x.id !== id);
      save();
      render();
      showToast("Movie removed");
    }
    if (btn.dataset.act === "share") {
      const url = shareUrl(m);
      try {
        await navigator.clipboard.writeText(url);
        showToast("Share link copied");
      } catch (_) {
        prompt("Copy this link:", url);
      }
    }
  });

  // ---------- sharing via URL ----------
  function shareUrl(m) {
    const params = new URLSearchParams({ title: m.title, date: m.date });
    if (m.time) params.set("time", m.time);
    if (m.note) params.set("note", m.note);
    if (m.poster) params.set("poster", m.poster);
    return `${location.origin}${location.pathname}?${params}`;
  }

  function importFromUrl() {
    const p = new URLSearchParams(location.search);
    const title = (p.get("title") || "").slice(0, 80).trim();
    const date = p.get("date") || "";
    if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    const time = /^\d{2}:\d{2}$/.test(p.get("time") || "") ? p.get("time") : "";
    const exists = movies.some((m) => m.title.toLowerCase() === title.toLowerCase() && m.date === date);
    if (!exists) {
      let poster = p.get("poster") || "";
      if (!/^https?:\/\//i.test(poster)) poster = "";
      movies.push({ id: uid(), title, date, time, note: (p.get("note") || "").slice(0, 60), poster });
      save();
      showToast(`Added “${title}” from shared link`);
    }
    history.replaceState(null, "", location.pathname);
  }

  // ---------- misc ----------
  function setFilter(f) {
    filter = f;
    document.querySelectorAll(".seg button").forEach((b) => b.classList.toggle("active", b.dataset.filter === f));
    render();
  }

  document.querySelectorAll(".seg button").forEach((b) =>
    b.addEventListener("click", () => setFilter(b.dataset.filter))
  );
  search.addEventListener("input", render);

  $("#resetBtn").addEventListener("click", () => {
    if (!confirm("Replace your list with the default movies?")) return;
    movies = withIds(DEFAULT_MOVIES);
    save();
    render();
    showToast("Default list restored");
  });

  let toastTimer;
  function showToast(msg) {
    toast.textContent = msg;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast.hidden = true), 2200);
  }

  importFromUrl();
  render();
  setInterval(tick, 1000);
})();
