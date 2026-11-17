# PROGRESS

## What this is
Static launcher page for daily browser games. No build step: `index.html`, `style.css`, `app.js`.

## Architecture / rules
- Games are listed in `GAMES` in `app.js` (id, name, blurb, url).
- State lives in localStorage key `dailies:v1`: `{ [gameId]: ["YYYY-MM-DD", ...] }` (local dates).
- Opening a game marks it done today. The circle toggles it by hand.
- Deploy: GitHub Actions (`.github/workflows/pages.yml`) publishes to Pages on every push to `main`.
- Docker: nginx serving the three files (optional, for local runs).
- Embedding: checked 2026-11-17. All five official sites block iframes (XFO DENY / frame-ancestors none). Do not proxy them.
  Official URLs: nytimes.com/games/wordle, krillion.io, farflung.game, playplain.app, playchartered.com.
  (farflunggame.fun and plaingame.fun are unofficial clones.)

## Checklist
- [x] Launcher with daily checklist, streaks, keyboard shortcuts
- [x] Light/dark via system preference
- [x] Dockerfile
- [x] GitHub Pages deploy

## Log
- 2026-11-17: Initial version.
