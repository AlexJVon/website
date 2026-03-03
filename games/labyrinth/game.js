console.log("maze.js loaded — standalone edition");

// ================================================
// DAILY SEED — same maze for everyone each day
// ================================================
function cyrb128(str) {
  let h1 = 1779033703, h2 = 3144134277,
      h3 = 1013904242, h4 = 2773480762;
  for (let i = 0, k; i < str.length; i++) {
    k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  return [h1 >>> 0];
}

function mulberry32(a) {
  return function () {
    a |= 0;
    a = a + 0x6d2b79f5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

let dateStr = new Date().toISOString().slice(0, 10);
let seed = cyrb128(dateStr)[0];
let rand = mulberry32(seed);

// Show date in header
let dateDisplay = document.getElementById("dateDisplay");
if (dateDisplay) {
  let d = new Date();
  dateDisplay.textContent = d.toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric"
  });
}

// ================================================
// MAZE SETTINGS
// ================================================
const rows = 25;
const cols = 25;

let maze = [];
let stack = [];
let player = { x: 0, y: 0 };
let exitCell = null;

let steps = 0;
let turns = 0;
let lastDir = null;
let gameWon = false;

// Timer
let timerSeconds = 0;
let timerInterval = null;

function startTimer() {
  if (timerInterval) return;
  timerInterval = setInterval(() => {
    timerSeconds++;
    let m = Math.floor(timerSeconds / 60);
    let s = timerSeconds % 60;
    let el = document.getElementById("hud-time");
    if (el) el.textContent = m + ":" + (s < 10 ? "0" : "") + s;
  }, 1000);
}

function stopTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
}

// ================================================
// CELL
// ================================================
function cell(x, y) {
  return {
    x, y,
    visited: false,
    revealed: false,
    walls: { N: true, S: true, E: true, W: true }
  };
}

// ================================================
// BUILD GRID
// ================================================
for (let y = 0; y < rows; y++) {
  maze[y] = [];
  for (let x = 0; x < cols; x++) {
    maze[y][x] = cell(x, y);
  }
}

// ================================================
// DFS MAZE GENERATION
// ================================================
function generateMaze() {
  let current = maze[0][0];
  current.visited = true;
  stack.push(current);

  while (stack.length > 0) {
    let { x, y } = current;
    let neighbors = [];

    if (y > 0 && !maze[y - 1][x].visited) neighbors.push(["N", maze[y - 1][x]]);
    if (y < rows - 1 && !maze[y + 1][x].visited) neighbors.push(["S", maze[y + 1][x]]);
    if (x > 0 && !maze[y][x - 1].visited) neighbors.push(["W", maze[y][x - 1]]);
    if (x < cols - 1 && !maze[y][x + 1].visited) neighbors.push(["E", maze[y][x + 1]]);

    if (neighbors.length > 0) {
      let [dir, next] = neighbors[Math.floor(rand() * neighbors.length)];

      if (dir === "N") { current.walls.N = false; next.walls.S = false; }
      if (dir === "S") { current.walls.S = false; next.walls.N = false; }
      if (dir === "E") { current.walls.E = false; next.walls.W = false; }
      if (dir === "W") { current.walls.W = false; next.walls.E = false; }

      next.visited = true;
      stack.push(current);
      current = next;
    } else {
      current = stack.pop();
    }
  }
}

generateMaze();

// ================================================
// ADD EXTRA CONNECTIONS (multiple routes)
// ================================================
function addExtraConnections(amount) {
  for (let i = 0; i < amount; i++) {
    let x = Math.floor(rand() * cols);
    let y = Math.floor(rand() * rows);
    let c = maze[y][x];

    let dirs = [];
    if (y > 0) dirs.push(["N", maze[y - 1][x]]);
    if (y < rows - 1) dirs.push(["S", maze[y + 1][x]]);
    if (x > 0) dirs.push(["W", maze[y][x - 1]]);
    if (x < cols - 1) dirs.push(["E", maze[y][x + 1]]);

    if (dirs.length === 0) continue;

    let [dir, n] = dirs[Math.floor(rand() * dirs.length)];

    if (dir === "N") { c.walls.N = false; n.walls.S = false; }
    if (dir === "S") { c.walls.S = false; n.walls.N = false; }
    if (dir === "E") { c.walls.E = false; n.walls.W = false; }
    if (dir === "W") { c.walls.W = false; n.walls.E = false; }
  }
}

addExtraConnections(45);

// ================================================
// RANDOM EXIT
// ================================================
function pickRandomExit() {
  let ex, ey;
  do {
    ex = Math.floor(rand() * cols);
    ey = Math.floor(rand() * rows);
  } while (ex === 0 && ey === 0);
  return { x: ex, y: ey };
}

exitCell = pickRandomExit();

// ================================================
// VISIBILITY — fog of war
// ================================================
function updateVisibility() {
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      let dx = Math.abs(x - player.x);
      let dy = Math.abs(y - player.y);
      if (dx + dy <= 1) maze[y][x].revealed = true;
    }
  }
}

updateVisibility();

// ================================================
// DRAWING — rustic themed
// ================================================
let canvas = document.getElementById("mazeCanvas");
let ctx = canvas.getContext("2d");
let size = canvas.width / cols;

// Colors matching the rustic theme
const COLOR_FOG       = "#0d0d0a";
const COLOR_FLOOR     = "#2a2a1e";
const COLOR_FLOOR_ALT = "#262618";
const COLOR_WALL      = "#6b3a2a";
const COLOR_WALL_DARK = "#4a2518";
const COLOR_PLAYER    = "#c8a84e";
const COLOR_PLAYER_GLOW = "rgba(200,168,78,0.3)";
const COLOR_EXIT      = "#4ecdc4";
const COLOR_EXIT_GLOW = "rgba(78,205,196,0.3)";
const COLOR_MOSS_HINT = "rgba(58,107,53,0.15)";

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Fill entire background with fog color
  ctx.fillStyle = COLOR_FOG;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  let revealExit = document.getElementById("revealExit").checked;

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      let c = maze[y][x];

      if (!c.revealed) continue;

      // Floor — slight checker for texture
      ctx.fillStyle = (x + y) % 2 === 0 ? COLOR_FLOOR : COLOR_FLOOR_ALT;
      ctx.fillRect(x * size, y * size, size, size);

      // Occasional moss hint on floor
      if ((x * 7 + y * 13) % 11 < 3) {
        ctx.fillStyle = COLOR_MOSS_HINT;
        ctx.fillRect(x * size, y * size, size, size);
      }

      // Walls — thick brick lines
      ctx.lineWidth = 2;
      ctx.lineCap = "round";

      if (c.walls.N) {
        ctx.strokeStyle = COLOR_WALL_DARK;
        ctx.beginPath();
        ctx.moveTo(x * size, y * size + 1);
        ctx.lineTo((x + 1) * size, y * size + 1);
        ctx.stroke();

        ctx.strokeStyle = COLOR_WALL;
        ctx.beginPath();
        ctx.moveTo(x * size, y * size);
        ctx.lineTo((x + 1) * size, y * size);
        ctx.stroke();
      }

      if (c.walls.S) {
        ctx.strokeStyle = COLOR_WALL_DARK;
        ctx.beginPath();
        ctx.moveTo(x * size, (y + 1) * size + 1);
        ctx.lineTo((x + 1) * size, (y + 1) * size + 1);
        ctx.stroke();

        ctx.strokeStyle = COLOR_WALL;
        ctx.beginPath();
        ctx.moveTo(x * size, (y + 1) * size);
        ctx.lineTo((x + 1) * size, (y + 1) * size);
        ctx.stroke();
      }

      if (c.walls.E) {
        ctx.strokeStyle = COLOR_WALL_DARK;
        ctx.beginPath();
        ctx.moveTo((x + 1) * size + 1, y * size);
        ctx.lineTo((x + 1) * size + 1, (y + 1) * size);
        ctx.stroke();

        ctx.strokeStyle = COLOR_WALL;
        ctx.beginPath();
        ctx.moveTo((x + 1) * size, y * size);
        ctx.lineTo((x + 1) * size, (y + 1) * size);
        ctx.stroke();
      }

      if (c.walls.W) {
        ctx.strokeStyle = COLOR_WALL_DARK;
        ctx.beginPath();
        ctx.moveTo(x * size + 1, y * size);
        ctx.lineTo(x * size + 1, (y + 1) * size);
        ctx.stroke();

        ctx.strokeStyle = COLOR_WALL;
        ctx.beginPath();
        ctx.moveTo(x * size, y * size);
        ctx.lineTo(x * size, (y + 1) * size);
        ctx.stroke();
      }
    }
  }

  // Exit marker
  if (maze[exitCell.y][exitCell.x].revealed || revealExit) {
    // Glow
    ctx.fillStyle = COLOR_EXIT_GLOW;
    ctx.beginPath();
    ctx.arc(
      exitCell.x * size + size / 2,
      exitCell.y * size + size / 2,
      size * 0.6, 0, Math.PI * 2
    );
    ctx.fill();

    // Diamond shape for exit
    ctx.fillStyle = COLOR_EXIT;
    ctx.beginPath();
    let ex = exitCell.x * size + size / 2;
    let ey = exitCell.y * size + size / 2;
    let r = size * 0.3;
    ctx.moveTo(ex, ey - r);
    ctx.lineTo(ex + r, ey);
    ctx.lineTo(ex, ey + r);
    ctx.lineTo(ex - r, ey);
    ctx.closePath();
    ctx.fill();
  }

  // Player
  // Glow
  ctx.fillStyle = COLOR_PLAYER_GLOW;
  ctx.beginPath();
  ctx.arc(
    player.x * size + size / 2,
    player.y * size + size / 2,
    size * 0.55, 0, Math.PI * 2
  );
  ctx.fill();

  // Player dot
  ctx.fillStyle = COLOR_PLAYER;
  ctx.beginPath();
  ctx.arc(
    player.x * size + size / 2,
    player.y * size + size / 2,
    size * 0.3, 0, Math.PI * 2
  );
  ctx.fill();
}

// ================================================
// HUD UPDATE
// ================================================
function updateHUD() {
  let stepsEl = document.getElementById("hud-steps");
  let turnsEl = document.getElementById("hud-turns");
  if (stepsEl) stepsEl.textContent = steps;
  if (turnsEl) turnsEl.textContent = turns;
}

// ================================================
// MOVEMENT
// ================================================
function movePlayer(dir) {
  if (gameWon) return;

  // Start timer on first move
  if (steps === 0) startTimer();

  let c = maze[player.y][player.x];
  let moved = false;

  if (dir === "N" && !c.walls.N) { player.y--; moved = true; }
  if (dir === "S" && !c.walls.S) { player.y++; moved = true; }
  if (dir === "E" && !c.walls.E) { player.x++; moved = true; }
  if (dir === "W" && !c.walls.W) { player.x--; moved = true; }

  if (!moved) return;

  if (lastDir && lastDir !== dir) turns++;
  lastDir = dir;

  steps++;
  saveProgress();
  updateVisibility();
  updateHUD();
  draw();
  checkExit();
}

// Keyboard controls
document.addEventListener("keydown", e => {
  let dir = null;
  if (e.key === "ArrowUp"    || e.key === "w" || e.key === "W") dir = "N";
  if (e.key === "ArrowDown"  || e.key === "s" || e.key === "S") dir = "S";
  if (e.key === "ArrowLeft"  || e.key === "a" || e.key === "A") dir = "W";
  if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") dir = "E";
  if (!dir) return;

  e.preventDefault();
  movePlayer(dir);
});

// Mobile d-pad controls
document.querySelectorAll(".dpad-btn[data-dir]").forEach(btn => {
  btn.addEventListener("click", () => {
    movePlayer(btn.getAttribute("data-dir"));
  });

  // Prevent double-tap zoom on mobile
  btn.addEventListener("touchstart", e => {
    e.preventDefault();
    movePlayer(btn.getAttribute("data-dir"));
  });
});

// ================================================
// EXIT CHECK (standalone — local leaderboard)
// ================================================
function checkExit() {
  if (player.x === exitCell.x && player.y === exitCell.y) {
    gameWon = true;
    stopTimer();

    let infoDiv = document.getElementById("info");
    infoDiv.innerHTML =
      '<div class="info-message victory">' +
      '🏆 Escaped in <strong>' + steps + '</strong> steps and ' +
      '<strong>' + turns + '</strong> turns! ' +
      '(' + formatTime(timerSeconds) + ')' +
      '</div>';

    // Save to local leaderboard
    saveToLocalLeaderboard();
    displayLocalLeaderboard();
  }
}

function formatTime(sec) {
  let m = Math.floor(sec / 60);
  let s = sec % 60;
  return m + ":" + (s < 10 ? "0" : "") + s;
}

// ================================================
// LOCAL LEADERBOARD (localStorage)
// ================================================
function saveToLocalLeaderboard() {
  let key = "labyrinth-scores";
  let scores = JSON.parse(localStorage.getItem(key) || "[]");

  scores.push({
    date: dateStr,
    steps: steps,
    turns: turns,
    time: timerSeconds
  });

  // Keep last 50 entries max
  if (scores.length > 50) scores = scores.slice(-50);

  localStorage.setItem(key, JSON.stringify(scores));
}

function displayLocalLeaderboard() {
  let key = "labyrinth-scores";
  let allScores = JSON.parse(localStorage.getItem(key) || "[]");

  // Filter to today's scores
  let todayScores = allScores.filter(s => s.date === dateStr);
  todayScores.sort((a, b) => a.steps - b.steps || a.turns - b.turns || a.time - b.time);

  let div = document.getElementById("leaderboard");
  if (todayScores.length === 0) {
    div.innerHTML = "";
    return;
  }

  let html = '<div class="leaderboard-box"><h2>Today\'s Runs</h2>';

  todayScores.forEach((s, i) => {
    let rankClass = "";
    if (i === 0) rankClass = "first";
    else if (i === 1) rankClass = "second";
    else if (i === 2) rankClass = "third";

    html +=
      '<div class="leaderboard-entry">' +
        '<span class="leaderboard-rank ' + rankClass + '">#' + (i + 1) + '</span>' +
        '<span class="leaderboard-stats">' +
          '<span>' + s.steps + '</span> steps · ' +
          '<span>' + s.turns + '</span> turns · ' +
          formatTime(s.time) +
        '</span>' +
      '</div>';
  });

  html += '</div>';
  div.innerHTML = html;
}

// ================================================
// SAVE / LOAD PROGRESS (localStorage)
// ================================================
function saveProgress() {
  localStorage.setItem("dailyMazeProgress", JSON.stringify({
    day: dateStr,
    x: player.x,
    y: player.y,
    steps: steps,
    turns: turns,
    timerSeconds: timerSeconds,
    revealed: maze.map(row => row.map(c => c.revealed))
  }));
}

function loadProgress() {
  let raw = localStorage.getItem("dailyMazeProgress");
  if (!raw) return;

  let saved = JSON.parse(raw);

  // Only load if for the same day
  if (saved.day !== dateStr) return;

  player.x = saved.x;
  player.y = saved.y;
  steps = saved.steps;
  turns = saved.turns;
  timerSeconds = saved.timerSeconds || 0;

  // Restore revealed cells
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      maze[y][x].revealed = saved.revealed[y][x];
    }
  }

  // Resume timer if they had started
  if (steps > 0) startTimer();
}

// ================================================
// REVEAL EXIT TOGGLE
// ================================================
document.getElementById("revealExit").addEventListener("change", draw);

// ================================================
// INIT
// ================================================
loadProgress();
updateHUD();
displayLocalLeaderboard();
saveProgress();
draw();