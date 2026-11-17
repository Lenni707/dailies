// Edit this list to add or remove games.
// `bit` is the game's permanent slot in saved data: never reuse or renumber one.
const GAMES = [
  { bit: 0, name: "Wordle",    blurb: "Five letters, six tries",       url: "https://www.nytimes.com/games/wordle/index.html" },
  { bit: 1, name: "Krillion",  blurb: "Rare answers score deeper",     url: "https://krillion.io" },
  { bit: 2, name: "Farflung",  blurb: "Find the place from map clues", url: "https://farflung.game" },
  { bit: 3, name: "Plain",     blurb: "Estimate the number",           url: "https://playplain.app" },
  { bit: 4, name: "Chartered", blurb: "Pin the place, guess the year", url: "https://playchartered.com" },
];

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
const W = Math.ceil((Math.max(...GAMES.map((g) => g.bit)) + 1) / 5);

function encode(days) {
  const keys = [...days.keys()].filter((k) => days.get(k));
  if (!keys.length) return "";
  const end = Math.max(...keys);
  const start = Math.max(Math.min(...keys), end - KEEP_DAYS);
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

function readCookie() {
  const m = document.cookie.match(new RegExp(`(?:^|; )${COOKIE}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : "";
}

function writeCookie(val) {
  const path = location.pathname.replace(/[^/]*$/, "") || "/";
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${COOKIE}=${encodeURIComponent(val)}; Max-Age=${KEEP_DAYS * 86400}; Path=${path}; SameSite=Lax${secure}`;
}

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
  const tpl = $("row");
  GAMES.forEach((g, i) => {
    const li = tpl.content.firstElementChild.cloneNode(true);
    li.dataset.bit = g.bit;
    const a = li.querySelector(".open");
    a.href = g.url;
    li.querySelector(".key").textContent = i + 1;
    li.querySelector(".name").textContent = g.name;
    li.querySelector(".blurb").textContent = g.blurb;
    li.querySelector(".check").addEventListener("click", () => toggle(g.bit));
    a.addEventListener("click", () => set(g.bit, today(), true));
    list.appendChild(li);
  });
  $("maxkey").textContent = GAMES.length;
}

function renderList() {
  let done = 0;
  for (const li of list.children) {
    const bit = +li.dataset.bit;
    const d = has(bit);
    if (d) done++;
    li.classList.toggle("done", d);
    li.querySelector(".check").setAttribute("aria-pressed", d);
    const s = streak(bit);
    li.querySelector(".streak").textContent = s > 1 ? `${s}d` : "";
  }
  $("count").textContent = `${done}/${GAMES.length}`;
  $("fill").style.width = `${(done / GAMES.length) * 100}%`;
  $("next").disabled = done === GAMES.length;
  $("date").textContent = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

/* ---------- calendar ---------- */
let view = (() => { const t = new Date(); return { y: t.getFullYear(), m: t.getMonth() }; })();
let selected = today();

const weekStart = 1; // Monday

function buildWeekdays() {
  const base = new Date(2024, 0, 1); // a Monday
  $("weekdays").innerHTML = "";
  for (let i = 0; i < 7; i++) {
    const d = new Date(base); d.setDate(1 + ((i + weekStart - 1 + 7) % 7));
    const s = document.createElement("span");
    s.textContent = d.toLocaleDateString(undefined, { weekday: "narrow" });
    $("weekdays").appendChild(s);
  }
}

function renderCal() {
  const first = new Date(view.y, view.m, 1);
  $("month").textContent = first.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const t = today();
  const now = new Date();
  $("nextMonth").disabled = view.y * 12 + view.m >= now.getFullYear() * 12 + now.getMonth();

  const grid = $("grid");
  grid.innerHTML = "";
  const lead = (first.getDay() - weekStart + 7) % 7;
  for (let i = 0; i < lead; i++) grid.appendChild(document.createElement("span"));

  const len = new Date(view.y, view.m + 1, 0).getDate();
  let monthTotal = 0, perfect = 0;
  for (let i = 1; i <= len; i++) {
    const n = dayNum(new Date(view.y, view.m, i));
    const c = countOn(n);
    monthTotal += c;
    if (c === GAMES.length) perfect++;
    const b = document.createElement("button");
    b.className = "day";
    b.textContent = i;
    b.style.setProperty("--p", c / GAMES.length);
    if (c) b.classList.add("some");
    if (c === GAMES.length) b.classList.add("all");
    if (n === t) b.classList.add("today");
    if (n === selected) b.classList.add("sel");
    if (n > t) b.disabled = true;
    b.setAttribute("aria-label", `${new Date(view.y, view.m, i).toDateString()}: ${c} of ${GAMES.length}`);
    b.addEventListener("click", () => { selected = n; render(); });
    grid.appendChild(b);
  }
  $("monthStats").textContent = monthTotal ? `${monthTotal} played · ${perfect} full ${perfect === 1 ? "day" : "days"}` : "";

  // selected day detail
  const sd = fromDayNum(selected);
  $("dayLabel").textContent = selected === t ? "Today" : sd.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const chips = $("chips");
  chips.innerHTML = "";
  for (const g of GAMES) {
    const c = document.createElement("button");
    c.className = "chip" + (has(g.bit, selected) ? " on" : "");
    c.textContent = g.name;
    c.setAttribute("aria-pressed", has(g.bit, selected));
    c.addEventListener("click", () => toggle(g.bit, selected));
    chips.appendChild(c);
  }
}

$("prevMonth").addEventListener("click", () => { view.m--; if (view.m < 0) { view.m = 11; view.y--; } renderCal(); });
$("nextMonth").addEventListener("click", () => { view.m++; if (view.m > 11) { view.m = 0; view.y++; } renderCal(); });

/* ---------- glue ---------- */
function render() { renderList(); renderCal(); }

function openGame(g) {
  if (NATIVE) NATIVE.open(g.url);
  else window.open(g.url, "_blank", "noopener");
  set(g.bit, today(), true);
}

$("next").addEventListener("click", () => {
  const g = GAMES.find((g) => !has(g.bit));
  if (g) openGame(g);
});

document.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= GAMES.length) openGame(GAMES[n - 1]);
  else if (e.key.toLowerCase() === "n") $("next").click();
});

// pick up changes from other tabs and roll over at midnight
let lastDay = today();
function refresh() {
  days = load();
  if (today() !== lastDay) {
    if (selected === lastDay) selected = today();
    lastDay = today();
    const t = new Date(); view = { y: t.getFullYear(), m: t.getMonth() };
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
buildWeekdays();
render();
