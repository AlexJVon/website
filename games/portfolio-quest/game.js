console.log("Portfolio Quest loaded");

// ================================================
// MAP DATA
// Legend: # = wall, . = floor, @ = player start
// A = About kiosk, P = Projects kiosk, C = Connect kiosk, H = Home kiosk
// Edit this grid to reshape the map — every row must stay the same length.
// ================================================
const TILE = 40;
const MAP = [
  "###############",
  "#.............#",
  "#..A.......P..#",
  "#.............#",
  "#......@......#",
  "#.............#",
  "#..C.......H..#",
  "#.............#",
  "###############"
];
const COLS = MAP[0].length;
const ROWS = MAP.length;

// ================================================
// LINKS (injected by Jekyll via index.html)
// ================================================
const LINKS = window.PORTFOLIO_LINKS || {};

// ================================================
// KIOSK DEFINITIONS
// ================================================
const KIOSKS = {
  A: {
    name: "ABOUT.EXE",
    color: "#00e5ff",
    desc: "My background, timeline, and skill tree.",
    action: function () { navigateTo(LINKS.about); }
  },
  P: {
    name: "PROJECTS.SYS",
    color: "#9945ff",
    desc: "The full project & build log.",
    action: function () { navigateTo(LINKS.projects); }
  },
  H: {
    name: "HOME.NET",
    color: "#39ff14",
    desc: "Back to the landing page.",
    action: function () { navigateTo(LINKS.home); }
  },
  C: {
    name: "CONNECT.LINK",
    color: "#ff9100",
    desc: "Social links & how to reach me.",
    action: function () { openConnectPanel(); }
  }
};

// Scan the map once and record where each kiosk lives, in pixel coords.
let kioskPositions = [];

for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    const ch = MAP[r][c];
    if (KIOSKS[ch]) {
      kioskPositions.push({
        key: ch,
        x: c * TILE + TILE / 2,
        y: r * TILE + TILE / 2,
        visited: false
      });
    }
  }
}

function isWall(col, row) {
  if (col < 0 || row < 0 || col >= COLS || row >= ROWS) return true;
  return MAP[row][col] === "#";
}

// ================================================
// PLAYER
// ================================================
const PLAYER_SIZE = 22;
const START_COL = 7, START_ROW = 4; // matches the '@' in MAP

let player = {
  x: START_COL * TILE + TILE / 2 - PLAYER_SIZE / 2,
  y: START_ROW * TILE + TILE / 2 - PLAYER_SIZE / 2,
  facing: "S"
};
const SPEED = 170; // pixels per second

// ================================================
// INPUT STATE
// ================================================
let keys = { N: false, S: false, E: false, W: false };
let panelOpen = false;

const KEY_MAP = {
  ArrowUp: "N", w: "N", W: "N",
  ArrowDown: "S", s: "S", S: "S",
  ArrowLeft: "W", a: "W", A: "W",
  ArrowRight: "E", d: "E", D: "E"
};

document.addEventListener("keydown", function (e) {
  if (panelOpen) {
    if (e.key === "Escape") closeConnectPanel();
    return;
  }

  const dir = KEY_MAP[e.key];
  if (dir) {
    keys[dir] = true;
    e.preventDefault();
  }

  // "E" here means the Interact key — separate from the "E" direction above.
  if (e.key === "e" || e.key === "E" || e.key === "Enter") {
    tryInteract();
  }
});

document.addEventListener("keyup", function (e) {
  const dir = KEY_MAP[e.key];
  if (dir) keys[dir] = false;
});

// Mobile d-pad — press and hold to move (this is continuous movement,
// unlike the Labyrinth's one-tap-per-step grid movement).
document.querySelectorAll(".dpad-btn[data-dir]").forEach(function (btn) {
  const dir = btn.getAttribute("data-dir");
  const press = function (e) { e.preventDefault(); keys[dir] = true; };
  const release = function (e) { e.preventDefault(); keys[dir] = false; };

  btn.addEventListener("touchstart", press);
  btn.addEventListener("touchend", release);
  btn.addEventListener("touchcancel", release);
  btn.addEventListener("mousedown", press);
  btn.addEventListener("mouseup", release);
  btn.addEventListener("mouseleave", release);
});

document.getElementById("mobileInteract").addEventListener("click", tryInteract);

// ================================================
// KIOSK PROXIMITY
// ================================================
const INTERACT_RANGE = 46;
let nearestKiosk = null;

function updateNearestKiosk() {
  const px = player.x + PLAYER_SIZE / 2;
  const py = player.y + PLAYER_SIZE / 2;
  let closest = null;
  let closestDist = Infinity;

  kioskPositions.forEach(function (k) {
    const dx = k.x - px;
    const dy = k.y - py;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < INTERACT_RANGE && dist < closestDist) {
      closest = k;
      closestDist = dist;
    }
  });

  nearestKiosk = closest;
  updateInfoPrompt();
}

function updateInfoPrompt() {
  const infoDiv = document.getElementById("info");
  if (!nearestKiosk) {
    infoDiv.innerHTML = "";
    return;
  }
  const kiosk = KIOSKS[nearestKiosk.key];
  infoDiv.innerHTML =
    '<div class="prompt-message"><strong>' + kiosk.name + '</strong> — ' +
    kiosk.desc + ' &nbsp; Press <kbd>E</kbd></div>';
}

function tryInteract() {
  if (panelOpen || !nearestKiosk) return;
  nearestKiosk.visited = true;
  updateVisitedHUD();
  KIOSKS[nearestKiosk.key].action();
}

// ================================================
// NAVIGATION / CONNECT PANEL
// ================================================
function navigateTo(url) {
  if (!url) return;
  // window.top means this works whether the game is opened standalone
  // OR embedded in the games.html iframe — either way it navigates the
  // whole tab, not just the iframe.
  window.top.location.href = url;
}

function openConnectPanel() {
  panelOpen = true;

  const entries = [
    { label: "GitHub", url: LINKS.github },
    { label: "LinkedIn", url: LINKS.linkedin },
    { label: "itch.io", url: LINKS.itch },
    { label: "Email", url: LINKS.email ? "mailto:" + LINKS.email : null }
  ];

  let html = "";
  entries.forEach(function (entry) {
    if (!entry.url) return;
    html += '<a href="' + entry.url + '" target="_blank" rel="noopener">' +
      entry.label + '</a>';
  });

  document.getElementById("connectLinks").innerHTML = html;
  document.getElementById("connectPanel").hidden = false;
}

function closeConnectPanel() {
  panelOpen = false;
  document.getElementById("connectPanel").hidden = true;
}

document.getElementById("closeConnect").addEventListener("click", closeConnectPanel);

// ================================================
// HUD
// ================================================
function updateVisitedHUD() {
  const visitedCount = kioskPositions.filter(function (k) { return k.visited; }).length;
  const el = document.getElementById("hud-visited");
  if (el) el.textContent = visitedCount + " / " + kioskPositions.length;
}

// ================================================
// COLLISION
// ================================================
function canMoveTo(x, y) {
  const corners = [
    [x, y],
    [x + PLAYER_SIZE, y],
    [x, y + PLAYER_SIZE],
    [x + PLAYER_SIZE, y + PLAYER_SIZE]
  ];

  for (let i = 0; i < corners.length; i++) {
    const col = Math.floor(corners[i][0] / TILE);
    const row = Math.floor(corners[i][1] / TILE);
    if (isWall(col, row)) return false;
  }
  return true;
}

// ================================================
// UPDATE / MOVE
// ================================================
function update(dt) {
  if (panelOpen) return;

  let dx = 0, dy = 0;
  if (keys.N) dy -= 1;
  if (keys.S) dy += 1;
  if (keys.W) dx -= 1;
  if (keys.E) dx += 1;

  if (dx !== 0 || dy !== 0) {
    const len = Math.sqrt(dx * dx + dy * dy);
    dx = (dx / len) * SPEED * dt;
    dy = (dy / len) * SPEED * dt;

    if (Math.abs(dx) > Math.abs(dy)) player.facing = dx > 0 ? "E" : "W";
    else if (dy !== 0) player.facing = dy > 0 ? "S" : "N";

    // Move on each axis separately so the player slides along walls
    // instead of getting stuck the instant one axis is blocked.
    const newX = player.x + dx;
    if (canMoveTo(newX, player.y)) player.x = newX;

    const newY = player.y + dy;
    if (canMoveTo(player.x, newY)) player.y = newY;
  }

  updateNearestKiosk();
}

// ================================================
// DRAW
// ================================================
const canvas = document.getElementById("questCanvas");
const ctx = canvas.getContext("2d");

const COLOR_FLOOR = "#0a0a12";
const COLOR_GRID = "rgba(0,229,255,0.06)";
const COLOR_WALL = "#1a1a2e";
const COLOR_WALL_EDGE = "#00e5ff";

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Floor + grid lines (echoes the main site's background grid)
  ctx.fillStyle = COLOR_FLOOR;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = COLOR_GRID;
  ctx.lineWidth = 1;
  for (let c = 0; c <= COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * TILE, 0);
    ctx.lineTo(c * TILE, ROWS * TILE);
    ctx.stroke();
  }
  for (let r = 0; r <= ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * TILE);
    ctx.lineTo(COLS * TILE, r * TILE);
    ctx.stroke();
  }

  // Walls
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (MAP[r][c] === "#") {
        ctx.fillStyle = COLOR_WALL;
        ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
        ctx.strokeStyle = COLOR_WALL_EDGE;
        ctx.globalAlpha = 0.4;
        ctx.strokeRect(c * TILE + 1, r * TILE + 1, TILE - 2, TILE - 2);
        ctx.globalAlpha = 1;
      }
    }
  }

  // Kiosks
  kioskPositions.forEach(function (k) {
    const info = KIOSKS[k.key];
    const inRange = nearestKiosk === k;

    if (inRange) {
      ctx.strokeStyle = info.color;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.arc(k.x, k.y, INTERACT_RANGE, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = info.color;
    ctx.globalAlpha = 0.25;
    ctx.beginPath();
    ctx.arc(k.x, k.y, TILE * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Terminal body
    ctx.fillStyle = info.color;
    ctx.fillRect(k.x - 10, k.y - 14, 20, 28);
    ctx.fillStyle = "#06060c";
    ctx.fillRect(k.x - 6, k.y - 10, 12, 14);

    // Label
    ctx.font = "10px 'Share Tech Mono', monospace";
    ctx.fillStyle = info.color;
    ctx.textAlign = "center";
    ctx.fillText(info.name, k.x, k.y - 22);

    if (k.visited) {
      ctx.fillStyle = "#39ff14";
      ctx.fillText("✓", k.x, k.y + 30);
    }
  });

  // Player
  const px = player.x + PLAYER_SIZE / 2;
  const py = player.y + PLAYER_SIZE / 2;

  ctx.fillStyle = "rgba(0,229,255,0.35)";
  ctx.beginPath();
  ctx.arc(px, py, PLAYER_SIZE * 0.9, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#00e5ff";
  ctx.beginPath();
  ctx.arc(px, py, PLAYER_SIZE / 2, 0, Math.PI * 2);
  ctx.fill();

  // Small dot showing facing direction
  const facingOffset = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[player.facing];
  ctx.fillStyle = "#06060c";
  ctx.beginPath();
  ctx.arc(px + facingOffset[0] * 6, py + facingOffset[1] * 6, 3, 0, Math.PI * 2);
  ctx.fill();
}

// ================================================
// MAIN LOOP
// ================================================
let lastTime = 0;
function loop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
  lastTime = timestamp;

  update(dt);
  draw();

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
