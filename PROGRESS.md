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

## Android app (`android/`)
- Kotlin, minSdk 26, AGP 8.7.3 / Kotlin 2.1.0 / Gradle 8.11.1, Glance 1.1.1. No local SDK on this Mac; CI builds it.
- MainActivity = WebView serving the repo-root web files from assets (copied at build time by the `copyWeb` task) via WebViewAssetLoader.
- `app.js` detects `window.DailiesAndroid` (JS bridge) and stores progress there instead of the cookie. Same string format.
- `Store.kt` mirrors the JS encode/decode; `Games.kt` duplicates the GAMES list: keep both in sync with `app.js`.
- Widgets: one responsive GlanceAppWidget (small <250dp wide, wide <290dp tall, large otherwise), registered 3 times
  (Small/Wide/Large receivers) so the picker shows three sizes. Tapping a game goes through OpenGameActivity (marks + opens).
- CI: `.github/workflows/android.yml` builds on changes to android/ or web files, uploads `dailies.apk` to release tag `android`.
  Download: https://github.com/Lenni707/dailies/releases/download/android/dailies.apk
- Signing: `android/release.p12` + `android/release.pass` (gitignored, local only, BACK THEM UP). CI reads secrets
  ANDROID_KEYSTORE_B64 / ANDROID_KEY_PASS; without them it signs with a throwaway debug key (updates won't install over it).

## Checklist
- [x] Launcher with daily checklist, streaks, keyboard shortcuts
- [x] Light/dark via system preference
- [x] Dockerfile
- [x] GitHub Pages deploy
- [x] Cookie storage + month calendar (click a day to backfill)
- [x] Android app + 3 widgets (built in CI)
- [ ] Signing secrets added to GitHub (user must run the commands in README)
- [x] Home-screen icon + web manifest (icons/icon.svg is the source; PNGs rendered with headless Chrome + sips)

## Log
- 2026-11-17: Initial version.
- 2026-11-17: Cookie storage, calendar tracker, app icon/manifest.
- 2026-11-17: Android app (WebView + Glance widgets), APK published via GitHub release.
