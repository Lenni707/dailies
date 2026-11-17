// Default games. Your own list (added/removed in the app) is saved separately and wins.
// `bit` is a game's permanent slot in saved progress: never reuse or renumber one.
const DEFAULT_GAMES = [
  { bit: 0, name: "Wordle",    blurb: "Five letters, six tries",       url: "https://www.nytimes.com/games/wordle/index.html" },
  { bit: 1, name: "Krillion",  blurb: "Rare answers score deeper",     url: "https://krillion.io" },
  { bit: 2, name: "Farflung",  blurb: "Find the place from map clues", url: "https://farflung.game" },
  { bit: 3, name: "Plain",     blurb: "Estimate the number",           url: "https://playplain.app" },
  { bit: 4, name: "Chartered", blurb: "Pin the place, guess the year", url: "https://playchartered.com" },
];
const MAX_BITS = 30; // progress is a 31-bit mask per day

/* ---------- dates ---------- */
// Day number = days since 1970-01-01 in local time (DST-safe).
const dayNum = (d = new Date()) => Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5);
const fromDayNum = (n) => { const u = new Date(n * 864e5); return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate()); };
const today = () => dayNum();

/* ---------- storage ----------
   days: Map<dayNum, bitmask of games played>
   Saved to a cookie (primary) and localStorage (backup), merged on load.
   Cookie format: "2.<startDay base36>.<w>.<chars>" where each day is w base32 chars. */
// Inside the Android app, progress lives in the app (shared with its widgets) instead of a cookie.
const NATIVE = window.DailiesAndroid;
const COOKIE = "dailies";
const LS = "dailies:v2";
const KEEP_DAYS = 400; // browsers cap cookie lifetime at 400 days anyway

function encode(days) {
  const keys = [...days.keys()].filter((k) => days.get(k));
  if (!keys.length) return "";
  const end = Math.max(...keys);
  const start = Math.max(Math.min(...keys), end - KEEP_DAYS);
  const bits = 32 - Math.clz32(Math.max(...keys.map((k) => days.get(k))));
  const W = Math.max(1, Math.ceil(bits / 5));
  let s = "";
  for (let d = start; d <= end; d++) s += (days.get(d) || 0).toString(32).padStart(W, "0");
  return `2.${start.toString(36)}.${W}.${s}`;
}

function decode(str) {
  const days = new Map();
  const [v, start, w, s] = (str || "").split(".");
  if (v !== "2" || !s) return days;
  const st = parseInt(start, 36), wd = +w;
  for (let i = 0; i * wd < s.length; i++) {
    const m = parseInt(s.slice(i * wd, i * wd + wd), 32);
    if (m) days.set(st + i, m);
  }
  return days;
}

function readCookie(name = COOKIE) {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : "";
}

function writeCookie(val, name = COOKIE) {
  const path = location.pathname.replace(/[^/]*$/, "") || "/";
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(val)}; Max-Age=${KEEP_DAYS * 86400}; Path=${path}; SameSite=Lax${secure}`;
}

/* ---------- game list ----------
   { next: <next free bit>, games: [{ bit, name, url, blurb }] }
   Web: cookie "dailies_games" (base64 JSON) + localStorage backup. App: stored natively, shared with widgets. */
const GAMES_COOKIE = "dailies_games";
const GAMES_LS = "dailies:games";
const b64 = (str) => btoa(String.fromCharCode(...new TextEncoder().encode(str)));
const unb64 = (str) => new TextDecoder().decode(Uint8Array.from(atob(str), (c) => c.charCodeAt(0)));

function loadGames() {
  let raw = "";
  if (NATIVE) raw = NATIVE.loadGames();
  else {
    try { raw = unb64(readCookie(GAMES_COOKIE)); } catch {}
    if (!raw) try { raw = localStorage.getItem(GAMES_LS) || ""; } catch {}
  }
  try {
    const cfg = JSON.parse(raw);
    if (Array.isArray(cfg.games)) return cfg;
  } catch {}
  return { next: DEFAULT_GAMES.length, games: DEFAULT_GAMES.map((g) => ({ ...g })) };
}

function saveGames() {
  const json = JSON.stringify(cfg);
  if (NATIVE) { NATIVE.saveGames(json); return; }
  writeCookie(b64(json), GAMES_COOKIE);
  try { localStorage.setItem(GAMES_LS, json); } catch {}
}

let cfg = loadGames();
let GAMES = cfg.games;

function load() {
  if (NATIVE) return decode(NATIVE.load());
  const days = decode(readCookie());
  let ls = "";
  try { ls = localStorage.getItem(LS) || ""; } catch {}
  for (const [k, m] of decode(ls)) days.set(k, (days.get(k) || 0) | m);
  migrateV1(days);
  return days;
}

// v1 stored { gameId: ["YYYY-MM-DD", ...] } in localStorage
function migrateV1(days) {
  let old;
  try { old = JSON.parse(localStorage.getItem("dailies:v1")); } catch {}
  if (!old) return;
  const ids = ["wordle", "krillion", "farflung", "plain", "chartered"];
  for (const [id, list] of Object.entries(old)) {
    const bit = ids.indexOf(id);
    if (bit < 0) continue;
    for (const s of list) {
      const [y, mo, d] = s.split("-").map(Number);
      const n = dayNum(new Date(y, mo - 1, d));
      days.set(n, (days.get(n) || 0) | (1 << bit));
    }
  }
  try { localStorage.removeItem("dailies:v1"); } catch {}
  save(days);
}

function save(days) {
  const val = encode(days);
  if (NATIVE) { NATIVE.save(val); return; }
  writeCookie(val);
  try { localStorage.setItem(LS, val); } catch {}
}

let days = load();
save(days);

const has = (bit, d = today()) => !!((days.get(d) || 0) & (1 << bit));

function set(bit, d, on) {
  const m = days.get(d) || 0;
  const next = on ? m | (1 << bit) : m & ~(1 << bit);
  next ? days.set(d, next) : days.delete(d);
  save(days);
  render();
}
const toggle = (bit, d = today()) => set(bit, d, !has(bit, d));

function streak(bit) {
  let d = today();
  if (!has(bit, d)) d--; // not played yet today doesn't break it
  let n = 0;
  while (has(bit, d)) { n++; d--; }
  return n;
}

const countOn = (d) => GAMES.filter((g) => has(g.bit, d)).length;

/* ---------- today list ---------- */
const $ = (id) => document.getElementById(id);
const list = $("games");

function buildList() {
  list.innerHTML = "";
  const tpl = $("row");
  GAMES.forEach((g, i) => {
    const li = tpl.content.firstElementChild.cloneNode(true);
    li.dataset.bit = g.bit;
    const a = li.querySelector(".open");
    a.href = g.url;
    li.querySelector(".key").textContent = i < 9 ? i + 1 : "";
    li.querySelector(".name").textContent = g.name;
    li.querySelector(".blurb").textContent = g.blurb || hostOf(g.url);
    li.querySelector(".check").addEventListener("click", () => toggle(g.bit));
    a.addEventListener("click", (e) => {
      if (NATIVE) { e.preventDefault(); openGame(g); return; }
      const was = has(g.bit);
      set(g.bit, today(), true);
      if (!was) toastPlayed(g);
    });
    list.appendChild(li);
  });
  $("maxkey").textContent = Math.min(9, GAMES.length);
  $("empty").hidden = GAMES.length > 0;
}

const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } };

function renderList() {
  let done = 0;
  for (const li of list.children) {
    const bit = +li.dataset.bit;
    const d = has(bit);
    if (d) done++;
    li.classList.toggle("done", d);
    const chk = li.querySelector(".check");
    chk.setAttribute("aria-pressed", d);
    chk.title = chk.ariaLabel = d ? "Mark as not played" : "Mark as played";
    const s = streak(bit);
    li.querySelector(".streak").textContent = s > 1 ? `${s}d` : "";
  }
  $("count").textContent = `${done}/${GAMES.length}`;
  $("fill").style.width = `${GAMES.length ? (done / GAMES.length) * 100 : 0}%`;
  $("next").disabled = done === GAMES.length;
  $("date").textContent = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

/* ---------- calendar (year grid: weeks are columns, Monday on top) ---------- */
const WEEKS = 53;
const weekStart = 1; // Monday
let selected = today();

const fmtDay = (n, opts = { weekday: "short", month: "short", day: "numeric" }) =>
  fromDayNum(n).toLocaleDateString(undefined, opts);
const level = (c) => (c === 0 ? 0 : Math.max(1, Math.round((c / Math.max(1, GAMES.length)) * 5)));

function renderCal() {
  const t = today();
  const dow = (fromDayNum(t).getDay() - weekStart + 7) % 7;
  const start = t - dow - (WEEKS - 1) * 7;

  const grid = $("grid");
  const months = $("months");
  const scroller = $("scroller");
  const keepScroll = grid.childElementCount ? scroller.scrollLeft : null;
  grid.innerHTML = "";
  months.innerHTML = "";

  let total = 0, full = 0;
  for (let w = 0; w < WEEKS; w++) {
    // month label over the week that holds the 1st (week 0 gets one if a month starts later than week 2)
    const label = document.createElement("span");
    for (let i = 0; i < 7; i++) {
      const n = start + w * 7 + i;
      const d = fromDayNum(n);
      if ((d.getDate() === 1 && n <= t) || (w === 0 && i === 0 && d.getDate() < 15)) {
        label.textContent = d.toLocaleDateString(undefined, { month: "short" });
        break;
      }
    }
    months.appendChild(label);

    for (let i = 0; i < 7; i++) {
      const n = start + w * 7 + i;
      const cell = document.createElement("button");
      cell.className = "cell";
      if (n > t) { cell.classList.add("future"); cell.tabIndex = -1; grid.appendChild(cell); continue; }
      const c = countOn(n);
      total += c;
      if (c && c === GAMES.length) full++;
      cell.dataset.day = n;
      cell.dataset.l = level(c);
      cell.setAttribute("aria-label", `${fmtDay(n)}: ${c} of ${GAMES.length}`);
      if (n === t) cell.classList.add("today");
      if (n === selected) cell.classList.add("sel");
      grid.appendChild(cell);
    }
  }
  $("calStats").textContent = `${total} ${total === 1 ? "game" : "games"} · ${full} full ${full === 1 ? "day" : "days"} this year`;
  scroller.scrollLeft = keepScroll ?? scroller.scrollWidth;

  // selected day: edit what was played
  $("dayLabel").textContent = selected === t ? "Today" : fmtDay(selected);
  const chips = $("chips");
  chips.innerHTML = "";
  for (const g of GAMES) {
    const on = has(g.bit, selected);
    const c = document.createElement("button");
    c.className = "chip" + (on ? " on" : "");
    c.textContent = g.name;
    c.setAttribute("aria-pressed", on);
    c.title = on ? "Mark as not played" : "Mark as played";
    c.addEventListener("click", () => toggle(g.bit, selected));
    chips.appendChild(c);
  }
}

/* tooltip */
const tip = $("tip");
function showTip(cell) {
  const n = +cell.dataset.day;
  const c = countOn(n);
  tip.innerHTML = "";
  const head = document.createElement("div");
  head.className = "tip-head";
  head.textContent = `${fmtDay(n, { weekday: "long", month: "short", day: "numeric" })} · ${c}/${GAMES.length}`;
  tip.appendChild(head);
  for (const g of GAMES) {
    const row = document.createElement("div");
    row.className = "tip-row" + (has(g.bit, n) ? " on" : "");
    row.textContent = g.name;
    tip.appendChild(row);
  }
  tip.hidden = false;
  const r = cell.getBoundingClientRect();
  const w = tip.offsetWidth, h = tip.offsetHeight;
  let x = r.left + r.width / 2 - w / 2;
  x = Math.max(8, Math.min(x, innerWidth - w - 8));
  let y = r.top - h - 8;
  if (y < 8) y = r.bottom + 8;
  tip.style.left = `${x}px`;
  tip.style.top = `${y}px`;
}
const hideTip = () => { tip.hidden = true; };

$("grid").addEventListener("mouseover", (e) => {
  const cell = e.target.closest(".cell[data-day]");
  if (cell) showTip(cell);
});
$("grid").addEventListener("mouseleave", hideTip);
$("grid").addEventListener("click", (e) => {
  const cell = e.target.closest(".cell[data-day]");
  if (!cell) return;
  selected = +cell.dataset.day;
  render();
  const again = $("grid").querySelector(`[data-day="${selected}"]`);
  if (again) showTip(again); // keeps the tooltip on touch screens
});
$("scroller").addEventListener("scroll", hideTip, { passive: true });
addEventListener("scroll", hideTip, { passive: true });
document.addEventListener("click", (e) => { if (!e.target.closest(".cell")) hideTip(); });

/* toast with undo after opening a game */
let toastTimer;
function toastPlayed(g) {
  const el = $("toast");
  $("toastText").textContent = `${g.name} marked as played`;
  el.hidden = false;
  el.onclick = (e) => {
    if (e.target.id !== "undo") return;
    set(g.bit, today(), false);
    el.hidden = true;
  };
  clearTimeout(toastTimer);
  // the game opens in another tab, so start the countdown once you're back
  const arm = () => { toastTimer = setTimeout(() => (el.hidden = true), 6000); };
  if (document.hidden) document.addEventListener("visibilitychange", arm, { once: true });
  else arm();
}

/* ---------- game editor ---------- */
const editor = $("editor");

function renderEditor() {
  const ul = $("editList");
  ul.innerHTML = "";
  GAMES.forEach((g, i) => {
    const li = document.createElement("li");
    const text = document.createElement("div");
    text.className = "edit-text";
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = g.name;
    const host = document.createElement("span");
    host.className = "blurb";
    host.textContent = hostOf(g.url);
    text.append(name, host);

    const up = document.createElement("button");
    up.className = "icon";
    up.ariaLabel = `Move ${g.name} up`;
    up.disabled = i === 0;
    up.innerHTML = '<svg viewBox="0 0 16 16"><path d="M4 10l4-4 4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    up.onclick = () => { [GAMES[i - 1], GAMES[i]] = [GAMES[i], GAMES[i - 1]]; gamesChanged(); };

    const del = document.createElement("button");
    del.className = "remove";
    del.textContent = "Remove";
    del.onclick = () => {
      if (!del.classList.contains("armed")) { del.classList.add("armed"); del.textContent = "Sure?"; return; }
      GAMES.splice(i, 1);
      gamesChanged();
    };
    li.append(text, up, del);
    ul.appendChild(li);
  });
  const full = cfg.next >= MAX_BITS;
  $("addForm").querySelector("button").disabled = full;
  $("formNote").textContent = full ? "That's the maximum number of games." : "";
}

function gamesChanged() {
  saveGames();
  buildList();
  render();
  renderEditor();
}

$("addForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target;
  const name = f.name.value.trim();
  let url = f.url.value.trim();
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  try { new URL(url); } catch { $("formNote").textContent = "That link doesn't look right."; return; }
  if (!name || cfg.next >= MAX_BITS) return;
  GAMES.push({ bit: cfg.next++, name, url, blurb: f.blurb.value.trim() });
  f.reset();
  gamesChanged();
  f.name.focus();
});

$("edit").addEventListener("click", () => { renderEditor(); editor.showModal(); });
$("emptyAdd").addEventListener("click", () => { renderEditor(); editor.showModal(); });
$("closeEditor").addEventListener("click", () => editor.close());
editor.addEventListener("click", (e) => { if (e.target === editor) editor.close(); });

/* ---------- glue ---------- */
function render() { renderList(); renderCal(); }

function openGame(g) {
  if (NATIVE) NATIVE.open(g.url);
  else window.open(g.url, "_blank", "noopener");
  const was = has(g.bit);
  set(g.bit, today(), true);
  if (!was) toastPlayed(g);
}

$("next").addEventListener("click", () => {
  const g = GAMES.find((g) => !has(g.bit));
  if (g) openGame(g);
});

document.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target.closest("input, dialog")) return;
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= Math.min(9, GAMES.length)) openGame(GAMES[n - 1]);
  else if (e.key.toLowerCase() === "n") $("next").click();
});

// pick up changes from other tabs and roll over at midnight
let lastDay = today();
function refresh() {
  days = load();
  const fresh = loadGames();
  if (JSON.stringify(fresh) !== JSON.stringify(cfg)) { cfg = fresh; GAMES = cfg.games; buildList(); }
  if (today() !== lastDay) {
    if (selected === lastDay) selected = today();
    lastDay = today();
  }
  render();
}
window.dailiesRefresh = refresh;
document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
setInterval(refresh, 60_000);

// offer the Android app to Android browsers (not inside the app itself)
if (!NATIVE && /Android/i.test(navigator.userAgent)) $("android").hidden = false;
if (NATIVE) document.documentElement.classList.add("native");

buildList();
render();
