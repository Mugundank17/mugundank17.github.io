# Countdown

A cinematic, streaming-style website with live countdowns to upcoming movie releases. Movie data, posters, backdrops, cast photos and official YouTube trailers/teasers are pulled automatically from [TMDB](https://www.themoviedb.org) every day.

## How it works

- `watchlist.json` — movies you always want on the site (title + year, or a TMDB id), the release region, and how many popular upcoming releases to add automatically.
- `scripts/update-movies.mjs` — fetches everything from TMDB and writes:
  - `movies.js` — every movie, with release dates and age ratings for each country, artwork, cast, official trailers/teasers and colours sampled from the backdrop
  - `data/people/<id>.json` — a profile for each cast member and director (bio, photos, filmography)
  - `data/i18n/<lang>.json` — translated titles, taglines and overviews
- Re-releases: classic films with an upcoming cinema date in any country listed in `reReleaseRegions` are added automatically.
- `.github/workflows/update-movies.yml` — runs the script every day (and on every push) and deploys the site to GitHub Pages. The generated data (`movies.js`, `data/`) is built fresh on each run and is not committed.
- `tickets.js` — major cities and ticket sites for each country (edit to add more).

## On the site

- Visitors see release dates, age ratings and countdowns for **their own country** (detected from their time zone, changeable with the 📍 picker), in **their own language** where TMDB has a translation.
- Every cast member and director has a profile page (`#/person/<id>`) with their bio, photos, upcoming films, re-releases and full filmography.
- Trailers and teasers play right on the movie page.
- **Most anticipated** films for the visitor's country — mixing the biggest releases there with local films (e.g. Hindi, Tamil, Telugu films in India).
- **Release calendar** (`#/calendar`) — month grid, Today button, counts for today / this week / this month.
- **Search** with All / Movies / Actors / Directors filters.
- **Get Tickets** — ticket sites for the visitor's city.
- **Artwork** — official posters, backdrops and logos to download in full resolution.
- **Browse** (`#/browse/…`) — Theatrical, OTT (by streaming service), Premieres (festivals), Regional cinema (by language), My Watchlist.
- **Feed** (`#/feed`) — what's next: cinema and streaming releases, premieres, new trailers and countdown milestones; "For you" shows your waiting rooms and the people you follow.
- **Explore** (`#/explore`): release history for any date and "On this day" (films since 1940), delayed releases tracker, anticipation rankings with daily ▲▼ movement, release clash detector, global release-date comparison, and Surprise me.
- **Where to watch** on each movie: official streaming, rent and buy options in the visitor's country (JustWatch via TMDB).
- **Waiting room** (`#/wait/<movie>`) — a full-screen countdown you join for a movie, with your wait progress, milestones, trailers and an invite link. Waiting rooms and follows are saved in the visitor's browser.

## Anime (AniList)

Anime comes live from [AniList](https://anilist.co)'s public GraphQL API (`https://graphql.anilist.co`, POST, no key or OAuth) — fetched in the visitor's browser, not by the GitHub Action.

- `providers/release.js` — the unified **Release** interface every provider maps into, plus a shared TTL cache (memory + localStorage).
- `providers/anilist.js` — the AniList adapter: GraphQL queries, request spacing for AniList's rate limit (~30/min), de-duplication, 429 retry, caching (schedule 10 min, lists 3 h, search 30 min, details 1 h, stale fallback when offline), pagination, and mapping AniList `Media` → `Release`.
- Pages (`#/anime/…`): airing schedule by day with episode countdowns, seasonal anime (any season, sortable), upcoming anime, search, and detail pages with posters, studios, genres, description, trailer, official streaming links, related titles and recommendations. Anime also appears in the main search and on the home page ("airing in the next 24 hours").

## TV, games and music (built daily by `scripts/build-extras.mjs`)

Each section is a separate provider module in `scripts/providers/`; if one fails, the others still build and the failed one keeps yesterday's data.

- **TV** — `tmdb-tv.mjs` (TMDB: discovery, posters, metadata, where to watch) + `tvmaze.mjs` (TVmaze: exact episode air times). In the browser, `providers/tvmaze.js` loads episodes, seasons, streaming/broadcast schedules (India, USA, UK, global) and search live. TVmaze data is CC BY-SA 4.0 and attributed on every TV page.
- **Games** — `steam.mjs` (primary, PC: Valve's public store endpoints only — Coming Soon lists + appdetails per storefront; no SteamDB) and `igdb.mjs` (PlayStation, Xbox, Nintendo, regional/platform release dates, DLC, franchises). Merged in `games.mjs` by Steam app id, or exact title + year when IGDB lists PC.
  - **IGDB needs Twitch credentials**: create an application at https://dev.twitch.tv/console/apps, then add repository secrets `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET`. The token is requested server-side in the Action, cached for its `expires_in`, renewed automatically and never published. Without the secrets the games section is Steam-only (PC).

## Android app

Countdown is an installable web app (PWA). On Android, open the site in Chrome and tap **Install app** (or ⋮ → *Add to Home screen* → *Install*). It installs with its own icon, opens full-screen, and works offline with the last-loaded data. Updates arrive automatically: the app loads the latest published version whenever it's opened online.

## Setup

1. Get a free TMDB account and copy your **API Read Access Token** from https://www.themoviedb.org/settings/api.
2. In this repo: **Settings → Secrets and variables → Actions → New repository secret**, name `TMDB_TOKEN`, paste the token.
3. **Settings → Pages → Source: GitHub Actions.**
4. **Actions → Update movies & deploy → Run workflow.**

## Run locally

```sh
npm install
TMDB_TOKEN=your-token npm run update
python3 -m http.server   # then open http://localhost:8000
```

This product uses the TMDB API but is not endorsed or certified by TMDB.
