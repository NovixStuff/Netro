const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');

const FRIEND_HISTORY_PATH = path.join(__dirname, 'data', 'friend-history.json');
const FRIEND_SNAPSHOT_PATH = path.join(__dirname, 'data', 'friend-snapshot.json');

module.exports = function ({ RBLX_KEY, loggedInUser }) {

  if (!RBLX_KEY || !loggedInUser) {
    throw new Error('RBLX_KEY and loggedInUser must be provided');
  }

  // Helpers to load/save JSON files
  function loadJSON(filepath, fallback = []) {
    if (!fs.existsSync(filepath)) return fallback;
    try {
      return JSON.parse(fs.readFileSync(filepath, 'utf8'));
    } catch {
      return fallback;
    }
  }

  function saveJSON(filepath, data) {
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf8');
  }

  // Fetch current friends list from Roblox API
  async function fetchCurrentFriends() {
    const res = await fetch(`https://friends.roblox.com/v1/users/${loggedInUser}/friends`, {
      headers: { 'Cookie': `.ROBLOSECURITY=${RBLX_KEY}` }
    });
    if (!res.ok) throw new Error(`Failed to fetch friends: ${res.status}`);
    const data = await res.json();
    return data.data.map(friend => ({
      id: friend.id,
      name: friend.name,
      displayName: friend.displayName,
      avatarUrl: `https://www.roblox.com/headshot-thumbnail/image?userId=${friend.id}&width=100&height=100&format=png`,
      timestamp: Date.now()
    }));
  }

  // Calculate differences between two friend lists
  function diffFriends(oldList, newList) {
    const oldIds = new Set(oldList.map(f => f.id));
    const newIds = new Set(newList.map(f => f.id));

    const added = newList.filter(f => !oldIds.has(f.id));
    const removed = oldList.filter(f => !newIds.has(f.id));

    return { added, removed };
  }

  // Update history log with new additions/removals
  function updateHistoryLog(history, added, removed) {
    const now = Date.now();

    added.forEach(friend => {
      history.push({
        id: friend.id,
        name: friend.name,
        displayName: friend.displayName,
        avatarUrl: friend.avatarUrl,
        type: 'added',
        timestamp: now
      });
    });

    removed.forEach(friend => {
      history.push({
        id: friend.id,
        name: friend.name,
        displayName: friend.displayName,
        avatarUrl: friend.avatarUrl,
        type: 'removed',
        timestamp: now
      });
    });
  }

  // Main function that checks for changes and updates files
  async function checkFriendsUpdates() {
    try {
      const currentFriends = await fetchCurrentFriends();
      const previousFriends = loadJSON(FRIEND_SNAPSHOT_PATH, []);

      const { added, removed } = diffFriends(previousFriends, currentFriends);

      if (added.length > 0 || removed.length > 0) {
        const history = loadJSON(FRIEND_HISTORY_PATH, []);
        updateHistoryLog(history, added, removed);
        saveJSON(FRIEND_HISTORY_PATH, history);
        saveJSON(FRIEND_SNAPSHOT_PATH, currentFriends);
        console.log(`[Friend History] Updated: +${added.length} added, -${removed.length} removed`);
      } else {
        console.log('[Friend History] No changes detected');
      }
    } catch (err) {
      console.error('[Friend History] Error checking updates:', err.message);
    }
  }

  // Initialize history and snapshot files if missing
  async function initializeHistory() {
    if (!fs.existsSync(FRIEND_HISTORY_PATH) || !fs.existsSync(FRIEND_SNAPSHOT_PATH)) {
      console.log('[Friend History] Initializing history and snapshot files...');
      try {
        const currentFriends = await fetchCurrentFriends();
        saveJSON(FRIEND_HISTORY_PATH, []); // start empty history
        saveJSON(FRIEND_SNAPSHOT_PATH, currentFriends);
        console.log('[Friend History] Initialization complete');
      } catch (err) {
        console.error('[Friend History] Failed to initialize:', err.message);
      }
    }
  }

  // Start periodic polling every 10 minutes
  async function startPolling() {
    await initializeHistory();
    await checkFriendsUpdates();
    setInterval(checkFriendsUpdates, 5 * 60 * 1000); // 5 mins
  }

  // API Routes

  // Get friend history log
  router.get('/api/me/friend-history', (req, res) => {
    try {
      const history = loadJSON(FRIEND_HISTORY_PATH, []);
      res.json(history);
    } catch (err) {
      console.error('[Friend History] Failed to load history:', err);
      res.status(500).json({ error: 'Failed to load friend history.' });
    }
  });

  router.post('/api/reset-friend-history', async (req, res) => {
    try {
      console.log('[Friend History] Full reset and sync starting...');
      const currentFriends = await fetchCurrentFriends();
      const now = Date.now();
      const readable = new Date(now).toISOString();

      // Create a new history log where each current friend is marked as "added"
      const newHistory = currentFriends.map(friend => ({
        id: friend.id,
        name: friend.name,
        displayName: friend.displayName,
        avatarUrl: friend.avatarUrl,
        type: 'added',
        timestamp: now,
        timestampReadable: readable
      }));

      // Save both history and snapshot
      saveJSON(FRIEND_HISTORY_PATH, newHistory);
      saveJSON(FRIEND_SNAPSHOT_PATH, currentFriends);

      console.log(`[Friend History] Reset complete. ${currentFriends.length} friends recorded.`);
      res.json({
        message: 'Friend tracking has been reset and synced with current friend list.',
        friendCount: currentFriends.length
      });
    } catch (err) {
      console.error('[Friend History] Failed to reset and sync:', err.message);
      res.status(500).json({ error: 'Failed to reset friend tracking.' });
    }
  });


  // Kick off the polling right away when module loads
  startPolling();

  return router;
};
