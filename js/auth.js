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

// ── Handle redirect result (after signInWithRedirect returns) ─
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

    // Handle pending paywall — works after both popup and redirect sign-in
    // sessionStorage survives redirect; window._pendingPaywall covers same-page popup
    const hasPending = window._pendingPaywall || sessionStorage.getItem('pending_paywall') === 'true';
    if (hasPending) {
      window._pendingPaywall = false;
      sessionStorage.removeItem('pending_paywall');
      if (typeof showPaywall === 'function') showPaywall();
    }
  } else {
    // Clear all session/local premium data on logout
    sessionStorage.removeItem('arcade_premium');
    localStorage.removeItem('arcade_premium');
    localStorage.removeItem('arcade_aircraft');
    localStorage.removeItem('arcade_tail');
    if (typeof updateGlobalPremiumUI === 'function') updateGlobalPremiumUI(false);
  }
});

// ── Public API ───────────────────────────────────────────────
/**
 * Open Google Sign-in.
 * Tries popup first (better UX). If the browser blocks it for any reason
 * (popup blocker, CSP iframe issue, mobile browser), falls back to redirect.
 * Optionally set window._pendingPaywall = true before calling to
 * auto-open paywall on successful login.
 */
function loginWithGoogle() {
  // Persist paywall intent so it survives a redirect back
  if (window._pendingPaywall) {
    sessionStorage.setItem('pending_paywall', 'true');
  }

  return _auth.signInWithPopup(_googleProvider).catch((err) => {
    // User intentionally closed the popup — do nothing
    if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
      return;
    }
    // Any other failure (popup blocked, CSP, internal error) → fall back to redirect
    console.warn('[Auth] Popup sign-in failed (' + err.code + '), falling back to redirect');
    return _auth.signInWithRedirect(_googleProvider).catch((e) => {
      console.warn('[Auth] Redirect sign-in also failed:', e.code);
    });
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
