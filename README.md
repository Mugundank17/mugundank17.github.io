# Movie Countdown

A cinematic, streaming-style website with live countdowns to upcoming movie releases. Movie data, posters, backdrops, cast photos and official YouTube trailers/teasers are pulled automatically from [TMDB](https://www.themoviedb.org) every day.

## How it works

- `watchlist.json` — movies you always want on the site (title + year, or a TMDB id), the release region, and how many popular upcoming releases to add automatically.
- `scripts/update-movies.mjs` — fetches everything from TMDB and writes:
  - `movies.js` — every movie, with release dates and age ratings for each country, artwork, cast, official trailers/teasers and colours sampled from the backdrop
  - `data/people/<id>.json` — a profile for each cast member and director (bio, photos, filmography)
  - `data/i18n/<lang>.json` — translated titles, taglines and overviews
- Re-releases: classic films with an upcoming cinema date in any country listed in `reReleaseRegions` are added automatically.
- `.github/workflows/update-movies.yml` — runs the script every day (and on every push), commits the new `movies.js`, and deploys the site to GitHub Pages.

## On the site

- Visitors see release dates, age ratings and countdowns for **their own country** (detected from their time zone, changeable with the 📍 picker), in **their own language** where TMDB has a translation.
- Every cast member and director has a profile page (`#/person/<id>`) with their bio, photos, upcoming films, re-releases and full filmography.
- Trailers and teasers play right on the movie page.

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
