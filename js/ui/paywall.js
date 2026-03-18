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
  // Use sessionStorage for easy testing (resets on F5 or close tab)
  return sessionStorage.getItem('arcade_premium') === 'true';
}

function getAircraft() {
  try { return JSON.parse(localStorage.getItem('arcade_aircraft')); }
  catch { return null; }
}

// ── Show / hide paywall modal ─────────────────────────────────
function showPaywall() {
  const modal = document.getElementById('paywall-modal');
  if (!modal) return;

  // If not logged in, show login-required state instead of checkout
  if (!isLoggedIn()) {
    setState('login-required');
  } else {
    setState('checkout');
    _renderPayPalButton();
  }

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
  const states = ['checkout', 'processing', 'success', 'login-required'];
  states.forEach(s => {
    const el = document.getElementById('paywall-state-' + s);
    if (el) el.style.display = (s === state) ? '' : 'none';
  });
}

// ── PayPal SDK Dynamic Loader ─────────────────────────────────
function _loadPayPalSDK(callback) {
  if (typeof paypal !== 'undefined') { callback(); return; }
  const clientId = window.PAYPAL_CLIENT_ID;
  if (!clientId) { console.error('[PayPal] PAYPAL_CLIENT_ID not set in firebase-config.js'); return; }
  const script = document.createElement('script');
  script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=USD`;
  script.onload = callback;
  script.onerror = () => console.error('[PayPal] Failed to load SDK');
  document.head.appendChild(script);
}

// ── PayPal SDK Button Renderer ────────────────────────────────
let _paypalRendered = false;

function _renderPayPalButton() {
  if (_paypalRendered) return;
  if (typeof paypal === 'undefined') {
    _loadPayPalSDK(_renderPayPalButton);
    return;
  }

  _paypalRendered = true;

  paypal.Buttons({
    style: {
      layout: 'vertical',
      color:  'gold',
      shape:  'rect',
      label:  'pay',
      height: 44,
    },

    createOrder: (_data, actions) => {
      const uid = window._currentUser ? window._currentUser.uid : 'anonymous';
      return actions.order.create({
        purchase_units: [{
          amount:      { value: '5.00', currency_code: 'USD' },
          description: 'Aero Odyssey Pro — Lifetime Access',
          custom_id:   uid,
        }],
      });
    },

    onApprove: async (_data, actions) => {
      setState('processing');
      await actions.order.capture();
      const aircraft = assignAircraft();
      showSuccessScreen(aircraft);
    },

    onError: (err) => {
      console.error('[PayPal] Payment error:', err);
      setState('checkout');
    },

    onCancel: () => {
      setState('checkout');
    },
  }).render('#paypal-button-container');
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

  sessionStorage.setItem('arcade_premium', 'true');

  // Mirror to localStorage for in-game logic
  localStorage.setItem('arcade_aircraft', JSON.stringify(aircraft));
  localStorage.setItem('arcade_tail', tail);
  localStorage.setItem('arcade_premium', 'true');

  // Persist to Firestore if user is logged in (permanent, cross-device)
  if (window._currentUser && typeof savePremiumStatus === 'function') {
    savePremiumStatus(window._currentUser.uid, aircraft);
  }

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
  
  updateGlobalPremiumUI();
}

function updateGlobalPremiumUI(unlocked = true) {
  const globalBadge = document.getElementById('header-premium-badge');
  const premiumBtn = document.getElementById('header-premium-btn');
  
  if (globalBadge) {
    if (unlocked) {
      globalBadge.textContent = 'PREMIUM UNLOCKED';
      globalBadge.classList.add('premium');
      globalBadge.style.background = 'rgba(255, 201, 74, 0.15)';
      globalBadge.style.color = 'var(--accent-gold)';
      globalBadge.style.border = '1px solid rgba(255, 201, 74, 0.3)';
    } else {
      globalBadge.textContent = 'FREE VERSION';
      globalBadge.classList.remove('premium');
      globalBadge.style.background = 'rgba(57, 255, 20, 0.08)';
      globalBadge.style.color = 'var(--accent-green)';
      globalBadge.style.border = '1px solid rgba(57, 255, 20, 0.2)';
    }
  }
  
  if (premiumBtn) {
    premiumBtn.style.display = unlocked ? 'none' : '';
  }
}

// ── Launch premium game (from success screen) ─────────────────
function launchPremiumGame() {
  const modal = document.getElementById('paywall-modal');
  if (modal) modal.classList.remove('active');
  
  if (window._aeroGame) {
    window._aeroGame.unlockPremium();
  } else {
    if (typeof launchGame === 'function') launchGame('aero-odyssey');
  }
  
  refreshPremiumUI();
}

// ── Refresh premium state on landing page ─────────────────────
function refreshPremiumUI() {
  const aircraft = getAircraft();
  if (!aircraft || !isPremium()) return;
  
  // Update the badge on the Aero card to show the tail number as a "Fly Now" action
  const aeroBadge = document.getElementById('aero-status-badge');
  if (aeroBadge) {
    aeroBadge.innerHTML = `<span style="color: var(--accent-gold); font-weight: 700;">✈ ${aircraft.tail}</span> <span style="color: rgba(255,255,255,0.85); margin-left: 4px;">— Fly Now</span>`;
    aeroBadge.style.background = 'rgba(255, 201, 74, 0.1)';
    aeroBadge.style.padding = '6px 14px';
    aeroBadge.style.borderRadius = '20px';
    aeroBadge.style.border = '1px solid rgba(255, 201, 74, 0.3)';
    aeroBadge.style.cursor = 'pointer';
  }
  
  updateGlobalPremiumUI();
  
  if (typeof initScoreUI === 'function') initScoreUI();
}

// ── On page load, restore/reset premium UI ────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // If user is already logged in (checked by onAuthStateChanged), 
  // status will be refreshed from Firestore there rather than manually here.
  if (isPremium()) {
    refreshPremiumUI();
  }
});
