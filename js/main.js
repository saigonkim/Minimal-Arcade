/* ============================================================
   MAIN CONTROLLER  —  js/main.js
   Navigation, transitions, card preview renderers
   ============================================================ */

window._currentGame = null;
window._currentGameInstance = null;

/* ── Global Stats Tracking ────────────────────────────────── */
const STAT_BASE = {
  players: 128491,
  plays: 1024562
};

function initStats() {
  const playersOffset = parseInt(localStorage.getItem('arcade_stats_players_offset') || '0');
  const playsOffset = parseInt(localStorage.getItem('arcade_stats_plays_offset') || '0');
  updateStatUI(playersOffset, playsOffset);
}

function updateStatUI(pOff, lOff) {
  const elPlayers = document.getElementById('stat-players');
  const elPlays = document.getElementById('stat-plays');
  if (elPlayers) elPlayers.textContent = (STAT_BASE.players + pOff).toLocaleString();
  if (elPlays) elPlays.textContent = (STAT_BASE.plays + lOff).toLocaleString();
}

function incrementPlayStats() {
  let playsOffset = parseInt(localStorage.getItem('arcade_stats_plays_offset') || '0');
  playsOffset++;
  localStorage.setItem('arcade_stats_plays_offset', playsOffset);

  let playersOffset = parseInt(localStorage.getItem('arcade_stats_players_offset') || '0');
  if (!localStorage.getItem('arcade_user_registered')) {
    playersOffset++;
    localStorage.setItem('arcade_stats_players_offset', playersOffset);
    localStorage.setItem('arcade_user_registered', 'true');
  }
  updateStatUI(playersOffset, playsOffset);
}

/* ── Page Transition ─────────────────────────────────────── */
const overlay = document.getElementById('page-transition');

function fadeOut(cb) {
  overlay.classList.add('active');
  setTimeout(cb, 350);
}
function fadeIn() {
  requestAnimationFrame(() => {
    overlay.classList.remove('active');
  });
}

/* ── Launch a Game ───────────────────────────────────────── */
function launchGame(gameId) {
  if (window._isLaunching) return;
  window._isLaunching = true;

  // Real-time stat update
  incrementPlayStats();

  fadeOut(() => {
    // Hide landing, show game shell
    document.getElementById('landing-page').style.display = 'none';
    const shell = document.getElementById('game-shell');
    shell.classList.add('active');

    // Reset game over overlay
    document.getElementById('game-over-overlay').classList.remove('active');

    window._currentGame = gameId;

    // Update HUD title
    const titles = {
      'perfect-stack': 'The Perfect Stack',
      'neon-chain':    'Neon Chain Reaction',
      'aero-odyssey':  'Aero Odyssey',
    };
    document.getElementById('hud-game-title').textContent = titles[gameId] || gameId;

    // Update HUD best score
    const best = getHighScore(gameId);
    document.getElementById('hud-best').textContent = best > 0 ? best.toLocaleString() : '0';
    document.getElementById('hud-score').textContent = '0';

    // Stop all preview renderers
    stopAllPreviews();

    // Init the appropriate game
    const canvas = document.getElementById('game-canvas');
    const container = document.getElementById('game-canvas-container');
    resizeCanvas(canvas, container);

    let instance = null;
    if (gameId === 'perfect-stack') instance = initPerfectStack(canvas);
    if (gameId === 'neon-chain')    instance = initNeonChain(canvas);
    if (gameId === 'aero-odyssey')  instance = initAeroOdyssey(canvas);

    // New engines expose .start(); legacy engines auto-start.
    if (instance && typeof instance.start === 'function') instance.start();

    window._currentGameInstance = instance;

    // Show/Hide "FINISH" button for specific games (like Neon Chain)
    const finishBtn = document.getElementById('hud-finish');
    if (finishBtn) finishBtn.style.display = (gameId === 'neon-chain') ? 'inline-flex' : 'none';

    fadeIn();
    window._isLaunching = false;
  });
}

/* ── Exit Game ───────────────────────────────────────────── */
function exitGame() {
  fadeOut(() => {
    // Stop current game
    if (window._currentGameInstance) {
      const inst = window._currentGameInstance;
      if (typeof inst.destroy === 'function') inst.destroy();
      else if (typeof inst.stop === 'function') inst.stop();
    }
    window._currentGameInstance = null;
    window._currentGame = null;

    document.getElementById('game-shell').classList.remove('active');
    document.getElementById('game-over-overlay').classList.remove('active');
    document.getElementById('landing-page').style.display = '';

    // Restart card preview animations
    startAllPreviews();

    // Refresh score UI
    initScoreUI();

    fadeIn();
  });
}

/* ── Restart Current Game ────────────────────────────────── */
function restartCurrentGame() {
  const gameId = window._currentGame;
  if (!gameId) return;

  // 1. Hide Game Over
  document.getElementById('game-over-overlay').classList.remove('active');

  // 2. Stop Instance
  if (window._currentGameInstance) {
    const inst = window._currentGameInstance;
    if (typeof inst.destroy === 'function') inst.destroy();
    else if (typeof inst.stop === 'function') inst.stop();
  }
  window._currentGameInstance = null;

  // 3. Re-launch with slight delay for UI settle
  setTimeout(() => {
    const canvas = document.getElementById('game-canvas');
    const container = document.getElementById('game-canvas-container');
    
    // Reset HUD
    document.getElementById('hud-score').textContent = '0';
    
    resizeCanvas(canvas, container);

    let instance = null;
    if (gameId === 'perfect-stack') instance = initPerfectStack(canvas);
    if (gameId === 'neon-chain')    instance = initNeonChain(canvas);
    if (gameId === 'aero-odyssey')  instance = initAeroOdyssey(canvas);
    
    if (instance && typeof instance.start === 'function') {
      instance.start();
    }
    window._currentGameInstance = instance;
  }, 100);
}

/* ── Show Game Over ──────────────────────────────────────── */
function showGameOver(score, gameId) {
  const isNew = saveHighScore(gameId, score);
  const best  = getHighScore(gameId);

  document.getElementById('go-score').textContent = score.toLocaleString();
  document.getElementById('go-title').textContent = 'Game Over';
  document.getElementById('go-best-msg').textContent =
    isNew ? '🏆 New Record!' : `Best: ${best.toLocaleString()}`;

  document.getElementById('game-over-overlay').classList.add('active');
  document.getElementById('hud-best').textContent = best.toLocaleString();
  refreshScoreUI(gameId);
}

/* ── Update HUD Score (called by game engines) ───────────── */
function updateHudScore(score) {
  document.getElementById('hud-score').textContent = score.toLocaleString();
}
// Alias used by newer game engines
function updateHUD(score) { updateHudScore(score); }

/* ── Canvas Resize Helper ────────────────────────────────── */
function resizeCanvas(canvas, container) {
  const dpr = window.devicePixelRatio || 1;
  const W = container.clientWidth;
  const H = container.clientHeight;
  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';
  return { W, H, dpr };
}



/* ── Handle window resize while in game ─────────────────── */
window.addEventListener('resize', () => {
  if (window._currentGame && window._currentGameInstance) {
    const canvas = document.getElementById('game-canvas');
    const container = document.getElementById('game-canvas-container');
    resizeCanvas(canvas, container);
    if (typeof window._currentGameInstance.resize === 'function') {
      window._currentGameInstance.resize();
    }
  }
});

/* ============================================================
   CARD PREVIEW RENDERERS
   Tiny animations showing each game's vibe inside the card.
   ============================================================ */
const _previewRafs = {};

function stopAllPreviews() {
  Object.values(_previewRafs).forEach(id => {
    if (id) cancelAnimationFrame(id);
  });
  Object.keys(_previewRafs).forEach(k => delete _previewRafs[k]);
}

function startAllPreviews() {
  startStackPreview();
  startNeonPreview();
  startAeroPreview();
}

/* ── Preview A: Falling Blocks ─────────────────────────── */
function startStackPreview() {
  const canvas = document.getElementById('preview-stack');
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.offsetWidth, H = canvas.offsetHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const colors = ['#7c6af7', '#9381ff', '#6c63ff', '#5b52e0'];
  let t = 0;
  const stack = [
    { x: W * 0.5, w: W * 0.6, y: H - 18, color: colors[0] },
    { x: W * 0.5, w: W * 0.5, y: H - 36, color: colors[1] },
    { x: W * 0.5, w: W * 0.42, y: H - 54, color: colors[2] },
  ];
  let movingX = W * 0.1;
  let dir = 1;

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // Draw stacked blocks
    stack.forEach((b, i) => {
      const alpha = 0.4 + i * 0.2;
      ctx.fillStyle = b.color;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.roundRect(b.x - b.w / 2, b.y, b.w, 15, 4);
      ctx.fill();
    });

    // Draw moving block
    ctx.globalAlpha = 1;
    ctx.fillStyle = colors[3];
    const mw = W * 0.38;
    ctx.beginPath();
    ctx.roundRect(movingX - mw / 2, H - 80, mw, 15, 4);
    ctx.fill();

    // subtle glow
    ctx.shadowBlur = 18;
    ctx.shadowColor = '#7c6af7';
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.globalAlpha = 1;
    movingX += dir * 1.4;
    if (movingX > W - mw * 0.3 || movingX < mw * 0.3) dir *= -1;
    t++;
    _previewRafs['stack'] = requestAnimationFrame(draw);
  }
  draw();
}

/* ── Preview B: Neon Orbs ──────────────────────────────── */
function startNeonPreview() {
  const canvas = document.getElementById('preview-neon');
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.offsetWidth, H = canvas.offsetHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const colors = ['#00e5ff', '#7c6af7', '#ff4d8d', '#39ff14', '#ffc94a'];
  const orbs = Array.from({ length: 18 }, () => ({
    x: Math.random() * W,
    y: Math.random() * H,
    vx: (Math.random() - 0.5) * 0.8,
    vy: (Math.random() - 0.5) * 0.8,
    r: 3 + Math.random() * 4,
    color: colors[Math.floor(Math.random() * colors.length)],
    phase: Math.random() * Math.PI * 2,
  }));

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const now = performance.now() * 0.001;

    orbs.forEach(o => {
      o.x += o.vx; o.y += o.vy;
      if (o.x < 0 || o.x > W) o.vx *= -1;
      if (o.y < 0 || o.y > H) o.vy *= -1;

      const pulse = 1 + 0.3 * Math.sin(now * 2 + o.phase);
      ctx.save();
      ctx.shadowBlur = 14;
      ctx.shadowColor = o.color;
      ctx.fillStyle = o.color;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    _previewRafs['neon'] = requestAnimationFrame(draw);
  }
  draw();
}

/* ── Preview C: Scrolling Stars + Plane ────────────────── */
function startAeroPreview() {
  const canvas = document.getElementById('preview-aero');
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.offsetWidth, H = canvas.offsetHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const stars = Array.from({ length: 60 }, () => ({
    x: Math.random() * W,
    y: Math.random() * H,
    r: Math.random() * 1.5,
    speed: 0.3 + Math.random() * 1.2,
  }));

  let planeY = H / 2;
  let planeVy = 0;
  let t = 0;

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // Sky gradient
    const grd = ctx.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, '#060612');
    grd.addColorStop(1, '#0a1428');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);

    // Stars
    stars.forEach(s => {
      s.x -= s.speed;
      if (s.x < 0) { s.x = W; s.y = Math.random() * H; }
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    });

    // Plane gentle bob
    planeVy += Math.sin(t * 0.04) * 0.06;
    planeVy *= 0.95;
    planeY += planeVy;
    t++;

    // Draw plane (simplified SVG shape in canvas)
    const px = W * 0.35;
    const py = planeY;
    ctx.save();
    ctx.fillStyle = '#ffc94a';
    ctx.shadowBlur = 12;
    ctx.shadowColor = '#ffc94a';
    // Fuselage
    ctx.beginPath();
    ctx.ellipse(px, py, 26, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    // Nose
    ctx.beginPath();
    ctx.moveTo(px + 20, py);
    ctx.lineTo(px + 40, py);
    ctx.lineTo(px + 34, py - 4);
    ctx.closePath();
    ctx.fill();
    // Wing
    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    ctx.moveTo(px - 4, py);
    ctx.lineTo(px - 18, py - 18);
    ctx.lineTo(px + 6, py - 5);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(px - 4, py);
    ctx.lineTo(px - 18, py + 18);
    ctx.lineTo(px + 6, py + 5);
    ctx.closePath();
    ctx.fill();
    // Tail
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.moveTo(px - 20, py - 2);
    ctx.lineTo(px - 30, py - 10);
    ctx.lineTo(px - 18, py - 2);
    ctx.closePath();
    ctx.fill();
    // Engine trail
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    const trailLen = 20 + Math.sin(t * 0.15) * 8;
    const grad = ctx.createLinearGradient(px - 20, py, px - 20 - trailLen, py);
    grad.addColorStop(0, 'rgba(255,138,0,0.8)');
    grad.addColorStop(1, 'rgba(255,138,0,0)');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(px - 22, py);
    ctx.lineTo(px - 22 - trailLen, py);
    ctx.stroke();
    ctx.restore();

    _previewRafs['aero'] = requestAnimationFrame(draw);
  }
  draw();
}
/**
 * Force-finish the current game (useful for endless/timed games)
 */
function finishCurrentGame() {
  if (window._currentGameInstance && typeof window._currentGameInstance.finish === 'function') {
    window._currentGameInstance.finish();
  }
}


/* ── Boot ────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  initStats();
  startAllPreviews();
  initScoreUI();

  /* ── Card Click / Keyboard ───────────────────────────────── */
  document.querySelectorAll('.game-card').forEach(card => {
    card.addEventListener('click', (e) => {
      // Don't trigger if clicking the button (it has its own onclick)
      if (e.target.classList.contains('btn') || e.target.closest('.btn')) return;
      console.log('Launching game:', card.dataset.game);
      launchGame(card.dataset.game);
    });
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        launchGame(card.dataset.game);
      }
    });
  });
});
