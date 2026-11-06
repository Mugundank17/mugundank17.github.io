# Movie Countdown

A cinematic, streaming-style website with live countdowns to upcoming movie releases. Movie data, posters, backdrops, cast photos and official YouTube trailers/teasers are pulled automatically from [TMDB](https://www.themoviedb.org) every day.

## How it works

- `watchlist.json` — movies you always want on the site (title + year, or a TMDB id), the release region, and how many popular upcoming releases to add automatically.
- `scripts/update-movies.mjs` — fetches everything from TMDB, picks each movie's background colours from its backdrop, and writes `movies.js`.
- `.github/workflows/update-movies.yml` — runs the script every day (and on every push), commits the new `movies.js`, and deploys the site to GitHub Pages.

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
