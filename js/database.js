/* ============================================================
   database.js — Firestore User Data Utility
   Handles reading and writing user premium status.
   Loaded after auth.js (requires firebase to be initialized).
   ============================================================ */

const _db = firebase.firestore();

// ── User Document Schema ────────────────────────────────────
// /users/{uid}
// {
//   uid:          string,
//   email:        string,
//   displayName:  string,
//   isPremium:    boolean,
//   premiumSince: timestamp | null,
//   aircraft: {
//     tail:       string,
//     name:       string,
//     skin:       string,
//     registered: string,
//   } | null
// }

/**
 * Get or create a user document in Firestore.
 * Called after login to initialize the record if it doesn't exist.
 */
async function ensureUserDoc(firebaseUser) {
  if (!firebaseUser) return null;
  const ref = _db.collection('users').doc(firebaseUser.uid);
  const snap = await ref.get();

  if (!snap.exists) {
    // First time user — create their record
    const newUser = {
      uid:          firebaseUser.uid,
      email:        firebaseUser.email || '',
      displayName:  firebaseUser.displayName || '',
      isPremium:    false,
      premiumSince: null,
      aircraft:     null,
      createdAt:    firebase.firestore.FieldValue.serverTimestamp(),
    };
    await ref.set(newUser);
    console.log('[DB] Created new user doc for:', firebaseUser.uid);
    return newUser;
  }

  console.log('[DB] Loaded user doc for:', firebaseUser.uid);
  return snap.data();
}

/**
 * Load user's premium status from Firestore into the session.
 * Updates localStorage mirrors and calls refreshPremiumUI().
 */
async function loadUserPremiumStatus(uid) {
  if (!uid) return false;
  try {
    const snap = await _db.collection('users').doc(uid).get();
    if (!snap.exists) return false;

    const data = snap.data();
    if (data.isPremium && data.aircraft) {
      // Mirror to localStorage for game logic and existing paywall.js functions
      sessionStorage.setItem('arcade_premium', 'true');
      localStorage.setItem('arcade_premium', 'true');
      localStorage.setItem('arcade_aircraft', JSON.stringify(data.aircraft));
      localStorage.setItem('arcade_tail', data.aircraft.tail);

      console.log('[DB] Premium status restored for:', data.aircraft.tail);

      if (typeof refreshPremiumUI === 'function') refreshPremiumUI();
      return true;
    }
    return false;
  } catch (err) {
    console.warn('[DB] Failed to load premium status:', err);
    return false;
  }
}

/**
 * Save premium + aircraft data to Firestore after a successful payment.
 * @param {string} uid - The Firebase UID of the purchasing user.
 * @param {object} aircraft - { tail, name, skin, registered }
 */
async function savePremiumStatus(uid, aircraft) {
  if (!uid) {
    console.warn('[DB] Cannot save: no UID provided.');
    return;
  }
  try {
    await _db.collection('users').doc(uid).update({
      isPremium:    true,
      premiumSince: firebase.firestore.FieldValue.serverTimestamp(),
      aircraft:     aircraft,
    });
    console.log('[DB] Premium status saved for UID:', uid, '| Aircraft:', aircraft.tail);
  } catch (err) {
    console.error('[DB] Failed to save premium status:', err);
  }
}

/**
 * Submit a score to the global leaderboard.
 * @param {string} gameId
 * @param {number} score
 */
async function submitScore(gameId, score) {
  if (score <= 0) return;

  const user = firebase.auth().currentUser;
  const entry = {
    gameId: gameId,
    score: score,
    displayName: user ? (user.displayName || 'Arcade Pro') : 'Noname',
    uid: user ? user.uid : 'anon',
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
  };

  try {
    await _db.collection('scores').add(entry);
    console.log('[DB] Score submitted:', entry);
    // Refresh leaderboard if we're on the landing page
    if (document.getElementById('leaderboard-content')) {
      await refreshLeaderboardUI(gameId);
    }
  } catch (err) {
    console.warn('[DB] Failed to submit score:', err);
  }
}

/**
 * Fetch top 5 scores for a specific game.
 * Sorts client-side to avoid composite index requirement.
 * @param {string} gameId
 */
async function getLeaderboard(gameId) {
  try {
    const snap = await _db.collection('scores')
      .where('gameId', '==', gameId)
      .get();

    return snap.docs
      .map(doc => doc.data())
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  } catch (err) {
    console.warn('[DB] Error fetching leaderboard:', err);
    return [];
  }
}

/**
 * Refresh the leaderboard UI for a specific game based on active tab.
 * @param {string} gameId
 */
async function refreshLeaderboardUI(gameId) {
  const container = document.getElementById('leaderboard-content');
  if (!container) return;

  // Check if the game matches the currently active tab
  const activeTab = document.querySelector('.tab-btn.active');
  const activeGameId = activeTab ? activeTab.dataset.tab : null;
  
  // If no specific game requested, use active tab.
  // If specific game requested, only refresh if it matches active tab.
  if (gameId && activeGameId && gameId !== activeGameId) {
    console.log(`[DB] Skipping UI refresh for ${gameId} as ${activeGameId} is active.`);
    return;
  }
  
  const finalGameId = gameId || activeGameId;
  if (!finalGameId) return;

  // Show loading state if it's not a background refresh
  if (container.children.length === 0 || container.querySelector('.leaderboard-loading')) {
    container.innerHTML = '<div class="leaderboard-loading">Fetching elite scores...</div>';
  }

  const scores = await getLeaderboard(finalGameId);  // use finalGameId, not gameId
  const currentUser = firebase.auth().currentUser;

  if (scores.length === 0) {
    container.innerHTML = '<div class="leaderboard-loading">No records yet. Be the first!</div>';
    return;
  }

  container.innerHTML = '';
  scores.forEach((s, index) => {
    const rank = index + 1;
    const rankClass = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : '';
    const isMe = currentUser && s.uid === currentUser.uid;

    // Build with DOM methods to avoid XSS on displayName
    const item = document.createElement('div');
    item.className = 'lb-item';
    item.style.animationDelay = `${index * 0.05}s`;

    const rankEl = document.createElement('div');
    rankEl.className = 'lb-rank' + (rankClass ? ' ' + rankClass : '');
    rankEl.textContent = rank;

    const nameEl = document.createElement('div');
    nameEl.className = 'lb-name';
    nameEl.textContent = s.displayName || 'Anonymous';
    if (isMe) {
      const badge = document.createElement('span');
      badge.className = 'me-badge';
      badge.textContent = 'YOU';
      nameEl.appendChild(badge);
    }

    const scoreEl = document.createElement('div');
    scoreEl.className = 'lb-score';
    scoreEl.textContent = (s.score || 0).toLocaleString();

    item.appendChild(rankEl);
    item.appendChild(nameEl);
    item.appendChild(scoreEl);
    container.appendChild(item);
  });
}
