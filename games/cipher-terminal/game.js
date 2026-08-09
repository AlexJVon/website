console.log("Cipher Terminal loaded");

// ================================================
// LINE POOL — flavor commands, no real exploit content
// ================================================
const LINE_POOL = [
  "sudo systemctl restart nginx",
  "ping -c 4 192.168.1.1",
  "grep -r 'ERROR' ./logs/",
  "ssh admin@10.0.0.7 -p 2222",
  "chmod 755 deploy.sh",
  "git commit -m 'fix: patch race condition'",
  "curl -X POST https://api.internal/v2/auth",
  "tar -xzvf payload.tar.gz -C /tmp",
  "netstat -tulpn | grep LISTEN",
  "docker exec -it webserver bash",
  "awk '{print $1}' access.log | sort",
  "SELECT * FROM users WHERE id=1;",
  "openssl enc -aes-256-cbc -in secret.txt",
  "traceroute firewall.internal.net",
  "kill -9 $(pgrep zombie_proc)",
  "scp report.pdf user@remote:/backups/",
  "npm run build -- --mode=production",
  "find / -name '*.log' -mtime -1",
  "echo $PATH | tr ':' '\\n'",
  "whoami && id -u"
];

// ================================================
// STATE
// ================================================
let queue = [];
let currentTarget = "";
let secondsLeft = 60;
let timerInterval = null;
let gameActive = false;

let linesCleared = 0;
let correctKeystrokes = 0;
let totalKeystrokes = 0;
let typedCharsForWPM = 0;

// ================================================
// DOM REFS
// ================================================
const typeInput = document.getElementById("typeInput");
const currentLineEl = document.getElementById("currentLine");
const nextLineEl = document.getElementById("nextLine");
const scrollbackEl = document.getElementById("scrollback");
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

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function refillQueue() {
  // Reshuffle; avoid immediately repeating the line that just finished.
  let fresh = shuffle(LINE_POOL);
  if (fresh[0] === currentTarget && fresh.length > 1) {
    [fresh[0], fresh[1]] = [fresh[1], fresh[0]];
  }
  queue = queue.concat(fresh);
}

function nextTarget() {
  if (queue.length < 2) refillQueue();
  return queue.shift();
}

// ================================================
// RENDER
// ================================================
function renderCurrentLine() {
  const target = currentTarget;
  const typed = typeInput.value;
  let html = "";

  for (let i = 0; i < target.length; i++) {
    let cls = "pending";
    if (i < typed.length) {
      cls = typed[i] === target[i] ? "correct" : "incorrect";
    }
    const ch = target[i] === " " ? "&nbsp;" : escapeHtml(target[i]);
    html += '<span class="' + cls + '">' + ch + "</span>";
  }
  currentLineEl.innerHTML = html;
}

function renderNextLine() {
  nextLineEl.textContent = queue[0] || "";
}

function pushScrollback(line) {
  const div = document.createElement("div");
  div.className = "scrollback-line";
  div.innerHTML = '<span class="check">✓</span>' + escapeHtml(line);
  scrollbackEl.appendChild(div);
  // Keep scrollback from growing forever
  while (scrollbackEl.children.length > 30) {
    scrollbackEl.removeChild(scrollbackEl.firstChild);
  }
  scrollbackEl.scrollTop = scrollbackEl.scrollHeight;
}

function updateHUD() {
  document.getElementById("hud-time").textContent = secondsLeft;
  document.getElementById("hud-lines").textContent = linesCleared;

  const elapsedSeconds = 60 - secondsLeft;
  const wpm = elapsedSeconds > 0
    ? Math.round((typedCharsForWPM / 5) / (elapsedSeconds / 60))
    : 0;
  document.getElementById("hud-wpm").textContent = wpm;

  const accuracy = totalKeystrokes > 0
    ? Math.round((correctKeystrokes / totalKeystrokes) * 100)
    : 100;
  document.getElementById("hud-accuracy").textContent = accuracy + "%";
}

// ================================================
// LINE PROGRESSION
// ================================================
function loadLine(target) {
  currentTarget = target;
  typeInput.value = "";
  typeInput.maxLength = target.length; // caps runaway typos
  renderCurrentLine();
  renderNextLine();
}

function completeLine() {
  linesCleared++;
  typedCharsForWPM += currentTarget.length;
  pushScrollback(currentTarget);
  updateHUD();
  loadLine(nextTarget());
}

// ================================================
// INPUT HANDLING
// ================================================
typeInput.addEventListener("keydown", function (e) {
  if (!gameActive) return;

  // Count printable single-character keystrokes toward accuracy.
  if (e.key.length === 1) {
    const pos = typeInput.selectionStart;
    totalKeystrokes++;
    if (currentTarget[pos] === e.key) correctKeystrokes++;
  }
});

typeInput.addEventListener("paste", function (e) {
  e.preventDefault(); // keep it an honest typing test
});

typeInput.addEventListener("input", function () {
  if (!gameActive) return;
  renderCurrentLine();
  updateHUD();

  if (typeInput.value === currentTarget) {
    completeLine();
  }
});

// ================================================
// TIMER
// ================================================
function tick() {
  secondsLeft--;
  updateHUD();
  if (secondsLeft <= 0) endGame();
}

// ================================================
// START / END
// ================================================
document.getElementById("startBtn").addEventListener("click", startGame);
document.getElementById("retryBtn").addEventListener("click", startGame);

function startGame() {
  gameActive = true;
  secondsLeft = 60;
  linesCleared = 0;
  correctKeystrokes = 0;
  totalKeystrokes = 0;
  typedCharsForWPM = 0;
  queue = [];
  scrollbackEl.innerHTML = "";

  startOverlay.hidden = true;
  endOverlay.hidden = true;
  nameEntryEl.hidden = true;

  typeInput.disabled = false;
  loadLine(nextTarget());
  updateHUD();
  typeInput.focus();

  clearInterval(timerInterval);
  timerInterval = setInterval(tick, 1000);
}

function endGame() {
  gameActive = false;
  clearInterval(timerInterval);
  typeInput.disabled = true;

  const elapsedMinutes = 1; // fixed 60s run
  const wpm = Math.round(typedCharsForWPM / 5 / elapsedMinutes);
  const accuracy = totalKeystrokes > 0
    ? Math.round((correctKeystrokes / totalKeystrokes) * 100)
    : 100;

  endStatsEl.innerHTML =
    '<div class="stat"><span class="stat-value">' + wpm + '</span><span class="stat-label">WPM</span></div>' +
    '<div class="stat"><span class="stat-value">' + accuracy + '%</span><span class="stat-label">Accuracy</span></div>' +
    '<div class="stat"><span class="stat-value">' + linesCleared + '</span><span class="stat-label">Lines</span></div>';

  endOverlay.hidden = false;

  if (wpm > 0 && qualifiesForLeaderboard(wpm)) {
    nameEntryEl.hidden = false;
    document.getElementById("nameInput").focus();
    document.getElementById("submitNameBtn").onclick = function () {
      saveScore(wpm, accuracy, linesCleared);
    };
  } else {
    nameEntryEl.hidden = true;
  }

  displayLeaderboard();
}

// ================================================
// LOCAL LEADERBOARD
// ================================================
const LB_KEY = "cipher-terminal-scores";

function getScores() {
  return JSON.parse(localStorage.getItem(LB_KEY) || "[]");
}

function qualifiesForLeaderboard(wpm) {
  const scores = getScores();
  if (scores.length < 10) return true;
  const min = Math.min.apply(null, scores.map(function (s) { return s.wpm; }));
  return wpm > min;
}

function sanitizeName(raw) {
  let name = (raw || "").trim().toUpperCase().slice(0, 10);
  if (!name) name = "ANON";
  return escapeHtml(name);
}

function saveScore(wpm, accuracy, lines) {
  const nameRaw = document.getElementById("nameInput").value;
  const name = sanitizeName(nameRaw);

  let scores = getScores();
  scores.push({ wpm: wpm, accuracy: accuracy, lines: lines, name: name, date: new Date().toISOString().slice(0, 10) });
  scores.sort(function (a, b) {
    return b.wpm - a.wpm || b.accuracy - a.accuracy || b.lines - a.lines;
  });
  scores = scores.slice(0, 10);

  localStorage.setItem(LB_KEY, JSON.stringify(scores));
  nameEntryEl.hidden = true;
  displayLeaderboard();
}

function displayLeaderboard() {
  const scores = getScores();
  const div = document.getElementById("leaderboard");

  if (scores.length === 0) {
    div.innerHTML = "";
    return;
  }

  let html = '<div class="leaderboard-box"><h2>Top Breaches</h2>';
  scores.forEach(function (s, i) {
    let rankClass = "";
    if (i === 0) rankClass = "first";
    else if (i === 1) rankClass = "second";
    else if (i === 2) rankClass = "third";

    html +=
      '<div class="leaderboard-entry">' +
        '<span class="leaderboard-rank ' + rankClass + '">#' + (i + 1) + '</span>' +
        '<span class="leaderboard-name">' + s.name + '</span>' +
        '<span class="leaderboard-stats">' +
          '<span>' + s.wpm + '</span> wpm · ' +
          '<span>' + s.accuracy + '%</span> acc · ' +
          s.lines + ' lines' +
        '</span>' +
      '</div>';
  });
  html += '</div>';
  div.innerHTML = html;
}

// ================================================
// INIT
// ================================================
displayLeaderboard();
