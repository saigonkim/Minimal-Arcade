/* ──────────────────────────────────────────────────────────────
   Neon Chain Reaction — Game Engine
   Gameplay: 60-second time attack. Click anywhere to detonate.
   Chain reaction spreads to nearby orbs.  Combo builds when
   you click again before the previous chain fully settles.
   Orbs continuously respawn so the field is always lively.
   ────────────────────────────────────────────────────────────── */
function initNeonChain(canvas) {
  const container = canvas.parentElement;
  const ctx       = canvas.getContext('2d');
  const DPR       = window.devicePixelRatio || 1;

  // ── Constants ────────────────────────────────────────────────
  const MAX_ORBS     = 55;
  const MIN_R        = 7;
  const MAX_R        = 20;
  const CHAIN_R_MULT = 3.0;   // explosion radius = orb.r × CHAIN_R_MULT
  const BLAST_CLICK  = 72;    // manual click blast radius (px)
  const GAME_TIME    = 60;    // seconds
  const COMBO_WINDOW = 2.0;   // seconds before combo resets
  const COLORS       = [
    '#ff4d8d','#ff7c4d','#ffc94a',
    '#39ff14','#00e5ff','#7c6af7','#ff00ff',
  ];

  // ── State ────────────────────────────────────────────────────
  let orbs       = [];
  let shockwaves = [];   // visual rings on click
  let score      = 0;
  let combo      = 1;
  let comboTimer = 0;
  let timeLeft   = GAME_TIME;
  let running    = false;
  let paused     = false;
  let rafId, lastTimestamp;
  let W, H;
  let pendingExplosions = []; // queue to process chain links with delay

  // ── Setup ────────────────────────────────────────────────────
  function setup() {
    const rect = container.getBoundingClientRect();
    W = rect.width  || container.clientWidth || window.innerWidth;
    H = rect.height || container.clientHeight || (window.innerHeight - 100);

    canvas.width  = W * DPR;
    canvas.height = H * DPR;
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';
    // Reset transform (avoid cumulative scale on restart)
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    orbs            = [];
    shockwaves      = [];
    pendingExplosions = [];
    score           = 0;
    combo           = 1;
    comboTimer      = 0;
    timeLeft        = GAME_TIME;

    for (let i = 0; i < MAX_ORBS; i++) orbs.push(newOrb(false));

    running  = true;
    paused   = false;
    lastTimestamp = performance.now();
    rafId    = requestAnimationFrame(loop);
  }

  // ── Orb factory ──────────────────────────────────────────────
  function newOrb(fromEdge) {
    const r = MIN_R + Math.random() * (MAX_R - MIN_R);
    let x, y;
    if (fromEdge) {
      const side = Math.floor(Math.random() * 4);
      if (side === 0) { x = Math.random() * W; y = -r; }
      else if (side === 1) { x = W + r; y = Math.random() * H; }
      else if (side === 2) { x = Math.random() * W; y = H + r; }
      else { x = -r; y = Math.random() * H; }
    } else {
      x = r + Math.random() * (W - r * 2);
      y = r + Math.random() * (H - r * 2);
    }
    const speed = 0.3 + Math.random() * 0.8;
    const angle = Math.random() * Math.PI * 2;
    return {
      x, y, r,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      alive: true,
      exploding: false,
      explodeR: 0,
      explodeMax: r * CHAIN_R_MULT,
      life: 1,      // alpha
      particles: [],
    };
  }

  // ── Explosion trigger ────────────────────────────────────────
  function triggerOrb(orb, depth) {
    if (!orb.alive || orb.exploding) return;
    orb.alive    = false;
    orb.exploding = true;
    orb.explodeR  = 0;
    orb.life      = 1;

    // Score = 1 × combo
    score += combo;
    if (typeof updateHUD === 'function') updateHUD(score);

    // Queue chain to neighbours after short delay
    const delay = 80 + depth * 20;
    const ox = orb.x, oy = orb.y;
    const chainR = orb.explodeMax;
    setTimeout(() => {
      orbs.forEach(o => {
        if (!o.alive || o.exploding) return;
        if (Math.hypot(o.x - ox, o.y - oy) < chainR + o.r) {
          triggerOrb(o, depth + 1);
        }
      });
    }, delay);
  }

  // ── Click / tap handler ───────────────────────────────────────
  function handleClick(cx, cy) {
    if (!running || paused) return;

    // Combo logic
    if (comboTimer > 0) {
      combo = Math.min(combo + 1, 12);
    } else {
      combo = 1;
    }
    comboTimer = COMBO_WINDOW;

    // Shockwave visual
    shockwaves.push({ x: cx, y: cy, r: 0, max: BLAST_CLICK * 1.6, life: 1 });

    // Explode any orb within click radius
    let hit = false;
    orbs.forEach(o => {
      if (!o.alive || o.exploding) return;
      if (Math.hypot(o.x - cx, o.y - cy) < BLAST_CLICK + o.r) {
        triggerOrb(o, 0);
        hit = true;
      }
    });
  }

  // ── Game loop ─────────────────────────────────────────────────
  function loop(now) {
    const dt = Math.min((now - lastTimestamp) / 1000, 0.05);
    lastTimestamp = now;

    if (!paused && running) {
      timeLeft -= dt;

      if (comboTimer > 0) {
        comboTimer -= dt;
        if (comboTimer <= 0) combo = 1;
      }

      if (timeLeft <= 0) {
        timeLeft = 0;
        finish();
        return;
      }

      // Update orbs
      orbs.forEach(o => {
        if (!o.alive && !o.exploding) return;
        if (o.exploding) {
          o.explodeR += 3.5;
          o.life = 1 - o.explodeR / o.explodeMax;
          if (o.explodeR >= o.explodeMax) {
            o.exploding = false;
          }
        } else {
          o.x += o.vx;
          o.y += o.vy;
          // Bounce off walls
          if (o.x - o.r < 0) { o.x = o.r; o.vx *= -1; }
          if (o.x + o.r > W) { o.x = W - o.r; o.vx *= -1; }
          if (o.y - o.r < 0) { o.y = o.r; o.vy *= -1; }
          if (o.y + o.r > H) { o.y = H - o.r; o.vy *= -1; }
        }
      });

      // Remove dead orbs, replenish
      const dead    = orbs.filter(o => !o.alive && !o.exploding);
      orbs          = orbs.filter(o => o.alive || o.exploding);
      const needed  = MAX_ORBS - orbs.length;
      for (let i = 0; i < Math.min(needed, dead.length, 3); i++) {
        orbs.push(newOrb(true));
      }

      // Update shockwaves
      shockwaves.forEach(s => {
        s.r    += 8;
        s.life -= 0.05;
      });
      shockwaves = shockwaves.filter(s => s.life > 0);
    }

    draw(now);
    if (running) rafId = requestAnimationFrame(loop);
  }

  // ── Draw ─────────────────────────────────────────────────────
  function draw(now) {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#08080e';
    ctx.fillRect(0, 0, W, H);

    // Draw shockwaves
    shockwaves.forEach(s => {
      ctx.save();
      ctx.globalAlpha  = s.life * 0.5;
      ctx.strokeStyle  = 'rgba(124,106,247,0.8)';
      ctx.lineWidth    = 2;
      ctx.shadowBlur   = 20;
      ctx.shadowColor  = '#7c6af7';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    });

    // Draw orbs
    orbs.forEach(o => {
      ctx.save();
      if (o.exploding) {
        // Exploding ring
        ctx.globalAlpha = Math.max(0, o.life) * 0.9;
        ctx.strokeStyle = o.color;
        ctx.lineWidth   = 3;
        ctx.shadowBlur  = 30;
        ctx.shadowColor = o.color;
        ctx.beginPath();
        ctx.arc(o.x, o.y, o.explodeR, 0, Math.PI * 2);
        ctx.stroke();
        // Inner fill fading
        ctx.globalAlpha = Math.max(0, o.life) * 0.3;
        ctx.fillStyle   = o.color;
        ctx.fill();
      } else if (o.alive) {
        // Glowing orb
        const pulseScale = 1 + 0.08 * Math.sin(now / 400 + o.x);
        ctx.globalAlpha = 0.92;
        ctx.shadowBlur  = 18;
        ctx.shadowColor = o.color;
        ctx.fillStyle   = o.color;
        ctx.beginPath();
        ctx.arc(o.x, o.y, o.r * pulseScale, 0, Math.PI * 2);
        ctx.fill();

        // Inner highlight
        ctx.globalAlpha = 0.35;
        ctx.fillStyle   = 'white';
        ctx.beginPath();
        ctx.arc(o.x - o.r * 0.3, o.y - o.r * 0.3, o.r * 0.35, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    });

    // HUD overlay: time + combo
    const timeBarW = (timeLeft / GAME_TIME) * W;
    const urgency  = timeLeft < 10;
    ctx.fillStyle  = urgency ? 'rgba(255,77,77,0.6)' : 'rgba(124,106,247,0.5)';
    ctx.fillRect(0, H - 4, timeBarW, 4);

    // Combo badge
    if (combo >= 2) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, comboTimer / 0.6);
      const label = `×${combo} COMBO`;
      ctx.font = `700 ${14 + combo * 2}px 'Space Grotesk', sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffc94a';
      ctx.shadowBlur = 16;
      ctx.shadowColor = '#ffc94a';
      ctx.fillText(label, W / 2, 48);
      ctx.restore();
    }

    // Timer text (when urgent)
    if (timeLeft <= 10) {
      ctx.save();
      ctx.font = `700 22px 'Space Grotesk', sans-serif`;
      ctx.textAlign = 'right';
      ctx.fillStyle = '#ff4d4d';
      ctx.shadowBlur = 12;
      ctx.shadowColor = '#ff4d4d';
      ctx.fillText(Math.ceil(timeLeft) + 's', W - 16, 44);
      ctx.restore();
    }

    // Click hint
    if (score === 0 && timeLeft > 55) {
      ctx.save();
      ctx.font = '500 13px sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.textAlign = 'center';
      ctx.fillText('Click anywhere to ignite a chain reaction!', W / 2, H / 2);
      ctx.restore();
    }
  }

  // ── Finish ───────────────────────────────────────────────────
  function finish() {
    running = false;
    cancelAnimationFrame(rafId);
    draw(performance.now());
    if (typeof showGameOver === 'function') showGameOver(score, 'neon-chain');
  }

  // ── Input binding ─────────────────────────────────────────────
  function getXY(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  canvas.addEventListener('click', e => {
    const {x, y} = getXY(e);
    handleClick(x, y);
  });

  let _lastTouch = 0;
  canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    const now = Date.now();
    if (now - _lastTouch < 300) return;
    _lastTouch = now;
    const t = e.touches[0];
    const {x, y} = getXY(t);
    handleClick(x, y);
  }, { passive: false });

  // ── Public API ───────────────────────────────────────────────
  return {
    start:   setup,
    stop: () => { cancelAnimationFrame(rafId); running = false; },
    restart: () => { cancelAnimationFrame(rafId); setup(); },
    resize: () => { setup(); },
    finish: finish
  };
}
