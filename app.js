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

/* ---------- scores ----------
   Map of dayNum -> { bit: "score" }.
   Saved in native bridge if available, otherwise localStorage + cookie backup. */
const SCORES_COOKIE = "dailies_scores";
const SCORES_LS = "dailies:scores";

let wordleBoards = {};

function loadScores() {
  wordleBoards = {};
  let raw = "";
  if (NATIVE && typeof NATIVE.loadScores === "function") {
    try { raw = NATIVE.loadScores(); } catch {}
  }
  if (!raw) {
    try { raw = localStorage.getItem(SCORES_LS) || ""; } catch {}
    if (!raw) {
      try { raw = unb64(readCookie(SCORES_COOKIE)); } catch {}
    }
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      const { wordle = {}, ...dayScores } = parsed;
      if (wordle && typeof wordle === "object") wordleBoards = wordle;
      return dayScores;
    }
  } catch {}
  return {};
}

function saveScores() {
  const json = JSON.stringify({ ...scores, wordle: wordleBoards });
  if (NATIVE && typeof NATIVE.saveScores === "function") {
    try { NATIVE.saveScores(json); } catch {}
  }
  try { localStorage.setItem(SCORES_LS, json); } catch {}
  try {
    if (json.length < 2800) writeCookie(b64(json), SCORES_COOKIE);
  } catch {}
}

let scores = loadScores();

function getScore(bit, d = today()) {
  return (scores[d] && scores[d][bit]) || "";
}

function setScore(bit, d, val, board = null) {
  val = (val || "").trim();
  if (board) {
    (wordleBoards[d] ??= {})[bit] = board;
  } else if ((!val || val !== getScore(bit, d)) && wordleBoards[d]) {
    delete wordleBoards[d][bit];
    if (!Object.keys(wordleBoards[d]).length) delete wordleBoards[d];
  }
  if (val) {
    if (!scores[d]) scores[d] = {};
    scores[d][bit] = val;
    if (!has(bit, d)) set(bit, d, true);
  } else {
    if (scores[d]) {
      delete scores[d][bit];
      if (Object.keys(scores[d]).length === 0) delete scores[d];
    }
  }
  saveScores();
  render();
}

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
    const scorePill = li.querySelector(".score-pill");
    const onScoreClick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      openScoreModal(g, today());
    };
    scorePill.addEventListener("click", onScoreClick);
    scorePill.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") onScoreClick(e);
    });
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
    const sc = getScore(bit, today());
    const scorePill = li.querySelector(".score-pill");
    if (sc) {
      scorePill.textContent = sc;
      scorePill.classList.add("has-score");
      scorePill.title = `Score: ${sc} · Click to edit`;
      scorePill.setAttribute("aria-label", `Score: ${sc}`);
    } else {
      scorePill.textContent = "+ score";
      scorePill.classList.remove("has-score");
      scorePill.title = "Record score for today";
      scorePill.setAttribute("aria-label", "Record score for today");
    }
  }
  $("count").textContent = `${done}/${GAMES.length}`;
  $("fill").style.width = `${GAMES.length ? (done / GAMES.length) * 100 : 0}%`;
  $("next").disabled = done === GAMES.length;
  $("date").textContent = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

/* ---------- score parsing & stats calculation ---------- */
function parseScore(val, gameName = "") {
  if (!val) return null;
  val = String(val).trim();
  const fracMatch = val.match(/^(\d+|x)\s*\/\s*(\d+)$/i);
  if (fracMatch) {
    const isX = fracMatch[1].toUpperCase() === "X";
    const den = parseInt(fracMatch[2], 10);
    const num = isX ? den + 1 : parseInt(fracMatch[1], 10);
    return {
      type: "fraction",
      value: num,
      denominator: den,
      raw: val,
      isLoss: isX,
      lowerIsBetter: den === 6 || /wordle/i.test(gameName)
    };
  }
  if (val.toUpperCase() === "X") {
    return { type: "fraction", value: 7, denominator: 6, raw: val, isLoss: true, lowerIsBetter: true };
  }
  const pctMatch = val.match(/^(\d+(?:\.\d+)?)\s*%$/);
  if (pctMatch) {
    return {
      type: "percent",
      value: parseFloat(pctMatch[1]),
      raw: val,
      lowerIsBetter: false
    };
  }
  const clean = val.replace(/,/g, "");
  const numMatch = clean.match(/^(\d+(?:\.\d+)?)/);
  if (numMatch) {
    return {
      type: "number",
      value: parseFloat(numMatch[1]),
      raw: val,
      lowerIsBetter: false
    };
  }
  return { type: "text", value: null, raw: val };
}

function scoreLevelForGame(bit, d) {
  if (!has(bit, d)) return 0;
  const sc = getScore(bit, d);
  if (!sc) return 3;
  const g = GAMES.find((x) => x.bit === bit);
  const ps = parseScore(sc, g ? g.name : "");
  if (!ps || ps.value === null) return 3;

  if (ps.type === "fraction") {
    if (ps.isLoss) return 1;
    if (ps.denominator === 6 && ps.lowerIsBetter) {
      if (ps.value <= 2) return 5;
      if (ps.value === 3) return 4;
      if (ps.value === 4) return 3;
      if (ps.value === 5) return 2;
      return 1;
    }
    const r = ps.value / ps.denominator;
    return Math.max(1, Math.min(5, Math.round(r * 5)));
  }

  if (ps.type === "percent") {
    if (ps.value >= 95) return 5;
    if (ps.value >= 85) return 4;
    if (ps.value >= 75) return 3;
    if (ps.value >= 60) return 2;
    return 1;
  }

  if (ps.type === "number") {
    const allVals = [];
    for (const dayStr of Object.keys(scores)) {
      const s = scores[dayStr]?.[bit];
      if (s) {
        const p = parseScore(s);
        if (p && p.value !== null) allVals.push(p.value);
      }
    }
    if (allVals.length <= 1) return 4;
    const min = Math.min(...allVals);
    const max = Math.max(...allVals);
    if (max === min) return 4;
    const norm = (ps.value - min) / (max - min);
    return Math.max(1, Math.min(5, Math.round(1 + norm * 4)));
  }

  return 3;
}

/* ---------- calendar (year grid: weeks are columns, Monday on top) ---------- */
const WEEKS = 53;
const weekStart = 1; // Monday
let selected = today();
let activeCalGame = "all";

const fmtDay = (n, opts = { weekday: "short", month: "short", day: "numeric" }) =>
  fromDayNum(n).toLocaleDateString(undefined, opts);
const level = (c) => (c === 0 ? 0 : Math.max(1, Math.round((c / Math.max(1, GAMES.length)) * 5)));

function renderCal() {
  const t = today();
  const dow = (fromDayNum(t).getDay() - weekStart + 7) % 7;
  const start = t - dow - (WEEKS - 1) * 7;

  // Calendar filter pills
  const calFilter = $("calFilter");
  if (calFilter) {
    calFilter.innerHTML = "";
    const allBtn = document.createElement("button");
    allBtn.type = "button";
    allBtn.className = "cal-pill" + (activeCalGame === "all" ? " active" : "");
    allBtn.textContent = "All games";
    allBtn.onclick = () => { activeCalGame = "all"; renderCal(); };
    calFilter.appendChild(allBtn);

    GAMES.forEach((g) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cal-pill" + (activeCalGame === String(g.bit) ? " active" : "");
      btn.textContent = g.name;
      btn.onclick = () => {
        activeCalGame = String(g.bit);
        activeStatsGame = g.bit;
        render();
      };
      calFilter.appendChild(btn);
    });
  }

  const grid = $("grid");
  const months = $("months");
  const scroller = $("scroller");
  const keepScroll = grid.childElementCount ? scroller.scrollLeft : null;
  grid.innerHTML = "";
  months.innerHTML = "";

  const isSpecific = activeCalGame !== "all";
  const selBit = isSpecific ? +activeCalGame : null;
  const selGame = isSpecific ? (GAMES.find((g) => g.bit === selBit) || { bit: selBit, name: "Game" }) : null;

  let total = 0, full = 0;
  for (let w = 0; w < WEEKS; w++) {
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

      if (!isSpecific) {
        const c = countOn(n);
        total += c;
        if (c && c === GAMES.length) full++;
        cell.dataset.day = n;
        cell.dataset.l = level(c);
        cell.setAttribute("aria-label", `${fmtDay(n)}: ${c} of ${GAMES.length}`);
      } else {
        const on = has(selBit, n);
        if (on) total++;
        const l = scoreLevelForGame(selBit, n);
        const sc = getScore(selBit, n);
        cell.dataset.day = n;
        cell.dataset.l = l;
        cell.setAttribute("aria-label", `${fmtDay(n)}: ${selGame.name} ${sc ? "score " + sc : (on ? "played" : "not played")}`);
      }

      if (n === t) cell.classList.add("today");
      if (n === selected) cell.classList.add("sel");
      grid.appendChild(cell);
    }
  }

  // Update stats header & legend
  if (!isSpecific) {
    $("calStats").textContent = `${total} ${total === 1 ? "game" : "games"} · ${full} full ${full === 1 ? "day" : "days"} this year`;
    if ($("legendMin")) $("legendMin").textContent = "Less";
    if ($("legendMax")) $("legendMax").textContent = "More";
  } else {
    const st = calculateGameStats(selBit);
    $("calStats").textContent = `${st.game.name} · ${st.playedCount} played · ${st.avgScore ? "Avg " + st.avgScore : "Active streak " + st.currentStreak + "d"}`;
    const isWordle = selGame.name.toLowerCase().includes("wordle");
    if ($("legendMin")) $("legendMin").textContent = isWordle ? "More tries" : "Lower";
    if ($("legendMax")) $("legendMax").textContent = isWordle ? "Fewer tries" : "Higher";
  }

  scroller.scrollLeft = keepScroll ?? scroller.scrollWidth;

  // selected day: edit what was played & scores
  $("dayLabel").textContent = selected === t ? "Today" : fmtDay(selected);
  const chips = $("chips");
  chips.innerHTML = "";
  for (const g of GAMES) {
    const on = has(g.bit, selected);
    const sc = getScore(g.bit, selected);

    const grp = document.createElement("div");
    grp.className = "day-chip-group" + (on ? " on" : "");

    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "chip-toggle";
    toggleBtn.textContent = g.name;
    toggleBtn.setAttribute("aria-pressed", on);
    toggleBtn.title = on ? "Mark as not played" : "Mark as played";
    toggleBtn.addEventListener("click", () => toggle(g.bit, selected));
    grp.appendChild(toggleBtn);

    const scoreBtn = document.createElement("button");
    scoreBtn.type = "button";
    scoreBtn.className = "chip-score";
    scoreBtn.textContent = sc || "+score";
    scoreBtn.title = sc ? `Score: ${sc} · Click to edit` : "Record score";
    scoreBtn.addEventListener("click", () => openScoreModal(g, selected));
    grp.appendChild(scoreBtn);

    chips.appendChild(grp);
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
    const on = has(g.bit, n);
    const sc = getScore(g.bit, n);
    const row = document.createElement("div");
    row.className = "tip-row" + (on ? " on" : "");
    const nameEl = document.createElement("span");
    nameEl.textContent = g.name;
    row.appendChild(nameEl);
    if (sc) {
      const scoreEl = document.createElement("span");
      scoreEl.className = "tip-score";
      scoreEl.textContent = sc;
      row.appendChild(scoreEl);
    }
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
  $("toastScore").onclick = () => {
    el.hidden = true;
    openScoreModal(g, today());
  };
  $("toastPaste").onclick = () => {
    $("toastScore").onclick();
    $("pasteScoreClipboard").click();
  };
  $("undo").onclick = () => {
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

/* ---------- statistics & trends section ---------- */
let activeStatsGame = (GAMES[0] && GAMES[0].bit) ?? 0;
let statsChartRange = 30; // 14, 30, or "all"

function calculateGameStats(bit) {
  const g = GAMES.find((x) => x.bit === bit) || { bit, name: "Game" };
  const allDayNums = Object.keys(scores).map(Number).sort((a, b) => a - b);
  
  const playedDays = [];
  const entries = [];
  const guessCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, X: 0 };
  let isGuessGame = false;

  for (const [dayNum, mask] of days.entries()) {
    if (mask & (1 << bit)) playedDays.push(dayNum);
  }

  for (const d of allDayNums) {
    const sc = scores[d]?.[bit];
    if (sc) {
      const ps = parseScore(sc, g.name);
      if (ps) {
        entries.push({ day: d, raw: sc, parsed: ps });
        if (ps.type === "fraction" && ps.denominator === 6) {
          isGuessGame = true;
          if (ps.isLoss) guessCounts.X++;
          else if (ps.value >= 1 && ps.value <= 6) guessCounts[ps.value]++;
        }
      }
    }
  }

  const currentStreak = streak(bit);
  
  let bestStreak = 0, run = 0, prev = -999999;
  for (const d of [...playedDays].sort((a, b) => a - b)) {
    run = (d === prev + 1) ? run + 1 : 1;
    prev = d;
    bestStreak = Math.max(bestStreak, run);
  }

  let avgScore = null;
  let bestScore = null;
  const numValues = comparableScores(entries).filter((e) => !e.parsed.isLoss);

  if (numValues.length > 0) {
    const sum = numValues.reduce((acc, e) => acc + e.parsed.value, 0);
    const avgVal = sum / numValues.length;
    const firstType = numValues[0].parsed.type;

    if (firstType === "fraction") {
      avgScore = `${avgVal.toFixed(1)} / ${numValues[0].parsed.denominator}`;
      const best = numValues[0].parsed.lowerIsBetter ? Math.min : Math.max;
      const bestVal = best(...numValues.map((e) => e.parsed.value));
      bestScore = `${bestVal} / ${numValues[0].parsed.denominator}`;
    } else if (firstType === "percent") {
      avgScore = `${avgVal.toFixed(1)}%`;
      const bestVal = Math.max(...numValues.map((e) => e.parsed.value));
      bestScore = `${bestVal}%`;
    } else {
      avgScore = Math.round(avgVal).toLocaleString();
      const bestVal = Math.max(...numValues.map((e) => e.parsed.value));
      bestScore = bestVal.toLocaleString();
    }
  }

  const latestEntry = entries.length ? entries[entries.length - 1] : null;

  return {
    game: g,
    playedCount: playedDays.length,
    recordedCount: entries.length,
    currentStreak,
    bestStreak,
    avgScore,
    bestScore,
    latestScore: latestEntry ? latestEntry.raw : null,
    entries,
    guessCounts,
    isGuessGame
  };
}

function renderStatsSection() {
  const sec = $("statsSection");
  if (!sec) return;

  if (!GAMES.some((g) => g.bit === activeStatsGame) && GAMES.length > 0) {
    activeStatsGame = GAMES[0].bit;
  }

  const pills = $("statsGamePills");
  if (pills) {
    pills.innerHTML = "";
    GAMES.forEach((g) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "stats-pill" + (activeStatsGame === g.bit ? " active" : "");
      btn.textContent = g.name;
      btn.onclick = () => {
        activeStatsGame = g.bit;
        activeCalGame = String(g.bit);
        render();
      };
      pills.appendChild(btn);
    });
  }

  const st = calculateGameStats(activeStatsGame);
  const subEl = $("statsSub");
  if (subEl) subEl.textContent = `${st.game.name} performance over time`;
  const chartTitle = $("chartTitle");
  if (chartTitle) chartTitle.textContent = `${st.game.name} score over time`;

  const rangeWrap = $("chartRange");
  if (rangeWrap) {
    for (const btn of rangeWrap.children) {
      const r = btn.dataset.range;
      btn.classList.toggle("active", String(statsChartRange) === r);
      btn.onclick = () => {
        statsChartRange = r === "all" ? "all" : +r;
        renderStatsSection();
      };
    }
  }

  const kpiGrid = $("kpiGrid");
  if (kpiGrid) {
    kpiGrid.innerHTML = `
      <div class="kpi-card">
        <span class="kpi-label">Days Played</span>
        <span class="kpi-val">${st.playedCount}</span>
        <span class="kpi-sub">${st.recordedCount} with score</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">Average Score</span>
        <span class="kpi-val">${st.avgScore || "—"}</span>
        <span class="kpi-sub">${st.recordedCount ? "Across recorded" : "No scores"}</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">Best Score</span>
        <span class="kpi-val">${st.bestScore || "—"}</span>
        <span class="kpi-sub">Personal record</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">Current Streak</span>
        <span class="kpi-val">${st.currentStreak}d</span>
        <span class="kpi-sub">Best: ${st.bestStreak}d</span>
      </div>
    `;
  }

  renderScoreChart(st);
  renderWordleStats(st.game.bit);

  const distCard = $("distCard");
  const distChart = $("distChart");
  if (distCard && distChart) {
    if (st.isGuessGame && st.recordedCount > 0) {
      distCard.hidden = false;
      distChart.innerHTML = "";
      const maxCount = Math.max(1, ...Object.values(st.guessCounts));
      const todayScore = getScore(st.game.bit, today());

      ["1", "2", "3", "4", "5", "6", "X"].forEach((tryKey) => {
        const count = st.guessCounts[tryKey] || 0;
        const pct = Math.max(10, Math.round((count / maxCount) * 100));
        const isToday = todayScore && (todayScore.startsWith(tryKey + "/") || todayScore.toUpperCase() === tryKey);

        const row = document.createElement("div");
        row.className = "dist-row";
        row.innerHTML = `
          <span class="dist-label">${tryKey}</span>
          <div class="dist-bar-track">
            <div class="dist-bar ${isToday ? 'highlight' : ''}" style="width: ${pct}%;">
              ${count}
            </div>
          </div>
        `;
        distChart.appendChild(row);
      });
    } else {
      distCard.hidden = true;
    }
  }
}

function comparableScores(entries) {
  const numeric = entries.filter(({ parsed }) => Number.isFinite(parsed.value));
  const last = numeric.at(-1)?.parsed;
  return numeric.filter(({ parsed }) => parsed.type === last.type && parsed.denominator === last.denominator);
}

function renderScoreChart(st) {
  const wrap = $("scoreChartWrap");
  if (!wrap) return;
  wrap.innerHTML = "";

  const t = today();
  let entries = comparableScores(st.entries);

  if (statsChartRange === 14) {
    entries = entries.filter((e) => e.day >= t - 14);
  } else if (statsChartRange === 30) {
    entries = entries.filter((e) => e.day >= t - 30);
  }

  if (entries.length === 0) {
    wrap.innerHTML = `<div class="scores-empty">No scores recorded for this time range. Record today's score using "+ score" above to start your trend chart!</div>`;
    return;
  }

  const W = 520, H = 160;
  const pad = { top: 20, right: 24, bottom: 28, left: 38 };
  const pw = W - pad.left - pad.right;
  const ph = H - pad.top - pad.bottom;

  const firstParsed = entries[0].parsed;
  const lowerIsBetter = firstParsed.lowerIsBetter;
  const vals = entries.map((e) => e.parsed.value);

  let yMin, yMax;
  if (firstParsed.type === "fraction") {
    yMin = lowerIsBetter ? 1 : 0;
    yMax = Math.max(2, firstParsed.denominator, Math.max(...vals));
  } else if (firstParsed.type === "percent") {
    const minVal = Math.min(...vals);
    yMin = Math.max(0, Math.min(60, Math.floor(minVal / 10) * 10));
    yMax = Math.max(100, ...vals);
  } else {
    const minVal = Math.min(...vals);
    const maxVal = Math.max(...vals);
    yMin = Math.floor(minVal * 0.9);
    yMax = Math.ceil(maxVal * 1.05);
    if (yMin === yMax) { yMin -= 5; yMax += 5; }
  }

  const firstDay = entries[0].day;
  const lastDay = entries.at(-1).day;
  const points = entries.map((e) => {
    const x = firstDay === lastDay ? pad.left + pw / 2 : pad.left + ((e.day - firstDay) / (lastDay - firstDay)) * pw;
    let y;
    if (lowerIsBetter) {
      y = pad.top + ((e.parsed.value - yMin) / (yMax - yMin)) * ph;
    } else {
      y = pad.top + ph - ((e.parsed.value - yMin) / (yMax - yMin)) * ph;
    }
    return { x, y, day: e.day, raw: e.raw, val: e.parsed.value };
  });

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);

  const defs = document.createElementNS(svgNS, "defs");
  defs.innerHTML = `
    <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="var(--done)" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="var(--done)" stop-opacity="0.0"/>
    </linearGradient>
  `;
  svg.appendChild(defs);

  const ticks = [yMin, (yMin + yMax) / 2, yMax];
  ticks.forEach((tickVal) => {
    let tickY;
    if (lowerIsBetter) {
      tickY = pad.top + ((tickVal - yMin) / (yMax - yMin)) * ph;
    } else {
      tickY = pad.top + ph - ((tickVal - yMin) / (yMax - yMin)) * ph;
    }

    const line = document.createElementNS(svgNS, "line");
    line.setAttribute("x1", pad.left);
    line.setAttribute("x2", pad.left + pw);
    line.setAttribute("y1", tickY);
    line.setAttribute("y2", tickY);
    line.setAttribute("stroke", "var(--line)");
    line.setAttribute("stroke-dasharray", "3,3");
    svg.appendChild(line);

    const txt = document.createElementNS(svgNS, "text");
    txt.setAttribute("x", pad.left - 6);
    txt.setAttribute("y", tickY + 3);
    txt.setAttribute("text-anchor", "end");
    txt.setAttribute("fill", "var(--muted)");
    txt.setAttribute("font-size", "10");
    txt.setAttribute("font-family", "Geist Mono, monospace");
    const labelStr = firstParsed.type === "percent" ? `${Math.round(tickVal)}%` : String(Math.round(tickVal));
    txt.textContent = labelStr;
    svg.appendChild(txt);
  });

  if (points.length >= 2) {
    const bottomY = pad.top + ph;
    const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
    const areaD = `${pathD} L ${points[points.length - 1].x.toFixed(1)} ${bottomY} L ${points[0].x.toFixed(1)} ${bottomY} Z`;

    const area = document.createElementNS(svgNS, "path");
    area.setAttribute("d", areaD);
    area.setAttribute("fill", "url(#scoreGrad)");
    svg.appendChild(area);

    const line = document.createElementNS(svgNS, "path");
    line.setAttribute("d", pathD);
    line.setAttribute("fill", "none");
    line.setAttribute("stroke", "var(--done)");
    line.setAttribute("stroke-width", "2.5");
    line.setAttribute("stroke-linecap", "round");
    line.setAttribute("stroke-linejoin", "round");
    svg.appendChild(line);
  }

  let lastLabelX = -Infinity;
  points.forEach((p, i) => {
    const isLast = i === points.length - 1;
    if (i === 0 || isLast || (p.x - lastLabelX >= 80 && points.at(-1).x - p.x >= 80)) {
      lastLabelX = p.x;
      const txt = document.createElementNS(svgNS, "text");
      txt.setAttribute("x", p.x);
      txt.setAttribute("y", H - 8);
      txt.setAttribute("text-anchor", "middle");
      txt.setAttribute("fill", "var(--muted)");
      txt.setAttribute("font-size", "10");
      txt.setAttribute("font-family", "Geist Mono, monospace");
      txt.textContent = fmtDay(p.day, { month: "short", day: "numeric" });
      svg.appendChild(txt);
    }
  });

  const tooltip = document.createElement("div");
  tooltip.className = "chart-tooltip";
  tooltip.hidden = true;
  wrap.appendChild(tooltip);

  points.forEach((p) => {
    const circle = document.createElementNS(svgNS, "circle");
    circle.setAttribute("cx", p.x);
    circle.setAttribute("cy", p.y);
    circle.setAttribute("r", points.length > 25 ? "3" : "4.5");
    circle.setAttribute("fill", "var(--surface)");
    circle.setAttribute("stroke", "var(--done)");
    circle.setAttribute("stroke-width", "2");
    circle.classList.add("chart-point");

    const showTip = () => {
      tooltip.textContent = `${p.raw} · ${fmtDay(p.day, { month: "short", day: "numeric" })}`;
      tooltip.hidden = false;
      const pctX = (p.x / W) * 100;
      const pctY = (p.y / H) * 100;
      tooltip.style.left = `${pctX}%`;
      tooltip.style.top = `${pctY}%`;
    };

    circle.addEventListener("mouseenter", showTip);
    circle.addEventListener("touchstart", showTip, { passive: true });
    circle.addEventListener("click", () => {
      const g = GAMES.find((x) => x.bit === activeStatsGame);
      if (g) openScoreModal(g, p.day);
    });

    svg.appendChild(circle);
  });

  wrap.onmouseleave = () => { tooltip.hidden = true; };
  wrap.appendChild(svg);
}

/* ---------- result imports & Wordle boards ---------- */
function parseSharedResult(game, input) {
  const text = input.trim().replace(/[\uFE0E\uFE0F]/g, "");
  const name = game.name.trim().toLowerCase();
  const wordle = text.match(/^Wordle\s+[\d,.]+\s+([1-6X])\s*\/\s*6\*?\s*$/im);
  if (wordle && name !== "wordle") return null;
  const scoreNumber = String.raw`(?:\d{1,3}(?:[, '\u00a0\u202f]\d{3})+|\d+)(?:\.\d+)?`;
  const plainScore = new RegExp(`^(?:${scoreNumber}\\s*%?|(?:[1-6]|X)\\s*\\/\\s*6|\\d+\\s*\\/\\s*\\d+)$`, "i");
  const normalize = (score) => score.toUpperCase().replace(/[, '\u00a0\u202f]/g, "");
  if (plainScore.test(text)) return { score: normalize(text) };

  if (name === "wordle") {
    if (!wordle) return null;
    const cells = { "🟩": "g", "🟨": "y", "⬛": "x", "⬜": "x", "🟧": "g", "🟦": "y" };
    const rows = text.split(/\r?\n/).map((line) => line.replace(/\s/g, ""))
      .filter((line) => /^[🟩🟨⬛⬜🟧🟦]+$/u.test(line))
      .map((line) => Array.from(line, (cell) => cells[cell]).join(""));
    const tries = wordle[1].toUpperCase();
    const won = tries !== "X";
    const validBoard = rows.length === (won ? +tries : 6) &&
      rows.every((row, i) => row.length === 5 && (row === "ggggg") === (won && i === rows.length - 1));
    return { score: `${tries}/6`, board: validBoard ? rows : null };
  }

  const formats = {
    krillion: { host: "krillion.io", unit: "points?|pts\\.?" },
    farflung: { host: "farflung.game", unit: "km|kilomet(?:er|re)s?" },
    plain: { host: "playplain.app", unit: "m|met(?:er|re)s?" },
    chartered: { host: "playchartered.com", unit: "points?|pts\\.?" }
  };
  const format = Object.prototype.hasOwnProperty.call(formats, name) && formats[name];
  if (!format) return null;
  const withoutLinks = text.replace(/(?:https?:\/\/|www\.)\S+/gi, "");
  const lines = withoutLinks.split(/\r?\n/);
  const source = Object.entries(formats).find(([label, { host }]) =>
    new RegExp(`(?:^|[\\n\\s/])(?:www\\.)?${host.replace(".", "\\.")}(?=[/\\s]|$)`, "i").test(text) ||
    lines.some((line) => new RegExp(`^\\s*(?:i played\\s+)?${label}\\b`, "i").test(line))
  );
  if (source && source[0] !== name) return null;

  // The game header can contain a puzzle number. Only read it as a score
  // when it has a score unit, a denominator, or an explicit score label.
  const unit = new RegExp(`(?:^|[^\\w#.,/-])(${scoreNumber})\\s*(?:${format.unit})(?![\\w/])`, "i");
  const total = new RegExp(`(?:^|[^\\w#.,/-])(${scoreNumber})\\s*(?:/|out of)\\s*(${scoreNumber})(?![\\w.,/])`, "i");
  const labelled = new RegExp(`\\b(?:score|altitude|distance)\\s*[:=·]\\s*(${scoreNumber})(\\s*%)?`, "i");
  for (const line of lines) {
    const match = line.match(total);
    if (match && +normalize(match[2]) > 0 && +normalize(match[1]) <= +normalize(match[2])) {
      return { score: `${normalize(match[1])}/${normalize(match[2])}` };
    }
    const measured = line.match(unit);
    if (measured) return { score: normalize(measured[1]) };
    const marked = line.match(labelled);
    if (marked) return { score: normalize(marked[1]) + (marked[2] ? "%" : "") };
  }
  const standalone = lines.map((line) => line.trim()).filter((line) => plainScore.test(line));
  return source && standalone.length === 1 ? { score: normalize(standalone[0]) } : null;
}

const wordleTileNames = { g: "Correct position", y: "Wrong position", x: "Absent" };

function renderWordleBoard(container, rows) {
  container.replaceChildren();
  if (!Array.isArray(rows) || !rows.length || rows.some((row) => !/^[gyx]{5}$/.test(row))) return;
  const board = document.createElement("div");
  board.className = "wordle-board";
  board.setAttribute("role", "img");
  board.setAttribute("aria-label", rows.map((row, i) =>
    `Guess ${i + 1}: ${Array.from(row, (cell) => wordleTileNames[cell]).join(", ")}`
  ).join("; "));
  rows.forEach((row, i) => {
    const number = document.createElement("span");
    number.className = "wordle-guess";
    number.textContent = i + 1;
    board.append(number);
    for (const cell of row) {
      const tile = document.createElement("span");
      tile.className = "wordle-tile";
      tile.dataset.result = cell;
      tile.title = wordleTileNames[cell];
      board.append(tile);
    }
  });
  const legend = document.createElement("div");
  legend.className = "wordle-legend";
  for (const [result, label] of Object.entries(wordleTileNames)) {
    const item = document.createElement("span");
    item.dataset.result = result;
    item.textContent = label;
    legend.append(item);
  }
  container.append(board, legend);
}

function renderWordleStats(bit) {
  const card = $("wordleCard");
  const select = $("wordleDate");
  const previous = select.value;
  const dates = Object.keys(wordleBoards).filter((day) => wordleBoards[day]?.[bit])
    .map(Number).sort((a, b) => b - a);
  card.hidden = dates.length === 0;
  if (card.hidden) return;
  select.replaceChildren(...dates.map((day) => new Option(
    `${fmtDay(day, { year: "numeric", month: "short", day: "numeric" })} · ${getScore(bit, day)}`, day
  )));
  if (dates.includes(Number(previous))) select.value = previous;
  select.onchange = () => renderWordleBoard($("wordleStatsBoard"), wordleBoards[select.value]?.[bit]);
  select.onchange();
}

/* ---------- score modal ---------- */
const scoreModal = $("scoreModal");
let currentScoreGame = null;
let currentScoreDay = null;
let importedScore = null;

function openScoreModal(game, day) {
  currentScoreGame = game;
  currentScoreDay = day;
  $("scoreTitle").textContent = `${game.name} score`;
  $("scoreDate").textContent = day === today() ? `Today · ${fmtDay(day)}` : fmtDay(day);
  const currentVal = getScore(game.bit, day);
  $("scoreInput").value = currentVal;
  $("shareInput").value = "";
  $("pastePanel").hidden = true;
  $("pasteStatus").textContent = "";
  importedScore = null;
  renderWordleBoard($("scoreWordleBoard"), wordleBoards[day]?.[game.bit]);
  $("clearScore").hidden = !currentVal;

  const quick = $("scoreQuick");
  quick.innerHTML = "";
  let presets = [];
  const lname = game.name.toLowerCase();
  if (lname.includes("wordle")) {
    presets = ["1/6", "2/6", "3/6", "4/6", "5/6", "6/6", "X/6"];
  }

  presets.forEach((p) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "quick-chip";
    btn.textContent = p;
    btn.onclick = () => {
      $("scoreInput").value = p;
      setScore(currentScoreGame.bit, currentScoreDay, p);
      scoreModal.close();
    };
    quick.appendChild(btn);
  });

  scoreModal.showModal();
  $("scoreInput").focus();
}

$("scoreForm").addEventListener("submit", (e) => {
  e.preventDefault();
  if (!currentScoreGame) return;
  const val = $("scoreInput").value.trim();
  const board = importedScore?.score === val ? importedScore.board : null;
  setScore(currentScoreGame.bit, currentScoreDay, val, board);
  scoreModal.close();
});

function previewScoreImport(text) {
  const field = $("scoreInput");
  const previous = importedScore;
  importedScore = parseSharedResult(currentScoreGame, text);
  const status = $("pasteStatus");
  if (!importedScore) {
    if (previous?.score === field.value) field.value = getScore(currentScoreGame.bit, currentScoreDay);
    status.textContent = text.trim() ? "No score found for this game. Paste a full result or enter the score above." : "";
    renderWordleBoard($("scoreWordleBoard"), wordleBoards[currentScoreDay]?.[currentScoreGame.bit]);
    return;
  }
  field.value = importedScore.score;
  status.textContent = `Found ${importedScore.score}. Select Save to record it for ${fmtDay(currentScoreDay)}.`;
  renderWordleBoard($("scoreWordleBoard"), importedScore.board);
}

$("shareInput").addEventListener("input", (event) => previewScoreImport(event.target.value));

$("scoreInput").addEventListener("paste", (event) => {
  const text = event.clipboardData?.getData("text/plain");
  if (!text || (!/\r?\n/.test(text) && !parseSharedResult(currentScoreGame, text))) return;
  event.preventDefault();
  $("pastePanel").hidden = false;
  $("shareInput").value = text;
  previewScoreImport(text);
});

$("pasteScoreClipboard").addEventListener("click", async () => {
  const input = $("shareInput");
  const game = currentScoreGame;
  const day = currentScoreDay;
  $("pastePanel").hidden = false;
  input.focus();
  let text = "";
  try {
    text = typeof NATIVE?.readClipboard === "function"
      ? NATIVE.readClipboard() : await navigator.clipboard?.readText();
  } catch {}
  if (!scoreModal.open || currentScoreGame !== game || currentScoreDay !== day || !text) return;
  input.value = text;
  previewScoreImport(text);
});

$("clearScore").addEventListener("click", () => {
  if (!currentScoreGame) return;
  setScore(currentScoreGame.bit, currentScoreDay, "");
  scoreModal.close();
});
$("cancelScore").addEventListener("click", () => scoreModal.close());
$("closeScore").addEventListener("click", () => scoreModal.close());
scoreModal.addEventListener("click", (e) => { if (e.target === scoreModal) scoreModal.close(); });

/* ---------- scores log modal ---------- */
const scoresLogModal = $("scoresLogModal");
let activeScoresFilter = "all";

function openScoresLog() {
  renderScoresLog();
  scoresLogModal.showModal();
}

function renderScoresLog() {
  const filterWrap = $("scoresFilter");
  filterWrap.innerHTML = "";

  const allBtn = document.createElement("button");
  allBtn.type = "button";
  allBtn.className = "filter-pill" + (activeScoresFilter === "all" ? " active" : "");
  allBtn.textContent = "All games";
  allBtn.onclick = () => { activeScoresFilter = "all"; renderScoresLog(); };
  filterWrap.appendChild(allBtn);

  GAMES.forEach((g) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "filter-pill" + (activeScoresFilter === String(g.bit) ? " active" : "");
    btn.textContent = g.name;
    btn.onclick = () => { activeScoresFilter = String(g.bit); renderScoresLog(); };
    filterWrap.appendChild(btn);
  });

  // Collect all recorded scores sorted by day descending
  const entries = [];
  const dayKeys = Object.keys(scores).map(Number).sort((a, b) => b - a);
  for (const d of dayKeys) {
    const dayScores = scores[d] || {};
    for (const [bitStr, scoreVal] of Object.entries(dayScores)) {
      const bit = +bitStr;
      if (activeScoresFilter !== "all" && activeScoresFilter !== String(bit)) continue;
      const game = GAMES.find((g) => g.bit === bit) || { bit, name: `Game #${bit}` };
      entries.push({ day: d, bit, game, score: scoreVal });
    }
  }

  // Summary statistics
  const summary = $("scoresSummary");
  if (entries.length > 0) {
    summary.hidden = false;
    summary.innerHTML = "";

    const totalStat = document.createElement("div");
    totalStat.className = "summary-stat";
    totalStat.innerHTML = `<span class="stat-label">Recorded</span><span class="stat-val">${entries.length}</span>`;
    summary.appendChild(totalStat);

    // If filtering a single game or all, check if numeric / fraction
    const guesses = [];
    const nums = [];
    entries.forEach((e) => {
      const m = e.score.match(/^(\d+)\/(\d+)$/);
      if (m) {
        guesses.push(+m[1]);
      } else {
        const num = parseFloat(e.score.replace(/[^0-9.-]/g, ""));
        if (!isNaN(num)) nums.push(num);
      }
    });

    if (guesses.length >= 2) {
      const avg = (guesses.reduce((a, b) => a + b, 0) / guesses.length).toFixed(1);
      const best = Math.min(...guesses);
      const statEl = document.createElement("div");
      statEl.className = "summary-stat";
      statEl.innerHTML = `<span class="stat-label">Avg tries</span><span class="stat-val">${avg}</span>`;
      summary.appendChild(statEl);

      const bestEl = document.createElement("div");
      bestEl.className = "summary-stat";
      bestEl.innerHTML = `<span class="stat-label">Best</span><span class="stat-val">${best}</span>`;
      summary.appendChild(bestEl);
    } else if (nums.length >= 2 && activeScoresFilter !== "all") {
      const avg = Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
      const max = Math.max(...nums);
      const statEl = document.createElement("div");
      statEl.className = "summary-stat";
      statEl.innerHTML = `<span class="stat-label">Average</span><span class="stat-val">${avg}</span>`;
      summary.appendChild(statEl);

      const maxEl = document.createElement("div");
      maxEl.className = "summary-stat";
      maxEl.innerHTML = `<span class="stat-label">Best</span><span class="stat-val">${max}</span>`;
      summary.appendChild(maxEl);
    }
  } else {
    summary.hidden = true;
  }

  const listEl = $("scoresList");
  listEl.innerHTML = "";
  if (!entries.length) {
    const empty = document.createElement("div");
    empty.className = "scores-empty";
    empty.textContent = "No scores recorded yet. Click '+ score' on any game to record one.";
    listEl.appendChild(empty);
    return;
  }

  entries.forEach((item) => {
    const row = document.createElement("div");
    row.className = "score-row";
    row.title = "Click to edit score";

    const left = document.createElement("div");
    left.className = "score-row-left";

    const gameName = document.createElement("span");
    gameName.className = "score-row-game";
    gameName.textContent = item.game.name;

    const dateStr = document.createElement("span");
    dateStr.className = "score-row-date";
    dateStr.textContent = item.day === today() ? `Today · ${fmtDay(item.day)}` : fmtDay(item.day);

    left.append(gameName, dateStr);

    const val = document.createElement("span");
    val.className = "score-row-val";
    val.textContent = item.score;

    row.append(left, val);
    row.onclick = () => {
      scoresLogModal.close();
      openScoreModal(item.game, item.day);
    };
    listEl.appendChild(row);
  });
}

$("viewScores").addEventListener("click", openScoresLog);
$("closeScoresLog").addEventListener("click", () => scoresLogModal.close());
scoresLogModal.addEventListener("click", (e) => { if (e.target === scoresLogModal) scoresLogModal.close(); });

/* ---------- glue ---------- */
function render() {
  renderList();
  renderCal();
  renderStatsSection();
}

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
  scores = loadScores();
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
