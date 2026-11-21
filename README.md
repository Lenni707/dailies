# Dailies

One page for the daily games I play: Wordle, Krillion, Farflung, Plain, Chartered.

Click a game (or press its number) to open it in a new tab. It gets checked off for today. Streaks, history, and game scores (e.g. 3/6, 920, 100%) are saved in storage (shared with the Android app and widgets). The calendar shows each day with per-game score heatmaps; click a day to fix what you played or edit scores. A dedicated **Statistics & Trends** section features interactive score-over-time graphs and guess distribution histograms for each game.

On a phone: Share → Add to Home Screen for an app icon.

**Live:** https://lenni707.github.io/dailies/

## Android app

Download [dailies.apk](https://github.com/Lenni707/dailies/releases/download/android/dailies.apk), open it on the phone and allow installing from your browser. Long-press the home screen → Widgets → Dailies to add the 2×1, small, wide or large widget.

Signing secrets for CI (run once, from `android/`):

```sh
base64 -i release.p12 | gh secret set ANDROID_KEYSTORE_B64
gh secret set ANDROID_KEY_PASS < release.pass
```

## Why not embedded?

All five sites send `X-Frame-Options: DENY` or `frame-ancestors 'none'`, so browsers refuse to load them in an iframe. This page links out to them instead.

## Run locally

```sh
docker build -t dailies . && docker run --rm -p 8080:80 dailies
# or just
python3 -m http.server 8080
```

## Add a game

Use **Edit games** under the list (works on the website and in the app). The built-in defaults are `DEFAULT_GAMES` in `app.js`.
