# Dailies

One page for the daily games I play: Wordle, Krillion, Farflung, Plain, Chartered.

Click a game (or press its number) to open it in a new tab. It gets checked off for today. Streaks are stored in your browser.

**Live:** https://lenni707.github.io/dailies/

## Why not embedded?

All five sites send `X-Frame-Options: DENY` or `frame-ancestors 'none'`, so browsers refuse to load them in an iframe. This page links out to them instead.

## Run locally

```sh
docker build -t dailies . && docker run --rm -p 8080:80 dailies
# or just
python3 -m http.server 8080
```

## Add a game

Edit the `GAMES` list at the top of `app.js`.
