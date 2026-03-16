/* ──────────────────────────────────────────────────────────────
   paywall.js — Premium gate + PayPal mock checkout (3 states)

   "Own This Plane" Ownership Model:
     When a user "purchases" Aero Odyssey Pro they receive:
       • A unique aircraft tail number (ARC-XXXXK) stored in
         localStorage, visible on the fuselage while flying.
       • One of 3 aircraft skins: Gold Eagle, Stealth Black,
         or Neon Viper — chosen randomly and stored.
       • Score records linked to their specific aircraft.
     This gives players identity and persistence across sessions.
     Future multiplayer will show other players' tail numbers.
   ────────────────────────────────────────────────────────────── */

// ── Aircraft data ──────────────────────────────────────────────
const AIRCRAFT_SKINS = [
  { name: 'The Golden Eagle',  skin: 'Gold Mk.II · Boost + Shield' },
  { name: 'Stealth Phantom',   skin: 'Stealth · EMP + Speed Burst' },
  { name: 'Neon Viper',        skin: 'Neon · Chain Fire + Shield'  },
];

function generateTailNumber() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits  = '0123456789';
  const rand    = (arr) => arr[Math.floor(Math.random() * arr.length)];
  return 'ARC-' +
    rand(digits) + rand(digits) + rand(digits) + rand(digits) +
    rand(letters);
}

// ── State checks ───────────────────────────────────────────────
function isPremium() {
  return localStorage.getItem('arcade_premium') === 'true';
}

function getAircraft() {
  try { return JSON.parse(localStorage.getItem('arcade_aircraft')); }
  catch { return null; }
}

// ── Show / hide paywall modal ─────────────────────────────────
function showPaywall() {
  const modal = document.getElementById('paywall-modal');
  if (!modal) return;
  // Always reset to checkout state on open
  setState('checkout');
  modal.classList.add('active');
}

function closePaywall() {
  const modal = document.getElementById('paywall-modal');
  if (modal) modal.classList.remove('active');
  // Resume demo if game is paused
  if (window._aeroGame && typeof window._aeroGame.resume === 'function') {
    window._aeroGame.resume();
  }
}

// ── Modal state machine ────────────────────────────────────────
function setState(state) {
  const states = ['checkout', 'processing', 'success'];
  states.forEach(s => {
    const el = document.getElementById('paywall-state-' + s);
    if (el) el.style.display = (s === state) ? '' : 'none';
  });
}

// ── PayPal button handler ─────────────────────────────────────
function handlePayPal() {
  // Transition → processing
  setState('processing');

  // Simulate payment (1.8s delay)
  setTimeout(() => {
    const aircraft = assignAircraft();
    showSuccessScreen(aircraft);
  }, 1800);
}

function assignAircraft() {
  const skin = AIRCRAFT_SKINS[Math.floor(Math.random() * AIRCRAFT_SKINS.length)];
  const tail = generateTailNumber();
  const aircraft = {
    tail,
    name: skin.name,
    skin: skin.skin,
    registered: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long' }),
  };
  localStorage.setItem('arcade_premium', 'true');
  localStorage.setItem('arcade_aircraft', JSON.stringify(aircraft));
  localStorage.setItem('arcade_tail', tail);
  return aircraft;
}

function showSuccessScreen(aircraft) {
  const tailEl = document.getElementById('success-tail');
  const nameEl = document.getElementById('success-name');
  const skinEl = document.getElementById('success-skin');
  if (tailEl) tailEl.textContent = aircraft.tail;
  if (nameEl) nameEl.textContent = '"' + aircraft.name + '"';
  if (skinEl) skinEl.textContent = aircraft.skin;
  setState('success');
  // Update the global badge if it exists
  const globalBadge = document.getElementById('premium-badge');
  if (globalBadge) {
    globalBadge.textContent = 'PREMIUM UNLOCKED';
    globalBadge.style.background = 'rgba(255, 201, 74, 0.15)';
    globalBadge.style.color = 'var(--accent-gold)';
    globalBadge.style.border = '1px solid rgba(255, 201, 74, 0.3)';
  }
}

// ── Launch premium game (from success screen) ─────────────────
function launchPremiumGame() {
  const modal = document.getElementById('paywall-modal');
  if (modal) modal.classList.remove('active');
  // Unlock and restart the aero game
  if (window._aeroGame) {
    window._aeroGame.unlockPremium();
  } else {
    // If game not open, navigate to it
    if (typeof launchGame === 'function') launchGame('aero-odyssey');
  }
  // Update premium button on card
  refreshPremiumUI();
}

// ── Refresh premium state on landing page ─────────────────────
function refreshPremiumUI() {
  const aircraft = getAircraft();
  if (!aircraft) return;
  // Update premium button to "Fly Now"
  const premiumBtn = document.querySelector('#card-aero .btn-premium');
  if (premiumBtn) {
    premiumBtn.textContent = '✈ ' + aircraft.tail + ' — Fly Now';
  }
  // Update highscore labels
  if (typeof initScoreUI === 'function') initScoreUI();
}

// ── On page load, restore premium UI ──────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if (isPremium()) {
    refreshPremiumUI();
    const globalBadge = document.getElementById('premium-badge');
    if (globalBadge) {
      globalBadge.textContent = 'PREMIUM UNLOCKED';
      globalBadge.style.background = 'rgba(255, 201, 74, 0.15)';
      globalBadge.style.color = 'var(--accent-gold)';
      globalBadge.style.border = '1px solid rgba(255, 201, 74, 0.3)';
    }
  }
});
