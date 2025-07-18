const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');

const HISTORY_PATH = path.join(__dirname, 'data', 'game-history.json');
const pinnedFile = path.join(__dirname, '../data/pinned-games.json');

function loadHistory() {
  if (!fs.existsSync(HISTORY_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'));
  } catch {
    return [];
  }
}

function saveHistory(history) {
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2), 'utf8');
}

module.exports = function ({ RBLX_KEY, loggedInUser }) {
  
  //Ensures RBLX_KEY and loggedInUser are valid
  if (!RBLX_KEY || !loggedInUser) {
    throw new Error('[Advanced Game Features] RBLX_KEY and loggedInUser must be provided');
  }

  async function fetchCurrentPresence() {
    const response = await fetch('https://presence.roblox.com/v1/presence/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `.ROBLOSECURITY=${RBLX_KEY}`
      },
      body: JSON.stringify({ userIds: [loggedInUser] }),
    });

    if (!response.ok) throw new Error(`Failed to fetch presence: ${response.status}`);

    const data = await response.json();
    if (!data.userPresences || data.userPresences.length === 0) {
      return null;
    }
    return data.userPresences[0];
  }

  async function checkAndUpdateGameHistory() {
  try {
    const presence = await fetchCurrentPresence();

    if (!presence || presence.placeId === null) {
      // No current game presence detected, do nothing or optionally log
      console.log('[Game History] No changes decteded')
      return;
    }

    const history = loadHistory();
    const now = new Date().toISOString();

    let entry = history.find(e => e.placeId === presence.placeId);

    if (!entry) {
      // No entry for this placeId yet, add it
      history.push({
        placeId: presence.placeId,
        firstSeen: now,
        lastSeen: now,
      });
      console.log(`[Game History] New game logged: Place ID ${presence.placeId}`);
    } else {
      // Update lastSeen timestamp for existing entry
      entry.lastSeen = now;
    }

    saveHistory(history);
  } catch (error) {
    console.error('[Game History] Error:', error.message);
  }
}

  // Periodic polling
  function startPolling() {
    checkAndUpdateGameHistory();
    setInterval(checkAndUpdateGameHistory, 1 * 60 * 1000); // every min
  }

  // Get pinned games
  async function readPinnedGames() {
  try {
    const data = await fs.readFile(pinnedFile, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

// Helper to save pinned games
async function writePinnedGames(games) {
  await fs.writeFile(pinnedFile, JSON.stringify(games, null, 2));
}

  // REST API routes

  // Get full game history
  router.get('/api/game-history', (req, res) => {
    try {
      const history = loadHistory();
      res.json(history);
    } catch (error) {
      res.status(500).json({ error: 'Failed to load game history.' });
    }
  });

  // Reset game history: clear and save current game if playing
  router.post('/api/game-history/reset', async (req, res) => {
    try {
      const presence = await fetchCurrentPresence();
      let newHistory = [];

      if (presence && presence.placeId) {
        const now = new Date().toISOString();
        newHistory.push({
          placeId: presence.placeId,
          firstSeen: now,
          lastSeen: now,
        });
      }

      saveHistory(newHistory);
      res.json({ message: 'Game history reset successfully.', history: newHistory });
    } catch (error) {
      res.status(500).json({ error: 'Failed to reset game history.' });
    }
  });

router.get('/api/games/pinned', async (req, res) => {
  try {
    const pinnedGames = await readPinnedGames();
    res.json(pinnedGames);
  } catch (err) {
    console.error('Failed to read pinned games:', err);
    res.status(500).json({ error: 'Failed to read pinned games' });
  }
});

// POST pin a game
router.post('/api/games/pin/:gameId', async (req, res) => {
  const gameId = parseInt(req.params.gameId, 10);
  if (isNaN(gameId)) return res.status(400).json({ error: 'Invalid gameId' });

  try {
    const games = await readPinnedGames();
    if (!games.includes(gameId)) {
      games.push(gameId);
      await writePinnedGames(games);
    }
    res.json({ success: true, pinned: gameId });
  } catch (err) {
    console.error('Failed to pin game:', err);
    res.status(500).json({ error: 'Failed to pin game' });
  }
});

// POST unpin a game
router.post('/api/games/un-pin/:gameId', async (req, res) => {
  const gameId = parseInt(req.params.gameId, 10);
  if (isNaN(gameId)) return res.status(400).json({ error: 'Invalid gameId' });

  try {
    let games = await readPinnedGames();
    games = games.filter(id => id !== gameId);
    await writePinnedGames(games);
    res.json({ success: true, unpinned: gameId });
  } catch (err) {
    console.error('Failed to unpin game:', err);
    res.status(500).json({ error: 'Failed to unpin game' });
  }
});

  startPolling();

  return router;
};
