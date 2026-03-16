/* ============================================================
   GAME C: AERO ODYSSEY  —  js/games/aero-odyssey.js
   Physics-based plane game with parallax background.
   Free tier (60s demo) → Paywall → Premium unlock.
   ============================================================ */

function initAeroOdyssey(canvas) {
  const container = canvas.parentElement;
  const dpr = window.devicePixelRatio || 1;
  let W, H, ctx;

  function setup() {
    W = container.clientWidth;
    H = container.clientHeight;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';
    ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
  }
  setup();

  /* ── Premium check ── */
  function checkPremium() {
    return localStorage.getItem('arcade_premium') === 'true';
  }

  /* ── Game state ── */
  const GRAVITY  = 0.22;
  const THRUST   = -0.48;
  const DRAG     = 0.98;
  const BASE_SPEED = 3;

  let running  = true;
  let paused   = false;
  let score    = 0;
  let distance = 0;
  let rafId;
  let startTime = performance.now();
  let thrustActive = false;
  let premiumUnlocked = checkPremium();

  /* ── Plane ── */
  const plane = {
    x: Math.max(80, W * 0.25), // Ensure plane isn't too squashed on left
    y: H * 0.5,
    vy: 0,
    angle: 0,
    boostCooldown: 0,
  };

  /* ── Parallax layers ── */
  const layers = [
    { items: [], speed: 0.4, color: '#0d1428', type: 'mountains' },
    { items: [], speed: 1.0, color: '#0a1f3a', type: 'clouds'    },
    { items: [], speed: 2.2, color: '#0b2040', type: 'obstacles' },
  ];

  function initLayers() {
    // Mountains (BG)
    layers[0].items = Array.from({ length: 8 }, (_, i) => ({
      x: i * (W / 4),
      h: 60 + Math.random() * 100,
      w: 120 + Math.random() * 80,
    }));
    // Cloud streaks
    layers[1].items = Array.from({ length: 12 }, () => ({
      x: Math.random() * W * 1.5,
      y: Math.random() * H * 0.6,
      w: 60 + Math.random() * 80,
      h: 8 + Math.random() * 12,
      alpha: 0.08 + Math.random() * 0.08,
    }));
    // Obstacles (rings to pass through)
    layers[2].items = [];
  }

  let obstacleTimer = 0;
  function spawnObstacle() {
    const gap = premiumUnlocked ? 130 : 100;
    const cy = H * 0.2 + Math.random() * H * 0.6;
    layers[2].items.push({
      x: W + 80,
      cy,
      gap,    // gap height
      w: 20,
      passed: false,
      color: '#7c6af7',
    });
  }

    function updateLayers(dt) {
      // Scale speed based on viewport width for fair reaction time
      // Narrow screens (like our 500px shell) get a speed reduction (~55% of base)
      const viewportFactor = W < 600 ? 0.55 : 1.0;
      const speed = (BASE_SPEED + distance * 0.0008) * viewportFactor;

      // BG mountains
      layers[0].items.forEach(m => {
        m.x -= speed * layers[0].speed * dt * 60;
        if (m.x + m.w < 0) m.x = W + m.w;
      });

      // Clouds
      layers[1].items.forEach(c => {
        c.x -= speed * layers[1].speed * dt * 60;
        if (c.x + c.w < 0) { c.x = W + c.w; c.y = Math.random() * H * 0.6; }
      });

      // Obstacles
      obstacleTimer -= dt * 1000;
      if (obstacleTimer <= 0) {
        spawnObstacle();
        // Adjust timer based on viewport factor to maintain physical distance
        const baseTimer = premiumUnlocked ? 1600 : 2000;
        obstacleTimer = W < 600 ? baseTimer : baseTimer; 
      }
    layers[2].items.forEach(obs => {
      obs.x -= speed * layers[2].speed * dt * 60;
      // Score ring passed
      if (!obs.passed && obs.x + obs.w < plane.x) {
        obs.passed = true;
        score += 10;
        if (typeof updateHudScore === 'function') updateHudScore(score);
      }
    });
    layers[2].items = layers[2].items.filter(o => o.x > -100);
  }

  /* ── Physics ── */
  function updatePlane(dt) {
    if (thrustActive) plane.vy += THRUST;
    plane.vy += GRAVITY;
    plane.vy *= DRAG;
    plane.y  += plane.vy * dt * 60;

    // Angle follows velocity
    plane.angle = Math.max(-0.45, Math.min(0.55, plane.vy * 0.06));

    // Vertical bounds
    if (plane.y < 20)       { plane.y = 20; plane.vy = 0; }
    if (plane.y > H - 20)  { triggerGameOver(); }
  }

  /* ── Collision ── */
  function checkCollisions() {
    for (const obs of layers[2].items) {
      // Check if plane is in x range of obstacle
      if (plane.x + 20 > obs.x && plane.x - 20 < obs.x + obs.w) {
        // Check if plane is outside the gap
        const topWall = obs.cy - obs.gap / 2;
        const botWall = obs.cy + obs.gap / 2;
        if (plane.y - 10 < topWall || plane.y + 10 > botWall) {
          triggerGameOver();
          return;
        }
      }
    }
  }

  /* ── Particles (thruster) ── */
  let thrustParticles = [];
  class ThrustParticle {
    constructor() {
      this.x = plane.x - 30;
      this.y = plane.y + (Math.random() - 0.5) * 10;
      this.vx = -(2 + Math.random() * 3);
      this.vy = (Math.random() - 0.5) * 1.5;
      this.life = 1.0;
      this.decay = 0.04 + Math.random() * 0.04;
      this.r = 3 + Math.random() * 3;
    }
    update() { this.x += this.vx; this.y += this.vy; this.life -= this.decay; }
    draw() {
      ctx.save();
      ctx.globalAlpha = this.life;
      const colors = premiumUnlocked ? ['#ff7043', '#ffc94a', '#ff4d8d'] : ['#ff7043', '#ffc94a'];
      ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
      ctx.shadowBlur = 8;
      ctx.shadowColor = '#ff7043';
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r * this.life, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  /* ── Game Over ── */
  function triggerGameOver() {
    if (!running) return;
    running = false;
    cancelAnimationFrame(rafId);
    setTimeout(() => {
      if (typeof showGameOver === 'function') showGameOver(score, 'aero-odyssey');
    }, 400);
  }

  /* ── Premium timer check ── */
  function checkDemoLimit() {
    if (premiumUnlocked) return;
    const elapsed = (performance.now() - startTime) / 1000;
    if (elapsed >= 60) {
      paused = true;
      if (typeof showPaywall === 'function') showPaywall();
    }
  }

  /* ── Stars (premium only) ── */
  const stars = premiumUnlocked
    ? Array.from({ length: 80 }, () => ({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.5, speed: 0.5 + Math.random() }))
    : [];

  /* ── Draw ── */
  function drawBackground() {
    // Sky gradient
    const grd = ctx.createLinearGradient(0, 0, 0, H);
    if (premiumUnlocked) {
      grd.addColorStop(0, '#000814');
      grd.addColorStop(0.6, '#001440');
      grd.addColorStop(1, '#002060');
    } else {
      grd.addColorStop(0, '#060612');
      grd.addColorStop(1, '#0a1428');
    }
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);

    // Stars (premium)
    if (premiumUnlocked) {
      stars.forEach(s => {
        s.x -= s.speed * 0.3;
        if (s.x < 0) { s.x = W; s.y = Math.random() * H; }
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // Mountains
    layers[0].items.forEach(m => {
      ctx.fillStyle = premiumUnlocked ? '#112240' : '#0d1428';
      ctx.beginPath();
      ctx.moveTo(m.x, H);
      ctx.lineTo(m.x + m.w / 2, H - m.h);
      ctx.lineTo(m.x + m.w, H);
      ctx.fill();
    });

    // Clouds
    layers[1].items.forEach(c => {
      ctx.save();
      ctx.globalAlpha = c.alpha;
      ctx.fillStyle = 'white';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(c.x, c.y, c.w, c.h, c.h / 2);
      else ctx.rect(c.x, c.y, c.w, c.h);
      ctx.fill();
      ctx.restore();
    });
  }

  function drawObstacles() {
    layers[2].items.forEach(obs => {
      const topH  = obs.cy - obs.gap / 2;
      const botY  = obs.cy + obs.gap / 2;
      const botH  = H - botY;

      ctx.save();
      ctx.fillStyle = obs.color;
      ctx.shadowBlur = 16;
      ctx.shadowColor = obs.color;

      // Top wall
      ctx.fillRect(obs.x, 0, obs.w, topH);
      // Bottom wall
      ctx.fillRect(obs.x, botY, obs.w, botH);

      // Neon edge lines
      ctx.strokeStyle = '#b1a6ff';
      ctx.lineWidth = 2;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(obs.x, topH); ctx.lineTo(obs.x + obs.w, topH);
      ctx.moveTo(obs.x, botY); ctx.lineTo(obs.x + obs.w, botY);
      ctx.stroke();
      ctx.restore();
    });
  }

  function drawPlane() {
    ctx.save();
    ctx.translate(plane.x, plane.y);
    ctx.rotate(plane.angle);

    const isPremium = premiumUnlocked;
    const bodyCol   = isPremium ? '#ffc94a' : '#c0cce0';
    const wingCol   = isPremium ? '#e6a820' : '#8a9ec0';
    const accentCol = isPremium ? '#fff0a0' : '#ddeeff';
    const glowCol   = isPremium ? '#ffc94a' : '#4488ff';

    ctx.shadowBlur  = isPremium ? 24 : 12;
    ctx.shadowColor = glowCol;

    // ── Engine nacelle (under each wing root) ──
    ctx.save();
    ctx.fillStyle = wingCol;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.ellipse(2, -7, 9, 4, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(2, 7, 9, 4, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // ── Fuselage (streamlined body) ──
    ctx.fillStyle = bodyCol;
    ctx.beginPath();
    ctx.moveTo(-28, 0);
    ctx.bezierCurveTo(-18, -9, 12, -8, 38, 0);
    ctx.bezierCurveTo(12,   8, -18,  9, -28, 0);
    ctx.closePath();
    ctx.fill();

    // ── Nose cone ──
    ctx.fillStyle = accentCol;
    ctx.beginPath();
    ctx.moveTo(38, 0);
    ctx.bezierCurveTo(46, -3, 56, -1, 58, 0);
    ctx.bezierCurveTo(56,  1, 46,  3, 38, 0);
    ctx.closePath();
    ctx.fill();

    // ── Swept wings ──
    ctx.shadowBlur = 0;
    ctx.fillStyle  = wingCol;
    ctx.globalAlpha = 0.92;
    // Upper wing
    ctx.beginPath();
    ctx.moveTo(8, -5);
    ctx.lineTo(-14, -38);
    ctx.lineTo(-10, -38);
    ctx.lineTo(16,  -5);
    ctx.closePath();
    ctx.fill();
    // Lower wing
    ctx.beginPath();
    ctx.moveTo(8, 5);
    ctx.lineTo(-14, 38);
    ctx.lineTo(-10, 38);
    ctx.lineTo(16,  5);
    ctx.closePath();
    ctx.fill();

    // Wing-tip lights
    const tLightColor = isPremium ? '#ff4d4d' : '#ff4d4d';
    ctx.globalAlpha = 0.9;
    ctx.fillStyle   = tLightColor;
    ctx.shadowBlur  = 8;
    ctx.shadowColor = tLightColor;
    ctx.beginPath();
    ctx.arc(-13, -38, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#00ff99';
    ctx.shadowColor = '#00ff99';
    ctx.beginPath();
    ctx.arc(-13, 38, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // ── Cockpit dome ──
    ctx.globalAlpha = 1;
    ctx.shadowBlur = isPremium ? 16 : 8;
    ctx.shadowColor = accentCol;
    ctx.fillStyle = accentCol;
    ctx.beginPath();
    ctx.ellipse(22, -3, 12, 6, 0.1, 0, Math.PI * 2);
    ctx.globalAlpha = 0.55;
    ctx.fill();
    // Inner highlight
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.ellipse(23, -5, 5, 2.5, 0.15, 0, Math.PI * 2);
    ctx.fill();

    // ── Tail fins ──
    ctx.globalAlpha = 0.88;
    ctx.shadowBlur = 0;
    ctx.fillStyle  = wingCol;
    // Vertical fin
    ctx.beginPath();
    ctx.moveTo(-18, -1);
    ctx.lineTo(-28, -20);
    ctx.lineTo(-22, -1);
    ctx.closePath();
    ctx.fill();
    // Horizontal stabilisers
    ctx.beginPath();
    ctx.moveTo(-20, -3);
    ctx.lineTo(-32, -13);
    ctx.lineTo(-28, -3);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-20, 3);
    ctx.lineTo(-32, 13);
    ctx.lineTo(-28, 3);
    ctx.closePath();
    ctx.fill();

    // ── Tail number (premium) ──
    if (isPremium) {
      const tailNum = localStorage.getItem('arcade_tail') || 'ARC-0000';
      ctx.globalAlpha = 0.7;
      ctx.shadowBlur  = 0;
      ctx.font = "bold 5px 'Space Grotesk', sans-serif";
      ctx.fillStyle = '#1a1000';
      ctx.textAlign = 'center';
      ctx.fillText(tailNum, 2, 3);
    }

    ctx.restore();
  }

  function drawHints() {
    // Demo timer bar (free mode)
    if (!premiumUnlocked) {
      const elapsed = Math.min((performance.now() - startTime) / 1000, 60);
      const pct = 1 - elapsed / 60;
      const barW = 140;
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(W / 2 - barW / 2, H - 18, barW, 5, 3) : ctx.rect(W / 2 - barW / 2, H - 18, barW, 5);
      ctx.fill();
      ctx.fillStyle = pct > 0.3 ? '#39ff14' : '#ff4d8d';
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(W / 2 - barW / 2, H - 18, barW * pct, 5, 3) : ctx.rect(W / 2 - barW / 2, H - 18, barW * pct, 5);
      ctx.fill();
      ctx.globalAlpha = 0.4;
      ctx.font = "11px 'Inter', sans-serif";
      ctx.fillStyle = '#8888aa';
      ctx.textAlign = 'center';
      ctx.fillText(`Demo · ${Math.ceil(60 - elapsed)}s left`, W / 2, H - 24);
      ctx.restore();
    }

    // Controls hint at start
    if (distance < 200) {
      ctx.save();
      ctx.globalAlpha = 0.4;
      ctx.font = "13px 'Inter', sans-serif";
      ctx.fillStyle = '#8888aa';
      ctx.textAlign = 'center';
      ctx.fillText('Hold SPACE / Click & Hold to fly', W / 2, 36);
      ctx.restore();
    }
  }

  /* ── Main loop ── */
  let lastT = performance.now();
  function loop(now) {
    const dt = Math.min((now - lastT) / 1000, 0.05);
    lastT = now;

    if (!paused) {
      updatePlane(dt);
      updateLayers(dt);
      checkCollisions();
      checkDemoLimit();
      distance += dt * 60;

      // Thrust particles
      if (thrustActive) {
        thrustParticles.push(new ThrustParticle());
        if (premiumUnlocked) thrustParticles.push(new ThrustParticle());
      }
      thrustParticles = thrustParticles.filter(p => { p.update(); return p.life > 0; });
    }

    // Draw
    drawBackground();
    drawObstacles();
    thrustParticles.forEach(p => p.draw());
    drawPlane();
    drawHints();

    if (running) rafId = requestAnimationFrame(loop);
  }

  initLayers();
  // Add a generous initial delay before first obstacle (e.g. 3.5s)
  obstacleTimer = 3500; 
  rafId = requestAnimationFrame(loop);

  /* ── Input ── */
  function startThrust() { thrustActive = true; }
  function stopThrust()  { thrustActive = false; }

  function onKeyDown(e) { if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); startThrust(); } }
  function onKeyUp(e)   { if (e.code === 'Space' || e.code === 'ArrowUp') stopThrust(); }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup',   onKeyUp);
  canvas.addEventListener('mousedown',  startThrust);
  canvas.addEventListener('mouseup',    stopThrust);
  canvas.addEventListener('touchstart', (e) => { e.preventDefault(); startThrust(); }, { passive: false });
  canvas.addEventListener('touchend',   stopThrust);

  /* ── Public API ── */
  const api = {
    stop() {
      running = false;
      cancelAnimationFrame(rafId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup',   onKeyUp);
    },
    pause()  { paused = true; },
    resume() {
      paused = false;
      lastT  = performance.now();
      startTime += performance.now() - startTime; // re-anchor timer
      if (running) rafId = requestAnimationFrame(loop);
    },
    resize() { setup(); initLayers(); },
    unlockPremium() {
      premiumUnlocked = true;
      paused = false;
      startTime = performance.now(); // reset timer
    },
  };
  window._aeroGame = api;
  return api;
}
