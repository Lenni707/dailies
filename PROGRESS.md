# PROGRESS

## What this is
Static launcher page for daily browser games. No build step: `index.html`, `style.css`, `app.js`.

## Architecture / rules
- Default games: `DEFAULT_GAMES` in `app.js` (+ `DEFAULT_GAMES` in android Games.kt). The user's own list is edited in-page
  ("Edit games") and stored as JSON `{next, games:[{bit,name,url,blurb}]}`: web cookie `dailies_games` (base64) + localStorage
  `dailies:games`; in the app via the JS bridge (SharedPreferences key `games`, read by the widgets). New games get bit `next++` (max 30).
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
- `Store.kt` mirrors the JS encode/decode (width = enough base32 chars for the highest bit). `Games.kt` parses the shared game JSON.
- Widgets: one GlanceAppWidget with SizeMode.Exact, layout picked by real size:
  <100dp tall = Today (2×1 default: big square per game, tap to play), <200dp wide = Up next (count + play-next button),
  <240dp tall = This week (count, full-day streak, Mon–Sun squares), else Overview (checklist w/ toggles, week, streaks).
  Registered 4 times (Tiny/Small/Wide/Large receivers = Today/Up next/This week/Overview in the picker).
  Glance limit: max 10 children per Row/Column (use padding, not spacers, in repeated cells).
  Colours are resources: Material You system colours on API 31+ (values-v31, values-night-v31), fixed palette before.
  The app also injects the system accent as the page's `--done` colour. Tapping a game goes through OpenGameActivity (marks + opens).
- CI: `.github/workflows/android.yml` builds on changes to android/ or web files, uploads `dailies.apk` to release tag `android`.
  Download: https://github.com/Lenni707/dailies/releases/download/android/dailies.apk
- Signing: `android/release.p12` + `android/release.pass` (gitignored, local only, BACK THEM UP). CI reads secrets
  ANDROID_KEYSTORE_B64 / ANDROID_KEY_PASS; without them it signs with a throwaway debug key (updates won't install over it).

## Checklist
- [x] Launcher with daily checklist, streaks, keyboard shortcuts
- [x] Light/dark via system preference
- [x] Dockerfile
- [x] GitHub Pages deploy
- [x] Cookie storage + history (GitHub-style 53-week grid, hover tooltip lists games, click a day to edit)
- [x] Editable game list (web + app), Material You widgets with heatmap grid, 2×1 widget
- [x] Undo toast after opening a game; circles and day chips untick
- [x] Android app + 3 widgets (built in CI)
- [x] Signing secrets added to GitHub (release builds signed with android/release.p12)
- [x] Home-screen icon + web manifest (icons/icon.svg is the source; PNGs rendered with headless Chrome + sips)

## Log
- 2026-11-17: Initial version.
- 2026-11-17: Cookie storage, calendar tracker, app icon/manifest.
- 2026-11-17: Android app (WebView + Glance widgets), APK published via GitHub release.
- 2026-11-17: Year-grid history with tooltips, undo toast; signed APK builds.
- 2026-11-17: Editable games, widget redesign (heatmap, Material You, 2×1).
- 2026-11-17: Widgets redesigned around today (2×1 squares default), up next, this week, overview.
