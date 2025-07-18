const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');

const fsPromises = fs.promises;

const DATA_DIR = path.join(__dirname, 'data');
const FRIEND_HISTORY_PATH = path.join(DATA_DIR, 'friend-history.json');
const FRIEND_SNAPSHOT_PATH = path.join(DATA_DIR, 'friend-snapshot.json');
const FRIEND_LAST_SEEN_PATH = path.join(DATA_DIR, 'friend-last-seen.json');
const BEST_FRIENDS_FILE = path.join(DATA_DIR, 'bestFriends.json');

async function ensureDataFiles() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      await fsPromises.mkdir(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(FRIEND_HISTORY_PATH)) {
      await fsPromises.writeFile(FRIEND_HISTORY_PATH, '[]', 'utf-8');
    }
    if (!fs.existsSync(FRIEND_SNAPSHOT_PATH)) {
      await fsPromises.writeFile(FRIEND_SNAPSHOT_PATH, '[]', 'utf-8');
    }
    if (!fs.existsSync(FRIEND_LAST_SEEN_PATH)) {
      await fsPromises.writeFile(FRIEND_LAST_SEEN_PATH, '{}', 'utf-8');
    }
    if (!fs.existsSync(BEST_FRIENDS_FILE)) {
      await fsPromises.writeFile(BEST_FRIENDS_FILE, '[]', 'utf-8');
    }
  } catch (err) {
    console.error('[Init] Error ensuring data files:', err);
  }
}

async function loadJSON(filepath, fallback) {
  try {
    const data = await fsPromises.readFile(filepath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return fallback;
  }
}

async function saveJSON(filepath, data) {
  try {
    await fsPromises.writeFile(filepath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error(`[saveJSON] Failed to save ${filepath}:`, err);
  }
}

function loadBestFriends() {
  try {
    const data = fs.readFileSync(BEST_FRIENDS_FILE, 'utf-8');
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveBestFriends(bestFriends) {
  try {
    fs.writeFileSync(BEST_FRIENDS_FILE, JSON.stringify(bestFriends, null, 2));
    console.log('[saveBestFriends] Saved best friends:', bestFriends);
  } catch (err) {
    console.error('[saveBestFriends] Failed to save best friends:', err);
  }
}

module.exports = function ({ RBLX_KEY, loggedInUser }) {
  if (!RBLX_KEY || !loggedInUser) {
    throw new Error('RBLX_KEY and loggedInUser must be provided');
  }

  async function fetchCurrentFriends() {
    const res = await fetch(`https://friends.roblox.com/v1/users/${loggedInUser}/friends`, {
      headers: { Cookie: `.ROBLOSECURITY=${RBLX_KEY}` },
    });
    if (!res.ok) throw new Error(`Failed to fetch friends: ${res.status}`);
    const json = await res.json();
    return json.data.map(friend => ({
      id: friend.id,
      name: friend.name,
      displayName: friend.displayName,
      avatarUrl: `https://www.roblox.com/headshot-thumbnail/image?userId=${friend.id}&width=100&height=100&format=png`,
      timestamp: Date.now(),
    }));
  }

  function diffFriends(oldList, newList) {
    const oldIds = new Set(oldList.map(f => f.id));
    const newIds = new Set(newList.map(f => f.id));
    return {
      added: newList.filter(f => !oldIds.has(f.id)),
      removed: oldList.filter(f => !newIds.has(f.id)),
    };
  }

  function updateHistoryLog(history, added, removed) {
    const now = Date.now();
    added.forEach(friend => {
      history.push({ ...friend, type: 'added', timestamp: now });
    });
    removed.forEach(friend => {
      history.push({ ...friend, type: 'removed', timestamp: now });
    });
  }

  async function updateLastSeen(currentFriends) {
    const res = await fetch('https://presence.roblox.com/v1/presence/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `.ROBLOSECURITY=${RBLX_KEY}`,
      },
      body: JSON.stringify({ userIds: currentFriends.map(f => f.id) }),
    });

    if (!res.ok) throw new Error(`Failed to fetch presence: ${res.status}`);
    const data = await res.json();
    const lastSeenMap = await loadJSON(FRIEND_LAST_SEEN_PATH, {});
    const nowISO = new Date().toISOString();

    for (const user of data.userPresences || []) {
      if (user.userPresenceType === 0) {
        if (!lastSeenMap[user.userId]) lastSeenMap[user.userId] = nowISO;
      } else {
        delete lastSeenMap[user.userId];
      }
    }

    await saveJSON(FRIEND_LAST_SEEN_PATH, lastSeenMap);
  }

  async function checkFriendsUpdates() {
    try {
      const currentFriends = await fetchCurrentFriends();
      const previousFriends = await loadJSON(FRIEND_SNAPSHOT_PATH, []);
      const { added, removed } = diffFriends(previousFriends, currentFriends);

      if (added.length || removed.length) {
        const history = await loadJSON(FRIEND_HISTORY_PATH, []);
        updateHistoryLog(history, added, removed);
        await saveJSON(FRIEND_HISTORY_PATH, history);
        await saveJSON(FRIEND_SNAPSHOT_PATH, currentFriends);
        console.log(`[Friend History] Updated: +${added.length}, -${removed.length}`);
      } else {
        console.log('[Friend History] No changes detected');
      }

      await updateLastSeen(currentFriends);
    } catch (err) {
      console.error('[Friend History] Error checking updates:', err);
    }
  }

  async function initializeHistory() {
    await ensureDataFiles();
    const hasHistory = fs.existsSync(FRIEND_HISTORY_PATH);
    const hasSnapshot = fs.existsSync(FRIEND_SNAPSHOT_PATH);
    if (!hasHistory || !hasSnapshot) {
      try {
        const currentFriends = await fetchCurrentFriends();
        await saveJSON(FRIEND_HISTORY_PATH, []);
        await saveJSON(FRIEND_SNAPSHOT_PATH, currentFriends);
        console.log('[Friend History] Initialized');
      } catch (err) {
        console.error('[Friend History] Failed to initialize:', err);
      }
    }
  }

  async function startPolling() {
    await initializeHistory();
    await checkFriendsUpdates();
    setInterval(checkFriendsUpdates, 60 * 1000);
  }

  // ===== Routes =====

  router.get('/api/me/friend-history', async (req, res) => {
    try {
      const history = await loadJSON(FRIEND_HISTORY_PATH, []);
      res.json(history);
    } catch (err) {
      console.error('[Friend History] Load failed:', err);
      res.status(500).json({ error: 'Failed to load friend history' });
    }
  });

  router.post('/api/reset-friend-history', async (req, res) => {
    try {
      const currentFriends = await fetchCurrentFriends();
      const now = new Date().toISOString();
      const history = currentFriends.map(f => ({
        ...f,
        type: 'added',
        timestamp: Date.now(),
        timestampReadable: now,
      }));

      await saveJSON(FRIEND_HISTORY_PATH, history);
      await saveJSON(FRIEND_SNAPSHOT_PATH, currentFriends);
      res.json({ message: 'Friend tracking reset.', friendCount: currentFriends.length });
    } catch (err) {
      console.error('[Friend History] Reset failed:', err);
      res.status(500).json({ error: 'Reset failed' });
    }
  });

  router.get('/api/friends/last-online', async (req, res) => {
    try {
      const lastSeen = await loadJSON(FRIEND_LAST_SEEN_PATH, {});
      res.json(lastSeen);
    } catch (err) {
      console.error('[Last Online] Load failed:', err);
      res.status(500).json({ error: 'Failed to load last-seen data' });
    }
  });

  router.get('/api/friends/best-friends', (req, res) => {
    try {
      const bestFriends = loadBestFriends();
      res.json(bestFriends);
    } catch (err) {
      console.error('[Best Friends] Load failed:', err);
      res.status(500).json({ error: 'Failed to load best friends' });
    }
  });

  router.post('/api/friends/best-friends/add/:targetId', async (req, res) => {
    const targetId = req.params.targetId;
    if (!/^\d+$/.test(targetId)) {
      return res.status(400).json({ error: 'Invalid user ID format.' });
    }

    try {
      const friendsRes = await fetch(`https://friends.roblox.com/v1/users/${loggedInUser}/friends`, {
        headers: { Cookie: `.ROBLOSECURITY=${RBLX_KEY}` }
      });
      const friendsData = await friendsRes.json();
      const isFriend = friendsData?.data?.some(f => String(f.id) === targetId);
      if (!isFriend) {
        return res.status(403).json({ error: 'You must be friends to add as best friend.' });
      }

      const bestFriends = loadBestFriends();
      if (!bestFriends.includes(targetId)) {
        bestFriends.push(targetId);
        saveBestFriends(bestFriends);
      }

      res.json({ success: true, bestFriends });
    } catch (err) {
      console.error('[Add Best Friend]', err);
      res.status(500).json({ error: 'Failed to add best friend' });
    }
  });

  router.post('/api/friends/best-friends/remove/:targetId', (req, res) => {
    const targetId = req.params.targetId;
    if (!/^\d+$/.test(targetId)) {
      return res.status(400).json({ error: 'Invalid user ID format.' });
    }

    try {
      let bestFriends = loadBestFriends();
      const filtered = bestFriends.filter(id => id !== targetId);
      if (filtered.length === bestFriends.length) {
        return res.status(404).json({ error: 'User ID not in best friends.' });
      }

      saveBestFriends(filtered);
      res.json({ success: true, bestFriends: filtered });
    } catch (err) {
      console.error('[Remove Best Friend]', err);
      res.status(500).json({ error: 'Failed to remove best friend' });
    }
  });

  startPolling();
  return router;
};
