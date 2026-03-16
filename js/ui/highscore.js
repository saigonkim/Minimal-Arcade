/* ============================================================
   HIGH SCORE MODULE  —  js/ui/highscore.js
   Persistent localStorage storage for all game high scores.
   Key: 'arcade_hs_v1' (versioned to allow future resets)
   ============================================================ */

const HS_KEY = 'arcade_hs_v1';

function _load() {
  try { return JSON.parse(localStorage.getItem(HS_KEY)) || {}; }
  catch { return {}; }
}

function _save(data) {
  try { localStorage.setItem(HS_KEY, JSON.stringify(data)); } catch(e) {}
}

/**
 * Get all high scores as { gameId: score } object.
 */
function getHighScores() {
  return _load();
}

/**
 * Get the high score for a single game.
 * @param {string} gameId
 * @returns {number}
 */
function getHighScore(gameId) {
  return _load()[gameId] || 0;
}

/**
 * Save a score for a game. Only stored if it's a new record.
 * @param {string} gameId
 * @param {number} score
 * @returns {boolean} true if new record was set
 */
function saveHighScore(gameId, score) {
  const data = _load();
  const prev = data[gameId] || 0;
  if (score > prev) {
    data[gameId] = score;
    _save(data);
    return true;
  }
  return false;
}

/**
 * Refresh all high-score displays (card + HUD) for a given game.
 * @param {string} gameId
 */
function refreshScoreUI(gameId) {
  const score = getHighScore(gameId);
  const label = score > 0 ? score.toLocaleString() : '—';

  // Card high-score display
  const cardEl = document.getElementById('card-hs-' + _idToShort(gameId));
  if (cardEl) cardEl.textContent = label;

  // Global hero bar
  const heroEl = document.getElementById('hs-' + _idToShort(gameId));
  if (heroEl) heroEl.textContent = label;

  // HUD best score
  const hud = document.getElementById('hud-best');
  if (hud && window._currentGame === gameId) hud.textContent = label;
}

function _idToShort(id) {
  const map = { 'perfect-stack': 'stack', 'neon-chain': 'neon', 'aero-odyssey': 'aero' };
  return map[id] || id;
}

/**
 * Initial UI refresh for all games on page load.
 */
function initScoreUI() {
  ['perfect-stack', 'neon-chain', 'aero-odyssey'].forEach(refreshScoreUI);
}

// Auto-run on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initScoreUI);
} else {
  initScoreUI();
}
