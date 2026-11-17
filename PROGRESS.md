# PROGRESS

## What this is
Static launcher page for daily browser games. No build step: `index.html`, `style.css`, `app.js`.

## Architecture / rules
- Games are listed in `GAMES` in `app.js` (id, name, blurb, url).
- State: map of day number (days since 1970-01-01, local date) -> bitmask of games played. Each game has a permanent `bit`.
  Saved to cookie `dailies` (primary, Max-Age 400d, SameSite=Lax, Secure on https) and localStorage `dailies:v2` (backup); merged on load.
  Encoding: `2.<startDay base36>.<width>.<base32 chars per day>`, ~400 bytes/year. v1 localStorage data is migrated automatically.
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
- [x] Cookie storage + month calendar (click a day to backfill)
- [x] Home-screen icon + web manifest (icons/icon.svg is the source; PNGs rendered with headless Chrome + sips)

## Log
- 2026-11-17: Initial version.
- 2026-11-17: Cookie storage, calendar tracker, app icon/manifest.
