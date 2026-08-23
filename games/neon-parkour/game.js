console.log("Neon Parkour loaded");

// ================================================
// CANVAS / WORLD CONSTANTS
// ================================================
const canvas = document.getElementById("runnerCanvas");
const ctx = canvas.getContext("2d");
const GROUND_Y = 260;
const PLAYER_SCREEN_X = 150;
const PLAYER_SIZE = 22;

const GRAVITY = 2000;
const JUMP_VELOCITY = -700;
const DASH_DISTANCE = 140;
const DASH_DURATION = 0.16;
const DASH_COOLDOWN = 1.3;
const GRAPPLE_DETECT_RANGE = 260;
const GRAPPLE_MAX_DURATION = 3.0;
const MOMENTUM_DECAY = 900;
const GENERATE_AHEAD = 900;
const REMOVE_BEHIND = 400;

// ================================================
// DIFFICULTY CONFIG — controls generation, not physics
// ================================================
const DIFFICULTY_SETTINGS = {
  EASY:   { baseSpeed: 220, maxSpeed: 300, rampTime: 120, gapMin: 60,  gapMax: 130, grappleGapMin: 180, grappleGapMax: 220, hazardChance: 0.22, minSegment: 160, maxSegment: 260 },
  NORMAL: { baseSpeed: 260, maxSpeed: 360, rampTime: 100, gapMin: 90,  gapMax: 160, grappleGapMin: 190, grappleGapMax: 240, hazardChance: 0.35, minSegment: 130, maxSegment: 220 },
  HARD:   { baseSpeed: 300, maxSpeed: 420, rampTime: 80,  gapMin: 110, gapMax: 190, grappleGapMin: 210, grappleGapMax: 260, hazardChance: 0.48, minSegment: 100, maxSegment: 180 }
};

let difficulty = "NORMAL";

// ================================================
// STATE
// ================================================
let gameActive = false;
let elapsedTime = 0;
let segments = [];
let anchors = [];
let generatedUpTo = 0;
let forceFloorNext = false;
let nearestAnchor = null;

let player = {
  worldX: 0,
  y: GROUND_Y,
  vy: 0,
  onGround: true,
  dashing: false,
  dashTimeRemaining: 0,
  dashCooldownRemaining: 0,
  momentumBoost: 0,
  grappling: false,
  grappleAnchor: null,
  grappleLength: 0,
  grappleTheta: 0,
  grappleAngularVel: 0,
  grappleElapsed: 0
};

let lastTime = 0;

// ================================================
// DOM REFS
// ================================================
const startOverlay = document.getElementById("startOverlay");
const endOverlay = document.getElementById("endOverlay");
const endStatsEl = document.getElementById("endStats");
const nameEntryEl = document.getElementById("nameEntry");

// ================================================
// UTIL
// ================================================
function escapeHtml(str) {
  return str.replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}
function randRange(min, max) { return min + Math.random() * (max - min); }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function getScrollSpeed() {
  const cfg = DIFFICULTY_SETTINGS[difficulty];
  const t = Math.min(elapsedTime / cfg.rampTime, 1);
  return cfg.baseSpeed + (cfg.maxSpeed - cfg.baseSpeed) * t;
}

// ================================================
// TERRAIN GENERATION
// ================================================
function generateNextSegment(cfg) {
  let type;
  if (forceFloorNext) {
    type = "FLOOR";
    forceFloorNext = false;
  } else {
    const roll = Math.random();
    if (roll < 0.12) type = "GRAPPLE_GAP";
    else if (roll < 0.12 + cfg.hazardChance) type = "FLOOR_SPIKES";
    else if (roll < 0.12 + cfg.hazardChance + 0.28) type = "GAP";
    else type = "FLOOR";
  }

  if (type !== "FLOOR") forceFloorNext = true;

  if (type === "FLOOR") {
    const len = randRange(cfg.minSegment, cfg.maxSegment);
    segments.push({ type: "FLOOR", start: generatedUpTo, end: generatedUpTo + len });
    generatedUpTo += len;
  } else if (type === "FLOOR_SPIKES") {
    const len = randRange(cfg.minSegment, cfg.maxSegment);
    const spikeWidth = 34;
    const spikeStart = generatedUpTo + len / 2 - spikeWidth / 2;
    segments.push({ type: "FLOOR_SPIKES", start: generatedUpTo, end: generatedUpTo + len, spikeStart: spikeStart, spikeEnd: spikeStart + spikeWidth });
    generatedUpTo += len;
  } else if (type === "GAP") {
    const width = randRange(cfg.gapMin, cfg.gapMax);
    segments.push({ type: "GAP", start: generatedUpTo, end: generatedUpTo + width });
    generatedUpTo += width;
  } else if (type === "GRAPPLE_GAP") {
    const width = randRange(cfg.grappleGapMin, cfg.grappleGapMax);
    const anchor = { worldX: generatedUpTo + width / 2, y: GROUND_Y - 170 };
    segments.push({ type: "GRAPPLE_GAP", start: generatedUpTo, end: generatedUpTo + width, anchor: anchor });
    anchors.push(anchor);
    generatedUpTo += width;
  }
}

function generateAhead() {
  const cfg = DIFFICULTY_SETTINGS[difficulty];
  while (generatedUpTo < player.worldX + GENERATE_AHEAD) generateNextSegment(cfg);
}

function cleanupBehind() {
  const threshold = player.worldX - REMOVE_BEHIND;
  segments = segments.filter(function (s) { return s.end > threshold; });
  anchors = anchors.filter(function (a) { return a.worldX > threshold; });
}

function getSegmentAt(worldX) {
  for (let i = 0; i < segments.length; i++) {
    if (worldX >= segments[i].start && worldX < segments[i].end) return segments[i];
  }
  return null;
}

// ================================================
// GRAPPLE
// ================================================
function findNearestAnchorInRange() {
  let best = null, bestDist = Infinity;
  anchors.forEach(function (a) {
    const d = a.worldX - player.worldX;
    if (d >= -20 && d <= GRAPPLE_DETECT_RANGE && d < bestDist) {
      best = a;
      bestDist = d;
    }
  });
  return best;
}

function startGrapple(anchor) {
  const dx = player.worldX - anchor.worldX;
  const dy = player.y - anchor.y;
  const L = Math.sqrt(dx * dx + dy * dy);
  const theta0 = Math.atan2(dx, dy);

  const currentVX = getScrollSpeed() + player.momentumBoost;
  const currentVY = player.vy;
  const angularVel0 = (currentVX * Math.cos(theta0) - currentVY * Math.sin(theta0)) / L;

  player.grappling = true;
  player.grappleAnchor = anchor;
  player.grappleLength = L;
  player.grappleTheta = theta0;
  player.grappleAngularVel = angularVel0;
  player.grappleElapsed = 0;
  player.onGround = false;
}

function updateGrapple(dt) {
  const angularAccel = -(GRAVITY / player.grappleLength) * Math.sin(player.grappleTheta);
  player.grappleAngularVel += angularAccel * dt;
  player.grappleTheta += player.grappleAngularVel * dt;

  const anchor = player.grappleAnchor;
  player.worldX = anchor.worldX + player.grappleLength * Math.sin(player.grappleTheta);
  player.y = anchor.y + player.grappleLength * Math.cos(player.grappleTheta);

  player.grappleElapsed += dt;
  if (player.grappleElapsed > GRAPPLE_MAX_DURATION) releaseGrapple();
}

function releaseGrapple() {
  const theta = player.grappleTheta;
  const L = player.grappleLength;
  const w = player.grappleAngularVel;

  const tangentialVX = w * L * Math.cos(theta);
  const tangentialVY = -w * L * Math.sin(theta);

  player.grappling = false;
  player.vy = clamp(tangentialVY, -900, 900);
  player.momentumBoost = Math.max(0, tangentialVX - getScrollSpeed());
}

// ================================================
// PHYSICS / MOVEMENT
// ================================================
function updatePhysics(dt) {
  if (!player.dashing) {
    player.vy += GRAVITY * dt;
    player.y += player.vy * dt;
  }
}

function advanceWorld(dt) {
  let rate = getScrollSpeed();
  if (player.dashing) {
    rate += DASH_DISTANCE / DASH_DURATION;
  } else {
    rate += player.momentumBoost;
    player.momentumBoost = Math.max(0, player.momentumBoost - MOMENTUM_DECAY * dt);
  }
  player.worldX += rate * dt;
}

function checkCollisions() {
  if (player.grappling || player.dashing) {
    player.onGround = false;
    return;
  }

  const seg = getSegmentAt(player.worldX);
  if (!seg) return;

  if (seg.type === "GAP" || seg.type === "GRAPPLE_GAP") {
    if (player.y >= GROUND_Y - 2) { die(); return; }
    player.onGround = false;
  } else {
    if (seg.type === "FLOOR_SPIKES" && player.worldX >= seg.spikeStart && player.worldX <= seg.spikeEnd && player.y >= GROUND_Y - 2) {
      die();
      return;
    }
    if (player.y >= GROUND_Y) {
      player.y = GROUND_Y;
      player.vy = 0;
      player.onGround = true;
    } else {
      player.onGround = false;
    }
  }
}

// ================================================
// INPUT ACTIONS
// ================================================
function triggerJump() {
  if (!gameActive || player.grappling) return;
  if (player.onGround) {
    player.vy = JUMP_VELOCITY;
    player.onGround = false;
  }
}

function triggerDash() {
  if (!gameActive || player.grappling) return;
  if (!player.dashing && player.dashCooldownRemaining <= 0) {
    player.dashing = true;
    player.dashTimeRemaining = DASH_DURATION;
    player.dashCooldownRemaining = DASH_COOLDOWN;
    player.vy = 0;
  }
}

function triggerGrapple() {
  if (!gameActive) return;
  if (player.grappling) {
    releaseGrapple();
    return;
  }
  const anchor = findNearestAnchorInRange();
  if (anchor) startGrapple(anchor);
}

document.addEventListener("keydown", function (e) {
  if (e.repeat) return;
  if (e.key === " " || e.key === "ArrowUp") { e.preventDefault(); triggerJump(); }
  else if (e.key === "Shift") { triggerDash(); }
  else if (e.key === "e" || e.key === "E") { triggerGrapple(); }
});

document.getElementById("mobileJump").addEventListener("touchstart", function (e) { e.preventDefault(); triggerJump(); });
document.getElementById("mobileDash").addEventListener("touchstart", function (e) { e.preventDefault(); triggerDash(); });
document.getElementById("mobileGrapple").addEventListener("touchstart", function (e) { e.preventDefault(); triggerGrapple(); });

// ================================================
// MAIN UPDATE
// ================================================
function die() {
  if (!gameActive) return;
  endGame();
}

function update(dt) {
  if (!gameActive) return;
  elapsedTime += dt;

  if (player.grappling) {
    updateGrapple(dt);
  } else {
    updatePhysics(dt);
    advanceWorld(dt);
  }

  if (player.dashing) {
    player.dashTimeRemaining -= dt;
    if (player.dashTimeRemaining <= 0) player.dashing = false;
  }
  if (player.dashCooldownRemaining > 0) player.dashCooldownRemaining -= dt;

  generateAhead();
  cleanupBehind();
  checkCollisions();

  if (!gameActive) return; // die() may have ended the run this frame

  if (!player.grappling) nearestAnchor = findNearestAnchorInRange();
  updateHUD();
}

// ================================================
// DRAWING
// ================================================
function worldToScreenX(worldX) {
  return PLAYER_SCREEN_X + (worldX - player.worldX);
}

function drawBackground() {
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, "#0d0a1f");
  grad.addColorStop(0.6, "#1a0f2e");
  grad.addColorStop(1, "#05030f");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Sun
  const sunX = canvas.width * 0.75;
  const sunY = 110;
  const sunR = 55;
  ctx.save();
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = "#ff2f92";
  ctx.globalAlpha = 0.85;
  ctx.fillRect(sunX - sunR, sunY - sunR, sunR * 2, sunR * 2);
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#0d0a1f";
  for (let i = 0; i < 6; i++) {
    ctx.fillRect(sunX - sunR, sunY - sunR + 20 + i * 12, sunR * 2, 4);
  }
  ctx.restore();

  // Distant mountains (slow parallax)
  const mountainOffset = (player.worldX * 0.08) % 200;
  ctx.fillStyle = "rgba(153,69,255,0.25)";
  for (let i = -1; i < 5; i++) {
    const bx = i * 200 - mountainOffset;
    ctx.beginPath();
    ctx.moveTo(bx, GROUND_Y);
    ctx.lineTo(bx + 100, GROUND_Y - 70);
    ctx.lineTo(bx + 200, GROUND_Y);
    ctx.closePath();
    ctx.fill();
  }

  // Horizon grid (medium parallax)
  const gridOffset = (player.worldX * 0.4) % 40;
  ctx.strokeStyle = "rgba(0,229,255,0.12)";
  ctx.lineWidth = 1;
  for (let x = -gridOffset; x < canvas.width; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, GROUND_Y);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
}

function drawTerrain() {
  segments.forEach(function (seg) {
    const sx = worldToScreenX(seg.start);
    const ex = worldToScreenX(seg.end);
    if (ex < -20 || sx > canvas.width + 20) return;

    if (seg.type === "FLOOR" || seg.type === "FLOOR_SPIKES") {
      ctx.fillStyle = "#160f2e";
      ctx.fillRect(sx, GROUND_Y, ex - sx, canvas.height - GROUND_Y);
      ctx.strokeStyle = "#00e5ff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx, GROUND_Y);
      ctx.lineTo(ex, GROUND_Y);
      ctx.stroke();

      if (seg.type === "FLOOR_SPIKES") {
        const spx = worldToScreenX(seg.spikeStart);
        const spex = worldToScreenX(seg.spikeEnd);
        ctx.fillStyle = "#ff3860";
        const spikeCount = Math.max(1, Math.round((spex - spx) / 10));
        const spikeW = (spex - spx) / spikeCount;
        for (let i = 0; i < spikeCount; i++) {
          const bx = spx + i * spikeW;
          ctx.beginPath();
          ctx.moveTo(bx, GROUND_Y);
          ctx.lineTo(bx + spikeW / 2, GROUND_Y - 18);
          ctx.lineTo(bx + spikeW, GROUND_Y);
          ctx.closePath();
          ctx.fill();
        }
      }
    } else {
      // GAP / GRAPPLE_GAP — void with a faint glow at the edges
      const glow = ctx.createLinearGradient(sx, 0, ex, 0);
      glow.addColorStop(0, "rgba(255,56,96,0.15)");
      glow.addColorStop(0.5, "rgba(255,56,96,0.02)");
      glow.addColorStop(1, "rgba(255,56,96,0.15)");
      ctx.fillStyle = glow;
      ctx.fillRect(sx, GROUND_Y, ex - sx, canvas.height - GROUND_Y);
    }
  });
}

function drawAnchors() {
  anchors.forEach(function (a) {
    const sx = worldToScreenX(a.worldX);
    if (sx < -30 || sx > canvas.width + 30) return;

    const isNearest = nearestAnchor === a;

    if (isNearest && !player.grappling) {
      ctx.strokeStyle = "#ffcc00";
      ctx.globalAlpha = 0.6 + Math.sin(elapsedTime * 8) * 0.3;
      ctx.beginPath();
      ctx.arc(sx, a.y, 16, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = isNearest ? "#ffcc00" : "#9945ff";
    ctx.beginPath();
    ctx.arc(sx, a.y, 7, 0, Math.PI * 2);
    ctx.fill();

    // Small chain down to ground, purely decorative
    ctx.strokeStyle = "rgba(153,69,255,0.3)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sx, a.y);
    ctx.lineTo(sx, GROUND_Y);
    ctx.stroke();
  });
}

function drawRope() {
  if (!player.grappling) return;
  const anchor = player.grappleAnchor;
  const ax = worldToScreenX(anchor.worldX);
  ctx.strokeStyle = "#ffcc00";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(ax, anchor.y);
  ctx.lineTo(PLAYER_SCREEN_X, player.y);
  ctx.stroke();
}

function drawPlayer() {
  const lean = player.grappling ? clamp(player.grappleAngularVel * 8, -25, 25) : (player.dashing ? 20 : 0);

  ctx.save();
  ctx.translate(PLAYER_SCREEN_X, player.y - PLAYER_SIZE / 2);
  ctx.rotate((lean * Math.PI) / 180);

  ctx.fillStyle = "rgba(0,229,255,0.3)";
  ctx.beginPath();
  ctx.arc(0, 0, PLAYER_SIZE * 0.9, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#00e5ff";
  ctx.fillRect(-PLAYER_SIZE / 2, -PLAYER_SIZE / 2, PLAYER_SIZE, PLAYER_SIZE);
  ctx.fillStyle = "#05030f";
  ctx.fillRect(-PLAYER_SIZE / 4, -PLAYER_SIZE / 4, PLAYER_SIZE / 2, PLAYER_SIZE / 2);

  ctx.restore();

  if (player.dashing) {
    ctx.fillStyle = "rgba(153,69,255,0.4)";
    ctx.fillRect(PLAYER_SCREEN_X - 40, player.y - PLAYER_SIZE / 2, 30, PLAYER_SIZE);
  }
}

function draw() {
  drawBackground();
  drawTerrain();
  drawAnchors();
  drawRope();
  drawPlayer();
}

// ================================================
// HUD
// ================================================
function updateHUD() {
  document.getElementById("hud-distance").textContent = Math.floor(player.worldX / 10) + "m";

  const dashEl = document.getElementById("hud-dash");
  if (player.dashCooldownRemaining > 0) {
    dashEl.textContent = player.dashCooldownRemaining.toFixed(1) + "s";
    dashEl.classList.remove("ready");
  } else {
    dashEl.textContent = "READY";
    dashEl.classList.add("ready");
  }

  const grappleEl = document.getElementById("hud-grapple");
  const grappleBtn = document.getElementById("mobileGrapple");
  if (player.grappling) {
    grappleEl.textContent = "SWINGING";
    grappleEl.classList.add("ready");
    grappleBtn.classList.remove("available");
  } else if (nearestAnchor) {
    grappleEl.textContent = "READY";
    grappleEl.classList.add("ready");
    grappleBtn.classList.add("available");
  } else {
    grappleEl.textContent = "—";
    grappleEl.classList.remove("ready");
    grappleBtn.classList.remove("available");
  }
}

// ================================================
// LEADERBOARD
// ================================================
const LB_KEY = "neon-parkour-scores";

function getScores() { return JSON.parse(localStorage.getItem(LB_KEY) || "[]"); }

function qualifiesForLeaderboard(distance) {
  const scores = getScores();
  if (scores.length < 10) return true;
  const min = Math.min.apply(null, scores.map(function (s) { return s.distance; }));
  return distance > min;
}

function sanitizeName(raw) {
  let name = (raw || "").trim().toUpperCase().slice(0, 10);
  if (!name) name = "ANON";
  return escapeHtml(name);
}

function saveScore(distance) {
  const name = sanitizeName(document.getElementById("nameInput").value);
  let scores = getScores();
  scores.push({ name: name, distance: distance, difficulty: difficulty, date: new Date().toISOString().slice(0, 10) });
  scores.sort(function (a, b) { return b.distance - a.distance; });
  scores = scores.slice(0, 10);
  localStorage.setItem(LB_KEY, JSON.stringify(scores));
  nameEntryEl.hidden = true;
  displayLeaderboard();
}

function displayLeaderboard() {
  const scores = getScores();
  const div = document.getElementById("leaderboard");
  if (scores.length === 0) { div.innerHTML = ""; return; }

  let html = '<div class="leaderboard-box"><h2>Longest Runs</h2>';
  scores.forEach(function (s, i) {
    let rankClass = "";
    if (i === 0) rankClass = "first";
    else if (i === 1) rankClass = "second";
    else if (i === 2) rankClass = "third";

    html +=
      '<div class="leaderboard-entry">' +
        '<span class="leaderboard-rank ' + rankClass + '">#' + (i + 1) + '</span>' +
        '<span class="leaderboard-name">' + s.name + '</span>' +
        '<span class="leaderboard-stats"><span>' + Math.floor(s.distance / 10) + 'm</span> · ' + s.difficulty + '</span>' +
      '</div>';
  });
  html += "</div>";
  div.innerHTML = html;
}

// ================================================
// DIFFICULTY SELECTOR
// ================================================
document.querySelectorAll(".diff-btn").forEach(function (btn) {
  btn.addEventListener("click", function () {
    difficulty = btn.getAttribute("data-diff");
    document.querySelectorAll(".diff-btn").forEach(function (b) { b.classList.remove("active"); });
    btn.classList.add("active");
  });
});

// ================================================
// START / END
// ================================================
document.getElementById("startBtn").addEventListener("click", startGame);
document.getElementById("retryBtn").addEventListener("click", startGame);
document.getElementById("changeDiffBtn").addEventListener("click", function () {
  endOverlay.hidden = true;
  startOverlay.hidden = false;
});

function startGame() {
  gameActive = true;
  elapsedTime = 0;
  segments = [{ type: "FLOOR", start: -300, end: 420 }];
  anchors = [];
  generatedUpTo = 420;
  forceFloorNext = false;
  nearestAnchor = null;

  player.worldX = 0;
  player.y = GROUND_Y;
  player.vy = 0;
  player.onGround = true;
  player.dashing = false;
  player.dashTimeRemaining = 0;
  player.dashCooldownRemaining = 0;
  player.momentumBoost = 0;
  player.grappling = false;

  startOverlay.hidden = true;
  endOverlay.hidden = true;
  nameEntryEl.hidden = true;

  document.getElementById("hud-difficulty").textContent = difficulty;
  updateHUD();

  lastTime = 0;
}

function endGame() {
  gameActive = false;
  const distance = Math.floor(player.worldX / 10);

  endStatsEl.innerHTML =
    '<div class="stat"><span class="stat-value">' + distance + 'm</span><span class="stat-label">Distance</span></div>' +
    '<div class="stat"><span class="stat-value">' + difficulty + '</span><span class="stat-label">Difficulty</span></div>';

  endOverlay.hidden = false;

  if (qualifiesForLeaderboard(distance) && distance > 0) {
    nameEntryEl.hidden = false;
    document.getElementById("nameInput").focus();
    document.getElementById("submitNameBtn").onclick = function () { saveScore(distance); };
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
  const dt = Math.min((ts - lastTime) / 1000, 0.05);
  lastTime = ts;

  update(dt);
  draw();

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
displayLeaderboard();
