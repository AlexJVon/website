console.log("flappy.js loaded — Neon Flap");

// ================================================
// CONFIG
// ================================================
const GRAVITY             = 0.5;
const FLAP_VELOCITY        = -8.5;
const PIPE_WIDTH            = 62;
const PIPE_GAP_BASE         = 168;
const PIPE_GAP_MIN          = 130;
const PIPE_SPACING          = 230;
const GROUND_HEIGHT         = 44;
const SPEED_BASE            = 2.6;
const SPEED_MAX             = 4.8;
const BIRD_X                = 90;
const BIRD_RADIUS           = 14;
const RESTART_COOLDOWN_MS   = 400;
const MAX_NAME_LENGTH       = 10;

// ================================================
// CANVAS SETUP
// ================================================
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const W = canvas.width;
const H = canvas.height;

// ================================================
// PERSISTENT STATS (localStorage)
// ================================================
const STORAGE_BEST   = "flappy-best";
const STORAGE_PLAYED = "flappy-gamesPlayed";
const STORAGE_SCORES = "flappy-scores";
const STORAGE_NAME   = "flappy-playerName";

let best = parseInt(localStorage.getItem(STORAGE_BEST) || "0", 10);
let gamesPlayed = parseInt(localStorage.getItem(STORAGE_PLAYED) || "0", 10);

document.getElementById("hud-best").textContent = best;
document.getElementById("hud-played").textContent = gamesPlayed;

// ================================================
// GAME STATE
// ================================================
let bird = null;
let pipes = [];
let score = 0;
let frame = 0;
let groundOffset = 0;
let shakeFrames = 0;
let state = "ready";      // ready | playing | over
let awaitingName = false; // true while the name-entry form is showing
let lastRestartTime = 0;

function resetGame() {
  bird = { y: H / 2, velocity: 0, rotation: 0 };
  pipes = [];
  score = 0;
  frame = 0;
  state = "ready";
  awaitingName = false;
  document.getElementById("hud-score").textContent = "0";
  document.getElementById("info").innerHTML = "";
}

resetGame();

// ================================================
// DIFFICULTY CURVE
// ================================================
function currentGap() {
  return Math.max(PIPE_GAP_MIN, PIPE_GAP_BASE - score * 2);
}

function currentSpeed() {
  return Math.min(SPEED_MAX, SPEED_BASE + score * 0.05);
}

// ================================================
// PIPES
// ================================================
function spawnPipe() {
  let gap = currentGap();
  let minY = 60;
  let maxY = H - GROUND_HEIGHT - gap - 60;
  let gapY = Math.floor(minY + Math.random() * (maxY - minY));
  pipes.push({ x: W + PIPE_WIDTH, gapY, gap, passed: false });
}

function updatePipes() {
  let speed = currentSpeed();

  let last = pipes[pipes.length - 1];
  if (!last || last.x < W - PIPE_SPACING) {
    spawnPipe();
  }

  pipes.forEach(p => { p.x -= speed; });

  pipes.forEach(p => {
    if (!p.passed && p.x + PIPE_WIDTH < BIRD_X - BIRD_RADIUS) {
      p.passed = true;
      score++;
      document.getElementById("hud-score").textContent = score;
    }
  });

  pipes = pipes.filter(p => p.x + PIPE_WIDTH > -10);
}

// ================================================
// COLLISION
// ================================================
function checkCollisions() {
  // Ground — lethal
  if (bird.y + BIRD_RADIUS >= H - GROUND_HEIGHT) {
    bird.y = H - GROUND_HEIGHT - BIRD_RADIUS;
    return true;
  }
  // Ceiling — clamp only, not lethal
  if (bird.y - BIRD_RADIUS < 0) {
    bird.y = BIRD_RADIUS;
    bird.velocity = 0;
  }
  // Pipes
  for (let p of pipes) {
    let withinX = BIRD_X + BIRD_RADIUS > p.x && BIRD_X - BIRD_RADIUS < p.x + PIPE_WIDTH;
    if (withinX) {
      let hitsTop = bird.y - BIRD_RADIUS < p.gapY;
      let hitsBottom = bird.y + BIRD_RADIUS > p.gapY + p.gap;
      if (hitsTop || hitsBottom) return true;
    }
  }
  return false;
}

// ================================================
// UPDATE
// ================================================
function update() {
  frame++;
  groundOffset = (groundOffset + currentSpeed()) % 40;

  if (state === "playing") {
    bird.velocity += GRAVITY;
    bird.y += bird.velocity;
    bird.rotation = Math.max(-0.5, Math.min(1.1, bird.velocity / 12));

    updatePipes();

    if (checkCollisions()) {
      endGame();
    }
  } else if (state === "ready") {
    bird.y = H / 2 + Math.sin(frame / 20) * 10;
  }
}

// ================================================
// DRAW
// ================================================
function draw() {
  ctx.save();

  // Little screen-shake punch on death
  if (shakeFrames > 0) {
    let strength = shakeFrames / 12;
    ctx.translate((Math.random() - 0.5) * 8 * strength, (Math.random() - 0.5) * 8 * strength);
    shakeFrames--;
  }

  // Sky gradient
  let skyGrad = ctx.createLinearGradient(0, 0, 0, H);
  skyGrad.addColorStop(0, "#05050f");
  skyGrad.addColorStop(0.5, "#150a30");
  skyGrad.addColorStop(1, "#1a0f3d");
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, W, H);

  // Glowing "sun"
  let sunGrad = ctx.createRadialGradient(W - 70, 90, 5, W - 70, 90, 90);
  sunGrad.addColorStop(0, "rgba(255,46,136,0.55)");
  sunGrad.addColorStop(1, "rgba(255,46,136,0)");
  ctx.fillStyle = sunGrad;
  ctx.beginPath();
  ctx.arc(W - 70, 90, 90, 0, Math.PI * 2);
  ctx.fill();

  // Horizon grid lines
  ctx.strokeStyle = "rgba(0,229,255,0.08)";
  ctx.lineWidth = 1;
  for (let gy = 0; gy < H - GROUND_HEIGHT; gy += 40) {
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(W, gy);
    ctx.stroke();
  }

  pipes.forEach(p => drawPipe(p));
  drawGround();
  drawBird();

  if (state !== "over") {
    ctx.font = "28px 'Press Start 2P', monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fillText(score, W / 2 + 2, 62);
    ctx.fillStyle = "#00e5ff";
    ctx.fillText(score, W / 2, 60);
  }

  if (state === "ready") {
    ctx.font = "12px 'Share Tech Mono', monospace";
    ctx.fillStyle = "#d8d8e8";
    ctx.textAlign = "center";
    ctx.fillText("TAP OR PRESS SPACE", W / 2, H / 2 + 70);
    ctx.fillText("TO START", W / 2, H / 2 + 90);
  }

  ctx.restore();
}

function drawPipe(p) {
  let grad = ctx.createLinearGradient(p.x, 0, p.x + PIPE_WIDTH, 0);
  grad.addColorStop(0, "#1f8c0a");
  grad.addColorStop(0.5, "#39ff14");
  grad.addColorStop(1, "#1f8c0a");

  ctx.shadowColor = "rgba(57,255,20,0.5)";
  ctx.shadowBlur = 10;
  ctx.fillStyle = grad;
  ctx.fillRect(p.x, 0, PIPE_WIDTH, p.gapY);
  ctx.fillRect(p.x, p.gapY + p.gap, PIPE_WIDTH, H - GROUND_HEIGHT - (p.gapY + p.gap));
  ctx.shadowBlur = 0;

  ctx.fillStyle = "#0f5c06";
  ctx.fillRect(p.x - 4, p.gapY - 16, PIPE_WIDTH + 8, 16);
  ctx.fillRect(p.x - 4, p.gapY + p.gap, PIPE_WIDTH + 8, 16);
}

function drawGround() {
  ctx.fillStyle = "#120a2e";
  ctx.fillRect(0, H - GROUND_HEIGHT, W, GROUND_HEIGHT);

  ctx.strokeStyle = "rgba(0,229,255,0.4)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, H - GROUND_HEIGHT);
  ctx.lineTo(W, H - GROUND_HEIGHT);
  ctx.stroke();

  ctx.strokeStyle = "rgba(0,229,255,0.25)";
  ctx.lineWidth = 1;
  for (let gx = -groundOffset; gx < W; gx += 40) {
    ctx.beginPath();
    ctx.moveTo(gx, H - GROUND_HEIGHT);
    ctx.lineTo(gx + 20, H);
    ctx.stroke();
  }
}

function drawBird() {
  ctx.save();
  ctx.translate(BIRD_X, bird.y);
  ctx.rotate(bird.rotation);

  ctx.fillStyle = "rgba(255,204,0,0.35)";
  ctx.beginPath();
  ctx.arc(0, 0, BIRD_RADIUS * 1.8, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ffcc00";
  ctx.beginPath();
  ctx.arc(0, 0, BIRD_RADIUS, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ff9a00";
  ctx.beginPath();
  ctx.ellipse(-3, 2, 7, 5, Math.PI / 6, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#05050f";
  ctx.beginPath();
  ctx.arc(6, -4, 2.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ff2e88";
  ctx.beginPath();
  ctx.moveTo(BIRD_RADIUS - 2, -2);
  ctx.lineTo(BIRD_RADIUS + 8, 1);
  ctx.lineTo(BIRD_RADIUS - 2, 4);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

// ================================================
// GAME FLOW
// ================================================
function flap() {
  if (awaitingName) return; // ignore taps/keys while the name form is up

  if (state === "ready") {
    startGame();
  } else if (state === "playing") {
    bird.velocity = FLAP_VELOCITY;
  } else if (state === "over") {
    let now = Date.now();
    if (now - lastRestartTime > RESTART_COOLDOWN_MS) {
      resetGame();
      startGame();
    }
  }
}

function startGame() {
  state = "playing";
  bird.velocity = FLAP_VELOCITY;
  document.getElementById("info").innerHTML = "";
}

function endGame() {
  state = "over";
  lastRestartTime = Date.now();
  shakeFrames = 12;

  gamesPlayed++;
  localStorage.setItem(STORAGE_PLAYED, gamesPlayed);
  document.getElementById("hud-played").textContent = gamesPlayed;

  let isNewBest = score > best;
  if (isNewBest) {
    best = score;
    localStorage.setItem(STORAGE_BEST, best);
    document.getElementById("hud-best").textContent = best;
  }

  if (qualifiesForLeaderboard(score)) {
    showNameEntry(isNewBest);
  } else {
    showGameOverMessage(isNewBest);
  }
}

// ================================================
// NAME ENTRY
// ================================================
function qualifiesForLeaderboard(s) {
  if (s <= 0) return false; // don't bother prompting for a zero-score run
  let scores = JSON.parse(localStorage.getItem(STORAGE_SCORES) || "[]");
  if (scores.length < 10) return true;
  let lowest = scores[scores.length - 1].score;
  return s >= lowest;
}

function showNameEntry(isNewBest) {
  awaitingName = true;
  let lastName = localStorage.getItem(STORAGE_NAME) || "";

  let infoDiv = document.getElementById("info");
  infoDiv.innerHTML =
    '<div class="info-message ' + (isNewBest ? "newbest" : "gameover") + '">' +
    (isNewBest ? "⭐ NEW BEST — " : "🏁 TOP 10 — ") +
    "SCORE " + score +
    "</div>" +
    '<form class="name-entry" id="nameForm">' +
      '<input type="text" id="nameInput" maxlength="' + MAX_NAME_LENGTH + '" ' +
      'placeholder="YOUR NAME" autocomplete="off" spellcheck="false" value="' +
      escapeHtml(lastName) + '" />' +
      '<button type="submit" class="neon-btn">Save</button>' +
    "</form>";

  let input = document.getElementById("nameInput");
  input.focus();
  input.select();

  document.getElementById("nameForm").addEventListener("submit", e => {
    e.preventDefault();
    submitName(isNewBest);
  });
}

function submitName(isNewBest) {
  let input = document.getElementById("nameInput");
  let name = (input ? input.value : "").trim().toUpperCase().slice(0, MAX_NAME_LENGTH);
  if (!name) name = "ANON";

  localStorage.setItem(STORAGE_NAME, name);
  saveScoreToLeaderboard(score, name);
  renderLeaderboard();

  awaitingName = false;
  showGameOverMessage(isNewBest);
}

function showGameOverMessage(isNewBest) {
  let infoDiv = document.getElementById("info");
  infoDiv.innerHTML =
    '<div class="info-message ' + (isNewBest ? "newbest" : "gameover") + '">' +
    (isNewBest ? "⭐ NEW BEST — " : "💥 CRASHED — ") +
    "SCORE " + score +
    "</div>";
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ================================================
// LOCAL LEADERBOARD — top 10 all-time
// ================================================
function saveScoreToLeaderboard(s, name) {
  let scores = JSON.parse(localStorage.getItem(STORAGE_SCORES) || "[]");
  scores.push({ score: s, name: name, date: new Date().toISOString().slice(0, 10) });
  scores.sort((a, b) => b.score - a.score);
  scores = scores.slice(0, 10);
  localStorage.setItem(STORAGE_SCORES, JSON.stringify(scores));
}

function renderLeaderboard() {
  let scores = JSON.parse(localStorage.getItem(STORAGE_SCORES) || "[]");
  let div = document.getElementById("leaderboard");

  if (scores.length === 0) {
    div.innerHTML = "";
    return;
  }

  let html = '<div class="leaderboard-box"><h2>Top Flights</h2>';
  scores.forEach((s, i) => {
    let rankClass = i === 0 ? "first" : i === 1 ? "second" : i === 2 ? "third" : "";
    let displayName = s.name ? escapeHtml(s.name) : "ANON";
    html +=
      '<div class="leaderboard-entry">' +
        '<span class="leaderboard-rank ' + rankClass + '">#' + (i + 1) + '</span>' +
        '<span class="leaderboard-name">' + displayName + '</span>' +
        '<span class="leaderboard-stats"><span>' + s.score + '</span> pts</span>' +
      '</div>';
  });
  html += "</div>";
  div.innerHTML = html;
}

// ================================================
// MAIN LOOP
// ================================================
function loop() {
  update();
  draw();
  requestAnimationFrame(loop);
}

// ================================================
// INPUT
// ================================================
document.addEventListener("keydown", e => {
  // Let typing in the name field behave normally (spaces, arrow keys, etc.)
  let active = document.activeElement;
  if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) {
    return;
  }

  if (e.code === "Space" || e.key === "ArrowUp" || e.key === " ") {
    e.preventDefault();
    flap();
  }
});

canvas.addEventListener("mousedown", flap);
canvas.addEventListener("touchstart", e => {
  e.preventDefault();
  flap();
}, { passive: false });

document.getElementById("playBtn").addEventListener("click", flap);

// ================================================
// INIT
// ================================================
renderLeaderboard();

if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(() => draw());
}

loop();
