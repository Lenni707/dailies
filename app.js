// Edit this list to add or remove games.
const GAMES = [
  { id: "wordle",    name: "Wordle",    blurb: "Five letters, six tries",            url: "https://www.nytimes.com/games/wordle/index.html" },
  { id: "krillion",  name: "Krillion",  blurb: "Rare answers score deeper",          url: "https://krillion.io" },
  { id: "farflung",  name: "Farflung",  blurb: "Find the place from map clues",      url: "https://farflung.game" },
  { id: "plain",     name: "Plain",     blurb: "Estimate the number",                url: "https://playplain.app" },
  { id: "chartered", name: "Chartered", blurb: "Pin the place, guess the year",      url: "https://playchartered.com" },
];

const KEY = "dailies:v1";

const dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}
function save(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
}

// state: { [gameId]: ["2026-11-17", ...] }  — days the game was marked played
let state = load();

const isDone = (id, day = dayKey()) => (state[id] || []).includes(day);

function streak(id) {
  const days = new Set(state[id] || []);
  const d = new Date();
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1); // today not played yet doesn't break it
  let n = 0;
  while (days.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

function toggle(id, force) {
  const today = dayKey();
  const days = new Set(state[id] || []);
  const on = force ?? !days.has(today);
  on ? days.add(today) : days.delete(today);
  // keep the last ~400 days
  state[id] = [...days].sort().slice(-400);
  save(state);
  render();
}

const list = document.getElementById("games");
const tpl = document.getElementById("row");

function build() {
  GAMES.forEach((g, i) => {
    const li = tpl.content.firstElementChild.cloneNode(true);
    li.dataset.id = g.id;
    const a = li.querySelector(".open");
    a.href = g.url;
    li.querySelector(".key").textContent = i + 1;
    li.querySelector(".name").textContent = g.name;
    li.querySelector(".blurb").textContent = g.blurb;
    li.querySelector(".check").addEventListener("click", () => toggle(g.id));
    a.addEventListener("click", () => toggle(g.id, true));
    list.appendChild(li);
  });
  document.getElementById("maxkey").textContent = GAMES.length;
}

function render() {
  let done = 0;
  for (const li of list.children) {
    const id = li.dataset.id;
    const d = isDone(id);
    if (d) done++;
    li.classList.toggle("done", d);
    li.querySelector(".check").setAttribute("aria-pressed", d);
    const s = streak(id);
    li.querySelector(".streak").textContent = s > 1 ? `${s}d` : "";
  }
  document.getElementById("count").textContent = `${done}/${GAMES.length}`;
  document.getElementById("fill").style.width = `${(done / GAMES.length) * 100}%`;
  document.getElementById("next").disabled = done === GAMES.length;
  document.getElementById("date").textContent =
    new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

function openGame(g) {
  window.open(g.url, "_blank", "noopener");
  toggle(g.id, true);
}

document.getElementById("next").addEventListener("click", () => {
  const g = GAMES.find((g) => !isDone(g.id));
  if (g) openGame(g);
});

document.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= GAMES.length) openGame(GAMES[n - 1]);
  else if (e.key.toLowerCase() === "n") document.getElementById("next").click();
});

// re-render when coming back to the tab (and across midnight)
document.addEventListener("visibilitychange", () => { if (!document.hidden) { state = load(); render(); } });
setInterval(render, 60_000);

build();
render();
