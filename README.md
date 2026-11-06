# Movie Countdown

A cinematic, streaming-style website with live countdowns to upcoming movie releases. Plain HTML/CSS/JS — no build step — hosted on GitHub Pages.

- **Home:** billboard for the next release, plus scrollable rows (Next to Release, Coming Soon, by year, Out Now, My Countdowns)
- **Movie pages** (`#/movie/<id>`): fiery animated backdrop, big glowing title, live countdown, Get Tickets / Watch Trailer / Add to calendar
- **Cast carousel** for each movie
- **+ Add** your own countdowns (saved in your browser)

## Editing movies

All movies live in `data.js`. Each entry can include `backdrop`, `poster`, `trailer` (YouTube id), `tickets` and cast `photo` fields — put images in an `images/` folder and reference them like `"images/dune.jpg"`. Without images, the site generates artwork from each movie's `hue` colours.

Release dates change often, so check them before publishing.
