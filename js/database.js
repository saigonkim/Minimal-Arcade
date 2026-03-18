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
