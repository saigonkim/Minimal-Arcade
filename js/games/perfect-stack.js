/* ──────────────────────────────────────────────────────────────
   The Perfect Stack — Game Engine  (rewritten)
   Fixes:
     • Double-tap bug (touchstart + click debounce)
     • Spawn position (block now starts at a wall, bounces to center)
     • BASE_SPEED increased (5 → up to 15)
     • Particle loop continues after game-over
   ────────────────────────────────────────────────────────────── */
function initPerfectStack(canvas) {
  const container = canvas.parentElement;
  const ctx = canvas.getContext('2d');
  const DPR = window.devicePixelRatio || 1;

  // ── Constants ────────────────────────────────────────────────
  const BLOCK_H   = 28;
  const BASE_SPEED = 5;        // px/frame at score 0 (was 2.2)
  const MAX_SPEED  = 15;
  const PERFECT_TOL = 4;       // px either side = perfect
  const CAMERA_LEAD = 5;       // blocks above fold before camera pans

  // ── State ────────────────────────────────────────────────────
  let W, H, groundY, startW;
  let stack = [], moving = null, particles = [];
  let score = 0, combo = 0, camY = 0, running = false, rafId, frameCount = 0;

  // ── Drop-action debounce (prevents touchstart + click double-fire) ──
  let _lastActionTime = 0;
  function onAction() {
    if (!running) return;
    const now = Date.now();
    if (now - _lastActionTime < 300) return; // debounce
    _lastActionTime = now;

    if (!moving) {
      spawnMoving();
    } else {
      drop();
    }
  }

  // ── Setup ────────────────────────────────────────────────────
  function setup() {
    running = false;
    cancelAnimationFrame(rafId);

    // Initial sizing (will be refined in draw() loop)
    const rect = container.getBoundingClientRect();
    W = rect.width  || 500;
    H = rect.height || 800;
    
    // Safety check: if parent is not yet rendered, use reasonable defaults
    if (W < 50) W = 500;
    if (H < 50) H = 800;

    startW  = Math.max(160, Math.min(W * 0.55, 260));
    groundY = H - 40;

    stack = [];
    particles = [];
    score = 0;
    combo = 0;
    camY  = 0;

    buildInitialStack();
    moving = null; // Wait for first click/tap to spawn first moving block

    running = true;
    rafId = requestAnimationFrame(loop);
  }

  function buildInitialStack() {
    for (let i = 0; i < 3; i++) {
      const colorData = makeColor(i);
      stack.push({
        x: W / 2,
        y: groundY - i * (BLOCK_H + 2),
        w: startW,
        color: colorData.base,
        darkColor: colorData.dark
      });
    }
  }

  // ── Block helpers ─────────────────────────────────────────────
  function topBlock() { return stack[stack.length - 1]; }

  function makeColor(idx) {
    const hue = (220 + idx * 18) % 360;
    const l = 55 + (idx % 4) * 6;
    return {
      base: `hsl(${hue}, 70%, ${l}%)`,
      dark: `hsl(${hue}, 70%, ${Math.max(0, l - 15)}%)`,
      hue
    };
  }

  // ── Spawn moving block ────────────────────────────────────────
  // KEY FIX: block always starts from the LEFT WALL so the first
  // legal click requires seeing the block travel over the stack.
  function spawnMoving() {
    const top   = topBlock();
    const speed = Math.min(BASE_SPEED + score * 0.14, MAX_SPEED);
    const colorData = makeColor(stack.length);
    moving = {
      x:     top.w / 2 + 2,
      w:     top.w,
      dir:   1,
      speed,
      color: colorData.base,
      darkColor: colorData.dark,
      y:     top.y - BLOCK_H - 2,
    };
  }

  // ── Drop logic ───────────────────────────────────────────────
  function drop() {
    if (!running || !moving) return;

    const top = topBlock();
    const lm = moving.x - moving.w / 2;
    const rm = moving.x + moving.w / 2;
    const lt = top.x - top.w / 2;
    const rt = top.x + top.w / 2;

    const overlapL = Math.max(lm, lt);
    const overlapR = Math.min(rm, rt);
    const overlap  = overlapR - overlapL;

    if (overlap <= 0) {
      // Missed completely — die
      running = false;
      spawnParticles(moving.x, moving.y, moving.color, 28);
      const finalScore = score;
      requestAnimationFrame(particleDrainLoop);
      setTimeout(() => {
        if (typeof showGameOver === 'function') showGameOver(finalScore, 'perfect-stack');
      }, 700);
      return;
    }

    const isPerfect = overlap >= top.w - PERFECT_TOL;
    const newX = (overlapL + overlapR) / 2;
    const newW = isPerfect ? top.w : overlap;

    // Snap effect on perfect
    if (isPerfect) combo++; else combo = 0;

    spawnParticles(newX, moving.y, moving.color, isPerfect ? 18 : 8);

    const colorData = makeColor(stack.length);
    stack.push({
      x:     isPerfect ? top.x : newX,
      y:     moving.y,
      w:     newW,
      color: moving.color,
      darkColor: moving.darkColor
    });

    score++;
    if (typeof updateHudScore === 'function') updateHudScore(score);

    // Camera pan once stack grows tall
    const topY = topBlock().y - camY;
    if (topY < H * (1 - CAMERA_LEAD / 10)) {
      camY = topBlock().y - H * 0.5;
    }

    spawnMoving();
  }

  // ── Particle system ───────────────────────────────────────────
  function spawnParticles(cx, cy, color, n) {
    for (let i = 0; i < n; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd   = 1 + Math.random() * 4;
      particles.push({
        x: cx, y: cy,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd - 2,
        life: 1, decay: 0.02 + Math.random() * 0.03,
        r: 3 + Math.random() * 4,
        color,
      });
    }
  }

  // ── Game loop ─────────────────────────────────────────────────
  function loop() {
    if (!running) return;
    update();
    draw();
    frameCount++;
    rafId = requestAnimationFrame(loop);
  }

  // Separate loop for draining particles after game over
  function particleDrainLoop() {
    if (!running) return; // SAFETY: Stop if game was stopped/exited
    updateParticles();
    draw();
    if (particles.length > 0) rafId = requestAnimationFrame(particleDrainLoop);
  }

  function update() {
    // Move the block
    if (moving) {
      moving.x += moving.dir * moving.speed;
      const hw = moving.w / 2;
      if (moving.x + hw >= W - 2 || moving.x - hw <= 2) {
        moving.dir *= -1;
      }
    }
    updateParticles();
  }

  function updateParticles() {
    particles.forEach(p => {
      p.x    += p.vx;
      p.y    += p.vy;
      p.vy   += 0.15;  // gravity
      p.life -= p.decay;
    });
    particles = particles.filter(p => p.life > 0);
    if (particles.length > 100) particles = particles.slice(-100);
  }

  // ── Draw ─────────────────────────────────────────────────────
  function draw() {
    try {
      // PERFORMANCE: Throttle dimension checking. getBoundingClientRect triggers reflow.
      // We check every 60 frames (~1s) or if dimensions aren't set.
      if (!W || frameCount % 60 === 0) {
        const rect = container.getBoundingClientRect();
        const currW = rect.width || 500;
        const currH = rect.height || 800;

        if (Math.abs(W - currW) > 1 || Math.abs(H - currH) > 1 || canvas.width === 0) {
          W = currW;
          H = currH;
          canvas.width  = W * DPR;
          canvas.height = H * DPR;
          canvas.style.width  = W + 'px';
          canvas.style.height = H + 'px';
          groundY = H - 40; 
        }
      }

      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

      ctx.clearRect(0, 0, W, H);

      // Background (Slightly lighter than pure black to confirm rendering)
      ctx.fillStyle = '#0a0a1a';
      ctx.fillRect(0, 0, W, H);

      // Grid lines (subtle blueprint style)
      ctx.strokeStyle = 'rgba(120,100,255,0.04)';
      ctx.lineWidth = 1;
      for (let y = 0; y < H; y += 40) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }

      ctx.save();
      ctx.translate(0, -camY);

      // ── Stacked blocks (CULLING & OPTIMIZATION) ─────────────────
      // Only draw blocks that are visible within the camera viewport.
      const viewTop    = camY;
      const viewBottom = camY + H;

      stack.forEach((b, i) => {
        const by = b.y - BLOCK_H;
        // Simple Frustum Culling
        if (b.y < viewTop - 100 || by > viewBottom + 100) return;

        // Draw only the top 5 blocks with full effects
        const isTopFew = i >= stack.length - 5;
        drawBlock(b, i === stack.length - 1, false, !isTopFew);
      });

      // Moving block
      if (moving) drawBlock(moving, false, true);

      // Particles (Simplified: no shadows for performance)
      particles.forEach(p => {
        ctx.globalAlpha = p.life;
        ctx.fillStyle   = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.globalAlpha = 1;
      ctx.restore();

      // Hint text
      if (score === 0 && !moving && running) {
        ctx.font = "600 16px sans-serif";
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.textAlign = 'center';
        ctx.fillText(isTouchDevice() ? 'TAP TO START' : 'SPACE TO START', W / 2, H / 2);
      } else if (score === 0 && moving && running) {
        const hint = isTouchDevice() ? 'Tap to Stack!' : 'Press Space to Stack!';
        ctx.font = "500 13px sans-serif";
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.textAlign = 'center';
        ctx.fillText(hint, W / 2, H - 24);
      }

      // Combo flash
      if (combo >= 2 && moving) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, (combo - 1) * 0.3);
        ctx.font = `bold ${22 + combo * 4}px sans-serif`;
        ctx.fillStyle = '#ffc94a';
        ctx.textAlign = 'center';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#ffc94a';
        ctx.fillText(`COMBO ×${combo}!`, W / 2, 80);
        ctx.restore();
      }
    } catch (e) {
      // Fail-safe reporting on canvas
      console.error("Perfect Stack Draw Error:", e);
      ctx.fillStyle = 'white';
      ctx.fillText("Render Error. Check Console.", 10, 20);
    }
  }

  function drawBlock(b, isTop, isMoving, simplified = false) {
    if (!b || isNaN(b.x) || isNaN(b.y) || isNaN(b.w)) return;
    const x  = b.x - b.w / 2;
    const y  = b.y - BLOCK_H;
    const r  = 5;

    // SIMPLIFIED RENDER: Used for blocks deep in the stack
    if (simplified) {
      ctx.fillStyle = b.color;
      if (b.w > r * 2) {
        // Flat rounded rect is faster than gradient + shadow
        roundRect(ctx, x, y, b.w, BLOCK_H, r);
        ctx.fill();
      } else {
        ctx.fillRect(x, y, b.w, BLOCK_H);
      }
      return;
    }

    ctx.save();

    // OPTIMIZATION: Only draw shadows for the very top blocks of the stack
    // Drawing shadows for 50+ blocks is extremely expensive.
    if (isMoving) {
      ctx.shadowBlur  = 15;
      ctx.shadowColor = b.color;
    } else if (isTop) {
      ctx.shadowBlur  = 10;
      ctx.shadowColor = 'rgba(124,106,247,0.4)';
    } else {
       ctx.shadowBlur = 0;
    }

    // Main fill with gradient
    const grad = ctx.createLinearGradient(x, y, x, y + BLOCK_H);
    grad.addColorStop(0, b.color);
    grad.addColorStop(1, b.darkColor || b.color);
    ctx.fillStyle = grad;
    roundRect(ctx, x, y, b.w, BLOCK_H, r);
    ctx.fill();

    // Highlight stripe
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = 'white';
    roundRect(ctx, x + 2, y + 2, Math.max(0, b.w - 4), 6, 3);
    ctx.fill();

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    if (w < 0) w = 0;
    if (ctx.roundRect) {
      ctx.roundRect(x, y, w, h, r);
      return;
    }
    // Polyfill
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function isTouchDevice() {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }

  // ── Input ─────────────────────────────────────────────────────
  canvas.addEventListener('click', onAction);
  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    onAction();
  }, { passive: false });

  document.addEventListener('keydown', function handler(e) {
    if (e.code === 'Space' || e.key === ' ') {
      e.preventDefault();
      onAction();
    }
    if (!document.getElementById('game-shell').classList.contains('active')) {
      document.removeEventListener('keydown', handler);
    }
  });

  // ── Public API ───────────────────────────────────────────────
  return {
    start:   setup,
    stop: () => {
      cancelAnimationFrame(rafId);
      running = false;
    },
    restart: () => {
      cancelAnimationFrame(rafId);
      setup();
    },
    resize: () => {
      // Logic inside draw() frame loop handles dynamic resizing automatically.
    }
  };
}
