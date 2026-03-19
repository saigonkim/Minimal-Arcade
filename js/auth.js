/* ============================================================
   auth.js — Firebase Authentication Utility
   Google Sign-in for user identification before payment.
   ============================================================ */

// ── Initialize Firebase ──────────────────────────────────────
// Config is loaded from js/firebase-config.js (gitignored)
firebase.initializeApp(window.FIREBASE_CONFIG);
const _auth = firebase.auth();
const _googleProvider = new firebase.auth.GoogleAuthProvider();

// Expose current user globally for other modules (e.g. paywall.js)
window._currentUser = null;

// ── Handle redirect result (mobile sign-in) ──────────────────
_auth.getRedirectResult().then((result) => {
  if (result && result.user) {
    console.log('[Auth] Redirect sign-in completed:', result.user.displayName);
  }
}).catch((err) => {
  if (err.code && err.code !== 'auth/no-auth-event') {
    console.warn('[Auth] getRedirectResult error:', err.code);
  }
});

// ── Auth State Listener ──────────────────────────────────────
_auth.onAuthStateChanged(async (user) => {
  window._currentUser = user;
  _updateAuthUI(user);

  if (user) {
    // Ensure user record exists in Firestore, then restore premium status
    if (typeof ensureUserDoc === 'function') {
      await ensureUserDoc(user);
    }
    if (typeof loadUserPremiumStatus === 'function') {
      await loadUserPremiumStatus(user.uid);
    }
  } else {
    // Clear all session/local premium data on logout
    sessionStorage.removeItem('arcade_premium');
    localStorage.removeItem('arcade_premium');
    localStorage.removeItem('arcade_aircraft');
    localStorage.removeItem('arcade_tail');
    if (typeof updateGlobalPremiumUI === 'function') updateGlobalPremiumUI(false);
  }

  // If a deferred paywall open was requested after login, execute it now
  if (user && window._pendingPaywall) {
    window._pendingPaywall = false;
    if (typeof showPaywall === 'function') showPaywall();
  }
});

// ── Public API ───────────────────────────────────────────────
/**
 * Open Google Sign-in.
 * Uses redirect on mobile (popup blocked by most mobile browsers),
 * popup on desktop.
 * Optionally set window._pendingPaywall = true before calling to
 * auto-open paywall on successful login.
 */
function loginWithGoogle() {
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  if (isMobile) {
    return _auth.signInWithRedirect(_googleProvider).catch((err) => {
      console.warn('[Auth] Redirect sign-in failed:', err.code);
    });
  }
  return _auth.signInWithPopup(_googleProvider).catch((err) => {
    console.warn('[Auth] Google login cancelled or failed:', err.code);
  });
}

/** Sign out the current user and reload to reset all UI state. */
function logout() {
  return _auth.signOut().then(() => window.location.reload());
}

/** Check if a user is currently logged in. */
function isLoggedIn() {
  return !!window._currentUser;
}

// ── UI Update ─────────────────────────────────────────────────
function _updateAuthUI(user) {
  const loginBtn    = document.getElementById('auth-login-btn');
  const profileArea = document.getElementById('auth-profile-area');
  const avatar      = document.getElementById('auth-avatar');
  const displayName = document.getElementById('auth-display-name');
  const premiumBtn  = document.getElementById('header-premium-btn');

  if (!loginBtn || !profileArea) return;

  if (user) {
    // ── Logged in ──
    loginBtn.style.display   = 'none';
    profileArea.style.display = 'flex';

    if (avatar)      avatar.src         = user.photoURL || _getInitialsAvatar(user.displayName);
    if (displayName) displayName.textContent = user.displayName ? user.displayName.split(' ')[0] : 'Player';

    // Show premium button if not already premium
    if (premiumBtn) premiumBtn.style.display = '';

    console.log('[Auth] Logged in as:', user.displayName, '| UID:', user.uid);
  } else {
    // ── Logged out ──
    loginBtn.style.display    = 'flex';
    profileArea.style.display = 'none';

    if (premiumBtn) premiumBtn.style.display = '';
  }
}

/** Generate a simple data URI avatar from initials as fallback */
function _getInitialsAvatar(name) {
  const initials = (name || 'P').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#7c6af7"/><text x="16" y="21" text-anchor="middle" font-size="13" font-family="sans-serif" fill="white">${initials}</text></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}
