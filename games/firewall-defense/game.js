console.log("Firewall Defense loaded");

// ================================================
// GRID / PATH CONFIG
// ================================================
const COLS = 14, ROWS = 8, TILE = 40;
const TOTAL_WAVES = 15;
const MAX_LEVEL = 3;

// Waypoints in tile coords; -1 and 15 are off-canvas spawn/exit markers
const PATH_WAYPOINTS = [
  { c: -1, r: 1 },
  { c: 12, r: 1 },
  { c: 12, r: 3 },
  { c: 1,  r: 3 },
  { c: 1,  r: 5 },
  { c: 13, r: 5 },
  { c: 15, r: 5 }
];

function tileCenterPx(c, r) {
  return { x: c * TILE + TILE / 2, y: r * TILE + TILE / 2 };
}

const PATH_PX = PATH_WAYPOINTS.map(function (wp) { return tileCenterPx(wp.c, wp.r); });

function buildPathTiles(waypoints) {
  const tiles = new Set();
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i], b = waypoints[i + 1];
    if (a.r === b.r) {
      const r = a.r;
      const c0 = Math.max(0, Math.min(a.c, b.c));
      const c1 = Math.min(COLS - 1, Math.max(a.c, b.c));
      for (let c = c0; c <= c1; c++) tiles.add(c + "," + r);
    } else if (a.c === b.c) {
      const c = a.c;
      if (c < 0 || c >= COLS) continue;
      const r0 = Math.max(0, Math.min(a.r, b.r));
      const r1 = Math.min(ROWS - 1, Math.max(a.r, b.r));
      for (let r = r0; r <= r1; r++) tiles.add(c + "," + r);
    }
  }
  return tiles;
}

const pathTiles = buildPathTiles(PATH_WAYPOINTS);

// ================================================
// TOWER / ENEMY DEFINITIONS
// ================================================
const TOWER_TYPES = {
  PACKET_FILTER: { label: "Packet Filter", cost: 50, damage: 8, range: 90, cooldown: 0.5, color: "#00e5ff", splash: 0 },
  DEEP_SCAN:     { label: "Deep Scan",     cost: 90, damage: 14, range: 80, cooldown: 1.0, color: "#9945ff", splash: 40 },
  KILL_SWITCH:   { label: "Kill Switch",   cost: 130, damage: 45, range: 100, cooldown: 2.0, color: "#ffcc00", splash: 0 }
};

const ENEMY_TYPES = {
  VIRUS:  { label: "Virus",  color: "#ff3860", baseHp: 20,  hpPerWave: 6,  speed: 60,  reward: 8,  coreDamage: 1, radius: 10 },
  WORM:   { label: "Worm",   color: "#ff9100", baseHp: 12,  hpPerWave: 3,  speed: 110, reward: 6,  coreDamage: 1, radius: 7 },
  TROJAN: { label: "Trojan", color: "#ff2fa0", baseHp: 60,  hpPerWave: 12, speed: 35,  reward: 18, coreDamage: 2, radius: 14 },
  BOSS:   { label: "Boss",   color: "#ff0044", baseHp: 300, hpPerWave: 40, speed: 40,  reward: 60, coreDamage: 5, radius: 20 }
};

// ================================================
// STATE
// ================================================
let currency = 0;
let coreIntegrity = 0;
let maxCoreIntegrity = 25;
let waveNumber = 0;
let destroyedCount = 0;

let towers = [];
let enemies = [];
let projectiles = [];
let spawnQueue = [];
let spawnTimer = 0;
let spawnInterval = 0.6;
let waveState = "idle"; // idle | spawning | active | cleared

let gameActive = false;
let selectedTowerType = null;
let selectedTower = null;
let hoveredTile = null;
let nextEnemyId = 1;
let gameSpeedMultiplier = 1;
let lastTime = 0;

// ================================================
// DOM REFS
// ================================================
const canvas = document.getElementById("towerCanvas");
const ctx = canvas.getContext("2d");
const startOverlay = document.getElementById("startOverlay");
const endOverlay = document.getElementById("endOverlay");
const endStatsEl = document.getElementById("endStats");
const nameEntryEl = document.getElementById("nameEntry");
const deployBtn = document.getElementById("deployBtn");
const speedBtn = document.getElementById("speedBtn");
const selectedPanel = document.getElementById("selectedPanel");

// ================================================
// UTIL
// ================================================
function escapeHtml(str) {
  return str.replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

function getTileFromEvent(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;
  return { c: Math.floor(x / TILE), r: Math.floor(y / TILE) };
}

function getTowerAt(c, r) {
  for (let i = 0; i < towers.length; i++) {
    if (towers[i].col === c && towers[i].row === r) return towers[i];
  }
  return null;
}

function isBuildable(c, r) {
  if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return false;
  if (pathTiles.has(c + "," + r)) return false;
  if (getTowerAt(c, r)) return false;
  return true;
}

// ================================================
// WAVE GENERATION
// ================================================
function generateWave(n) {
  const isBossWave = n % 5 === 0;
  const baseCount = 6 + Math.floor(n * 1.2);
  const entries = [];

  for (let i = 0; i < baseCount; i++) {
    const roll = Math.random();
    let type;
    if (n >= 4 && roll < 0.15 + n * 0.01) type = "TROJAN";
    else if (roll < 0.5) type = "WORM";
    else type = "VIRUS";
    entries.push(type);
  }

  if (isBossWave) entries.push("BOSS");
  return entries;
}

function deployWave() {
  if (waveState === "spawning" || waveState === "active") return;
  waveNumber++;
  spawnQueue = generateWave(waveNumber);
  spawnTimer = 0;
  spawnInterval = Math.max(0.25, 0.7 - waveNumber * 0.02);
  waveState = "spawning";
  deployBtn.disabled = true;
  updateWaveHUD();
  clearWaveMessage();
}

function spawnEnemy(type) {
  const cfg = ENEMY_TYPES[type];
  const start = PATH_PX[0];
  enemies.push({
    id: nextEnemyId++,
    type: type,
    x: start.x, y: start.y,
    segment: 0,
    speed: cfg.speed,
    hp: cfg.baseHp + cfg.hpPerWave * waveNumber,
    maxHp: cfg.baseHp + cfg.hpPerWave * waveNumber,
    reachedCore: false,
    counted: false
  });
}

// ================================================
// TOWER PLACEMENT / UPGRADE / SELL
// ================================================
function placeTower(type, c, r) {
  const cfg = TOWER_TYPES[type];
  if (currency < cfg.cost) return;
  currency -= cfg.cost;
  const center = tileCenterPx(c, r);
  towers.push({
    type: type, col: c, row: r, x: center.x, y: center.y,
    level: 1, damage: cfg.damage, range: cfg.range, cooldown: cfg.cooldown,
    cooldownRemaining: 0, splash: cfg.splash, totalInvested: cfg.cost, color: cfg.color
  });
  updateCurrencyHUD();
}

function upgradeTower(t) {
  if (t.level >= MAX_LEVEL) return;
  const base = TOWER_TYPES[t.type];
  const cost = Math.round(base.cost * 0.6 * t.level);
  if (currency < cost) return;
  currency -= cost;
  t.totalInvested += cost;
  t.level++;
  t.damage = Math.round(t.damage * 1.5);
  t.range = Math.round(t.range * 1.1);
  t.cooldown = Math.max(0.2, t.cooldown * 0.85);
  updateCurrencyHUD();
  renderSelectedPanel();
}

function sellTower(t) {
  const refund = Math.round(t.totalInvested * 0.6);
  currency += refund;
  towers = towers.filter(function (x) { return x !== t; });
  selectedTower = null;
  hideSelectedPanel();
  updateCurrencyHUD();
}

// ================================================
// TOWER TARGETING / FIRING
// ================================================
function findTargetInRange(t) {
  let best = null, bestSegment = -1;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (e.hp <= 0 || e.reachedCore) continue;
    const dx = e.x - t.x, dy = e.y - t.y;
    if (Math.sqrt(dx * dx + dy * dy) <= t.range && e.segment > bestSegment) {
      best = e;
      bestSegment = e.segment;
    }
  }
  return best;
}

function fireProjectile(t, target) {
  projectiles.push({ x: t.x, y: t.y, targetId: target.id, damage: t.damage, splash: t.splash, speed: 420, color: t.color });
}

function updateTowers(dt) {
  towers.forEach(function (t) {
    if (t.cooldownRemaining > 0) {
      t.cooldownRemaining -= dt;
      return;
    }
    const target = findTargetInRange(t);
    if (target) {
      fireProjectile(t, target);
      t.cooldownRemaining = t.cooldown;
    }
  });
}

function applyDamage(e, dmg) {
  e.hp -= dmg;
  if (e.hp <= 0 && !e.counted) {
    e.counted = true;
    currency += ENEMY_TYPES[e.type].reward;
    destroyedCount++;
    updateCurrencyHUD();
    updateDestroyedHUD();
  }
}

function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    const target = enemies.find(function (e) { return e.id === p.targetId && e.hp > 0 && !e.reachedCore; });
    if (!target) { projectiles.splice(i, 1); continue; }

    const dx = target.x - p.x, dy = target.y - p.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const moveDist = p.speed * dt;

    if (moveDist >= dist) {
      applyDamage(target, p.damage);
      if (p.splash > 0) {
        enemies.forEach(function (e) {
          if (e !== target && e.hp > 0 && !e.reachedCore) {
            const ddx = e.x - target.x, ddy = e.y - target.y;
            if (Math.sqrt(ddx * ddx + ddy * ddy) <= p.splash) applyDamage(e, Math.round(p.damage * 0.6));
          }
        });
      }
      projectiles.splice(i, 1);
    } else {
      p.x += (dx / dist) * moveDist;
      p.y += (dy / dist) * moveDist;
    }
  }
}

// ================================================
// ENEMY MOVEMENT
// ================================================
function updateEnemies(dt) {
  enemies.forEach(function (e) {
    if (e.reachedCore || e.hp <= 0) return;
    const target = PATH_PX[e.segment + 1];
    if (!target) { e.reachedCore = true; return; }

    const dx = target.x - e.x, dy = target.y - e.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const moveDist = e.speed * dt;

    if (moveDist >= dist) {
      e.x = target.x; e.y = target.y;
      e.segment++;
      if (e.segment >= PATH_PX.length - 1) e.reachedCore = true;
    } else {
      e.x += (dx / dist) * moveDist;
      e.y += (dy / dist) * moveDist;
    }
  });
}

function updateSpawning(dt) {
  if (waveState !== "spawning") return;
  spawnTimer -= dt;
  if (spawnTimer <= 0 && spawnQueue.length > 0) {
    spawnEnemy(spawnQueue.shift());
    spawnTimer = spawnInterval;
  }
  if (spawnQueue.length === 0) waveState = "active";
}

function cleanupEnemies() {
  enemies = enemies.filter(function (e) {
    if (e.reachedCore) {
      coreIntegrity -= ENEMY_TYPES[e.type].coreDamage;
      updateCoreHUD();
      if (coreIntegrity <= 0) {
        coreIntegrity = 0;
        updateCoreHUD();
        endGame(false);
      }
      return false;
    }
    if (e.hp <= 0) return false;
    return true;
  });
}

function checkWaveProgress() {
  if (waveState === "active" && enemies.length === 0) {
    waveState = "cleared";
    currency += 20 + waveNumber * 5;
    updateCurrencyHUD();

    if (waveNumber >= TOTAL_WAVES) {
      endGame(true);
    } else {
      deployBtn.disabled = false;
      showWaveMessage("Wave " + waveNumber + " cleared. Deploy the next wave when ready.");
    }
  }
}

// ================================================
// MAIN UPDATE
// ================================================
function update(dt) {
  if (!gameActive) return;
  updateSpawning(dt);
  updateEnemies(dt);
  updateTowers(dt);
  updateProjectiles(dt);
  cleanupEnemies();
  checkWaveProgress();
}

// ================================================
// DRAWING
// ================================================
function drawGrid() {
  ctx.strokeStyle = "rgba(0,229,255,0.06)";
  ctx.lineWidth = 1;
  for (let c = 0; c <= COLS; c++) {
    ctx.beginPath(); ctx.moveTo(c * TILE, 0); ctx.lineTo(c * TILE, ROWS * TILE); ctx.stroke();
  }
  for (let r = 0; r <= ROWS; r++) {
    ctx.beginPath(); ctx.moveTo(0, r * TILE); ctx.lineTo(COLS * TILE, r * TILE); ctx.stroke();
  }
}

function drawPath() {
  pathTiles.forEach(function (key) {
    const parts = key.split(",");
    const c = parseInt(parts[0], 10), r = parseInt(parts[1], 10);
    ctx.fillStyle = "rgba(255,56,96,0.06)";
    ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
  });

  ctx.strokeStyle = "rgba(255,56,96,0.4)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  PATH_PX.forEach(function (p, i) {
    if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
  });
  ctx.stroke();

  ctx.font = "9px 'Share Tech Mono', monospace";
  ctx.fillStyle = "#ff3860";
  ctx.textAlign = "left";
  ctx.fillText("SPAWN", 4, PATH_PX[0].y - 6);

  ctx.fillStyle = "#39ff14";
  ctx.textAlign = "right";
  ctx.fillText("CORE", canvas.width - 4, PATH_PX[PATH_PX.length - 1].y - 6);
}

function drawTowers() {
  towers.forEach(function (t) {
    const isSelected = selectedTower === t;
    const isHovered = hoveredTile && hoveredTile.c === t.col && hoveredTile.r === t.row;

    if (isSelected || isHovered) {
      ctx.strokeStyle = t.color;
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.range, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = t.color;
    ctx.globalAlpha = 0.25;
    ctx.beginPath();
    ctx.arc(t.x, t.y, TILE * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.fillStyle = t.color;
    ctx.fillRect(t.x - 10, t.y - 10, 20, 20);
    ctx.fillStyle = "#05060d";
    ctx.fillRect(t.x - 6, t.y - 6, 12, 12);

    for (let i = 0; i < t.level; i++) {
      ctx.fillStyle = t.color;
      ctx.fillRect(t.x - 9 + i * 7, t.y + 12, 5, 3);
    }
  });
}

function drawEnemies() {
  enemies.forEach(function (e) {
    const cfg = ENEMY_TYPES[e.type];
    ctx.fillStyle = cfg.color;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(e.x, e.y, cfg.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    const barW = cfg.radius * 2;
    const pct = Math.max(0, e.hp / e.maxHp);
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(e.x - barW / 2, e.y - cfg.radius - 8, barW, 4);
    ctx.fillStyle = pct > 0.5 ? "#39ff14" : (pct > 0.25 ? "#ffcc00" : "#ff3860");
    ctx.fillRect(e.x - barW / 2, e.y - cfg.radius - 8, barW * pct, 4);
  });
}

function drawProjectiles() {
  projectiles.forEach(function (p) {
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawHoverPreview() {
  if (!selectedTowerType || !hoveredTile) return;
  const c = hoveredTile.c, r = hoveredTile.r;
  if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return;

  const cfg = TOWER_TYPES[selectedTowerType];
  const valid = isBuildable(c, r) && currency >= cfg.cost;
  const center = tileCenterPx(c, r);

  ctx.strokeStyle = valid ? "#39ff14" : "#ff3860";
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.arc(center.x, center.y, cfg.range, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.fillStyle = valid ? "rgba(57,255,20,0.25)" : "rgba(255,56,96,0.25)";
  ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#0c0e1a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawGrid();
  drawPath();
  drawTowers();
  drawEnemies();
  drawProjectiles();
  drawHoverPreview();
}

// ================================================
// HUD
// ================================================
function updateCurrencyHUD() { document.getElementById("hud-currency").textContent = currency; }
function updateCoreHUD() { document.getElementById("hud-core").textContent = coreIntegrity + " / " + maxCoreIntegrity; }
function updateWaveHUD() { document.getElementById("hud-wave").textContent = waveNumber + " / " + TOTAL_WAVES; }
function updateDestroyedHUD() { document.getElementById("hud-destroyed").textContent = destroyedCount; }

function showWaveMessage(msg) { document.getElementById("waveMessage").textContent = msg; }
function clearWaveMessage() { document.getElementById("waveMessage").textContent = ""; }

// ================================================
// SELECTED TOWER PANEL
// ================================================
function renderSelectedPanel() {
  if (!selectedTower) { hideSelectedPanel(); return; }
  const t = selectedTower;
  const cfg = TOWER_TYPES[t.type];
  selectedPanel.hidden = false;

  document.getElementById("selName").textContent = cfg.label + " — Lv." + t.level;
  document.getElementById("selStats").textContent =
    "DMG " + t.damage + " · RANGE " + t.range + " · RATE " + (1 / t.cooldown).toFixed(1) + "/s";

  const upgradeBtn = document.getElementById("upgradeBtn");
  if (t.level < MAX_LEVEL) {
    const cost = Math.round(cfg.cost * 0.6 * t.level);
    upgradeBtn.style.display = "";
    upgradeBtn.disabled = currency < cost;
    upgradeBtn.textContent = "UPGRADE (" + cost + ")";
    upgradeBtn.onclick = function () { upgradeTower(t); };
  } else {
    upgradeBtn.style.display = "none";
  }

  const sellBtn = document.getElementById("sellBtn");
  sellBtn.textContent = "SELL (+" + Math.round(t.totalInvested * 0.6) + ")";
  sellBtn.onclick = function () { sellTower(t); };
}

function hideSelectedPanel() { selectedPanel.hidden = true; }

document.getElementById("closeSelBtn").addEventListener("click", function () {
  selectedTower = null;
  hideSelectedPanel();
});

// ================================================
// INPUT
// ================================================
canvas.addEventListener("mousemove", function (e) { hoveredTile = getTileFromEvent(e); });
canvas.addEventListener("mouseleave", function () { hoveredTile = null; });

canvas.addEventListener("click", function (e) {
  if (!gameActive) return;
  const tile = getTileFromEvent(e);
  const existing = getTowerAt(tile.c, tile.r);

  if (existing) {
    selectedTower = existing;
    renderSelectedPanel();
    return;
  }

  if (selectedTowerType && isBuildable(tile.c, tile.r)) {
    const cfg = TOWER_TYPES[selectedTowerType];
    if (currency >= cfg.cost) placeTower(selectedTowerType, tile.c, tile.r);
  }
});

document.querySelectorAll(".tower-btn").forEach(function (btn) {
  btn.addEventListener("click", function () {
    const type = btn.getAttribute("data-type");
    selectedTowerType = selectedTowerType === type ? null : type;
    selectedTower = null;
    hideSelectedPanel();
    document.querySelectorAll(".tower-btn").forEach(function (b) { b.classList.remove("active"); });
    if (selectedTowerType) btn.classList.add("active");
  });
});

deployBtn.addEventListener("click", deployWave);

speedBtn.addEventListener("click", function () {
  gameSpeedMultiplier = gameSpeedMultiplier === 1 ? 2 : 1;
  speedBtn.textContent = gameSpeedMultiplier + "X SPEED";
  speedBtn.classList.toggle("active", gameSpeedMultiplier === 2);
});

// ================================================
// LEADERBOARD
// ================================================
const LB_KEY = "firewall-defense-scores";

function getScores() { return JSON.parse(localStorage.getItem(LB_KEY) || "[]"); }

function compareScores(a, b) {
  return (b.wave - a.wave) || (b.destroyed - a.destroyed) || (b.core - a.core);
}

function qualifiesForLeaderboard(wave, destroyed) {
  const scores = getScores();
  if (scores.length < 10) return true;
  const sorted = scores.slice().sort(compareScores);
  const worst = sorted[sorted.length - 1];
  return compareScores({ wave: wave, destroyed: destroyed, core: 0 }, worst) < 0;
}

function sanitizeName(raw) {
  let name = (raw || "").trim().toUpperCase().slice(0, 10);
  if (!name) name = "ANON";
  return escapeHtml(name);
}

function saveScore(wave, destroyed, core, won) {
  const name = sanitizeName(document.getElementById("nameInput").value);
  let scores = getScores();
  scores.push({ name: name, wave: wave, destroyed: destroyed, core: core, won: won, date: new Date().toISOString().slice(0, 10) });
  scores.sort(compareScores);
  scores = scores.slice(0, 10);
  localStorage.setItem(LB_KEY, JSON.stringify(scores));
  nameEntryEl.hidden = true;
  displayLeaderboard();
}

function displayLeaderboard() {
  const scores = getScores();
  const div = document.getElementById("leaderboard");
  if (scores.length === 0) { div.innerHTML = ""; return; }

  let html = '<div class="leaderboard-box"><h2>Top Defenses</h2>';
  scores.forEach(function (s, i) {
    let rankClass = "";
    if (i === 0) rankClass = "first";
    else if (i === 1) rankClass = "second";
    else if (i === 2) rankClass = "third";

    html +=
      '<div class="leaderboard-entry">' +
        '<span class="leaderboard-rank ' + rankClass + '">#' + (i + 1) + '</span>' +
        '<span class="leaderboard-name">' + s.name + (s.won ? " ✓" : "") + '</span>' +
        '<span class="leaderboard-stats">' +
          "wave <span>" + s.wave + "</span> · " + s.destroyed + " destroyed" +
        '</span>' +
      '</div>';
  });
  html += "</div>";
  div.innerHTML = html;
}

// ================================================
// START / END
// ================================================
document.getElementById("startBtn").addEventListener("click", startGame);
document.getElementById("retryBtn").addEventListener("click", startGame);

function startGame() {
  gameActive = true;
  currency = 180;
  coreIntegrity = 25;
  maxCoreIntegrity = 25;
  waveNumber = 0;
  destroyedCount = 0;
  towers = [];
  enemies = [];
  projectiles = [];
  spawnQueue = [];
  waveState = "idle";
  selectedTower = null;
  selectedTowerType = null;

  startOverlay.hidden = true;
  endOverlay.hidden = true;
  nameEntryEl.hidden = true;

  document.querySelectorAll(".tower-btn").forEach(function (b) { b.classList.remove("active"); });
  hideSelectedPanel();
  deployBtn.disabled = false;
  showWaveMessage("Build your defenses, then press Deploy Wave.");

  updateCurrencyHUD();
  updateCoreHUD();
  updateWaveHUD();
  updateDestroyedHUD();

  lastTime = 0;
}

function endGame(won) {
  if (!gameActive) return;
  gameActive = false;

  document.getElementById("endTitle").textContent = won ? "NETWORK SECURED" : "BREACH DETECTED";
  endStatsEl.innerHTML =
    '<div class="stat"><span class="stat-value">' + waveNumber + '</span><span class="stat-label">Wave Reached</span></div>' +
    '<div class="stat"><span class="stat-value">' + destroyedCount + '</span><span class="stat-label">Destroyed</span></div>' +
    '<div class="stat"><span class="stat-value">' + coreIntegrity + '</span><span class="stat-label">Core Left</span></div>';

  endOverlay.hidden = false;

  if (qualifiesForLeaderboard(waveNumber, destroyedCount)) {
    nameEntryEl.hidden = false;
    document.getElementById("nameInput").focus();
    document.getElementById("submitNameBtn").onclick = function () {
      saveScore(waveNumber, destroyedCount, coreIntegrity, won);
    };
  } else {
    nameEntryEl.hidden = true;
  }

  displayLeaderboard();
}

// ================================================
// MAIN LOOP
// ================================================
function loop(ts) {
  if (!lastTime) lastTime = ts;
  const dt = Math.min((ts - lastTime) / 1000, 0.05) * gameSpeedMultiplier;
  lastTime = ts;

  update(dt);
  draw();

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
displayLeaderboard();
