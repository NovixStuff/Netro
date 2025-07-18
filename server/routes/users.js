const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const NodeCache = require('node-cache');

module.exports = function ({ RBLX_KEY, loggedInUser }) {
  const cache = new NodeCache({ stdTTL: 60, checkperiod: 120 });

  // Helper: fetch with cache
  async function fetchWithCache(cacheKey, url, options = {}, ttl = 60) {
    try {
      const cached = cache.get(cacheKey);
      if (cached) return cached;

      const res = await fetch(url, options);
      if (!res.ok) {
        console.error(`[Error] Fetch failed for ${url} with status ${res.status}`);
        throw new Error(`Fetch failed for ${url}: ${res.statusText}`);
      }

      const data = await res.json();
      cache.set(cacheKey, data, ttl);
      return data;
    } catch (err) {
      console.error(`[Error] fetchWithCache for key "${cacheKey}":`, err);
      throw err;
    }
  }

  // API route to get logged-in user's profile info
  router.get('/api/me/', async (req, res) => {
    try {
      const userId = loggedInUser;
      const [user, followers, friends, following] = await Promise.all([
        fetchWithCache(`user_${userId}`, `https://users.roblox.com/v1/users/${userId}`),
        fetchWithCache(`followers_${userId}`, `https://friends.roblox.com/v1/users/${userId}/followers/count`),
        fetchWithCache(`friends_${userId}`, `https://friends.roblox.com/v1/users/${userId}/friends/count`),
        fetchWithCache(`following_${userId}`, `https://friends.roblox.com/v1/users/${userId}/followings/count`)
      ]);

      const headshotData = await fetchWithCache(
        `headshot_${userId}`,
        `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=true`
      );

      const avatarUrl = headshotData.data[0]?.imageUrl || '';

      res.json({
        name: user.name,
        displayName: user.displayName,
        description: user.description || '',
        userId,
        avatarUrl,
        followers: followers.count || 0,
        friends: friends.count || 0,
        following: following.count || 0,
        created: user.created,
      });
    } catch (error) {
      console.error('[Error] /api/me:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // API route to get user profile info by ID
router.get('/api/profile/:userId', async (req, res) => {
  const userId = req.params.userId;

  try {
    const [user, followers, friends, following] = await Promise.all([
      fetchWithCache(`user_${userId}`, `https://users.roblox.com/v1/users/${userId}`),
      fetchWithCache(`followers_${userId}`, `https://friends.roblox.com/v1/users/${userId}/followers/count`),
      fetchWithCache(`friends_${userId}`, `https://friends.roblox.com/v1/users/${userId}/friends/count`),
      fetchWithCache(`following_${userId}`, `https://friends.roblox.com/v1/users/${userId}/followings/count`)
    ]);

    const headshotData = await fetchWithCache(
      `headshot_${userId}`,
      `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=true`
    );

    const avatarUrl = headshotData.data[0]?.imageUrl || '';

    // Initialize mutual and friendship status
    let mutualFriends = [];
    let isFriend = false;

    if (loggedInUser) {
      const [targetFriendsJson, viewerFriendsJson] = await Promise.all([
        fetchWithCache(`friends_list_${userId}`, `https://friends.roblox.com/v1/users/${userId}/friends`),
        fetchWithCache(`friends_list_${loggedInUser}`, `https://friends.roblox.com/v1/users/${loggedInUser}/friends`)
      ]);

      const targetFriends = Array.isArray(targetFriendsJson.data) ? targetFriendsJson.data : [];
      const viewerFriends = Array.isArray(viewerFriendsJson.data) ? viewerFriendsJson.data : [];

      const viewerFriendIds = new Set(viewerFriends.map(f => f.id));

      // Check if userId is a friend of loggedInUser
      isFriend = viewerFriendIds.has(parseInt(userId, 10));

      const mutualList = targetFriends.filter(friend => viewerFriendIds.has(friend.id));
      const mutualIds = mutualList.map(f => f.id);

      if (mutualIds.length > 0) {
        const mutualHeadshotData = await fetchWithCache(
          `headshot_mutual_${mutualIds.join(',')}`,
          `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${mutualIds.join(',')}&size=100x100&format=Png&isCircular=true`
        );

        mutualFriends = mutualList.map(friend => {
          const headshot = mutualHeadshotData.data.find(img => img.targetId === friend.id);
          return {
            id: friend.id,
            name: friend.name,
            displayName: friend.displayName,
            avatarUrl: headshot?.imageUrl || null
          };
        });
      }
    }

    res.json({
      name: user.name,
      id: user.id,
      displayName: user.displayName,
      description: user.description || '',
      avatarUrl,
      followers: followers.count || 0,
      friends: friends.count || 0,
      following: following.count || 0,
      created: user.created,
      mutualFriendCount: mutualFriends.length,
      mutualFriends,
      isFriend
    });
  } catch (error) {
    console.error('[Error] /api/profile/:userId:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/api/profile/multi/:ids', async (req, res) => {
  const ids = req.params.ids.split(',').filter(Boolean);

  if (ids.length === 0) return res.status(400).json({ error: 'No user IDs provided' });

  try {
    // 1. Fetch all user objects in one request
    const usersRes = await fetchWithCache(
      `multi_users_${ids.join(',')}`,
      `https://users.roblox.com/v1/users?userIds=${ids.join(',')}`
    );
    const users = Array.isArray(usersRes) ? usersRes : usersRes.data;

    // 2. Fetch avatars
    const avatarRes = await fetchWithCache(
      `multi_avatars_${ids.join(',')}`,
      `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${ids.join(',')}&size=150x150&format=Png&isCircular=true`
    );
    const avatars = Array.isArray(avatarRes.data) ? avatarRes.data : [];

    // 3. Map user data into simplified profile objects
    const profiles = users.map(user => {
      const avatar = avatars.find(a => a.targetId === user.id);
      return {
        id: user.id,
        name: user.name,
        displayName: user.displayName,
        description: user.description || '',
        avatarUrl: avatar?.imageUrl || '',
        created: user.created
      };
    });

    res.json(profiles);
  } catch (error) {
    console.error('[Error] /api/profile/multi/:ids', error);
    res.status(500).json({ error: 'Failed to load user profiles' });
  }
});



  // API route to get a user's presence
  router.get('/api/user/presence/:userIds', async (req, res) => {
  const raw = req.params.userIds;
  const userIds = raw
    .split(',')
    .map(id => id.trim())
    .filter(id => /^\d+$/.test(id))
    .slice(0, 100); // Roblox allows up to 100 at once

  if (userIds.length === 0) {
    return res.status(400).json({ error: 'No valid user IDs provided.' });
  }

  try {
    const cacheKey = `presence_${userIds.join(',')}`;
    const presenceData = await fetchWithCache(
      cacheKey,
      'https://presence.roblox.com/v1/presence/users',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `.ROBLOSECURITY=${RBLX_KEY}`,
        },
        body: JSON.stringify({ userIds: userIds.map(Number) }),
      }
    );

    if (!presenceData || !Array.isArray(presenceData.userPresences)) {
      return res.status(500).json({ error: 'Invalid response from Roblox.' });
    }

    const result = presenceData.userPresences.map(p => ({
      userId: p.userId,
      lastLocation: p.lastLocation ?? null,
      isOnline: p.isOnline,
      gameId: p.gameId ?? null,
      placeId: p.placeId ?? null,
      userPresenceType: p.userPresenceType ?? null,
      lastLocationType: p.lastLocationType ?? null
    }));

    res.json(result);
  } catch (err) {
    console.error('[Presence Error]', err.message);
    res.status(500).json({ error: 'Failed to fetch user presence.' });
  }
});

router.get('/api/users/search', async (req, res) => {
  const query = (req.query.q || '').trim().toLowerCase();
  if (!query) {
    return res.status(400).json({ error: 'Missing search query parameter "q".' });
  }

  const cacheKey = `search_${query}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    // Fetch search results from Roblox
    const robloxRes = await fetch(`https://users.roblox.com/v1/users/search?keyword=${encodeURIComponent(query)}&limit=10`);
    if (robloxRes.status === 429) {
      return res.status(429).json({ error: 'Rate limited by Roblox API' });
    }
    if (!robloxRes.ok) {
      return res.status(robloxRes.status).json({ error: 'Failed to fetch Roblox API' });
    }

    const robloxData = await robloxRes.json();
    const users = robloxData.data || [];

    // If empty result, cache and return
    if (users.length === 0) {
      cache.set(cacheKey, [], 60);
      return res.json([]);
    }

    const userIds = users.map(u => u.id).join(',');

    // Fetch avatars
    const avatarRes = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userIds}&size=150x150&format=Png&isCircular=true`);
    const avatarData = await avatarRes.json();

    const avatarMap = new Map();
    avatarData.data?.forEach(entry => {
      avatarMap.set(entry.targetId, entry.imageUrl);
    });

    // Merge data
    const results = users.map(user => ({
      id: user.id,
      name: user.name,
      displayName: user.displayName,
      avatarUrl: avatarMap.get(user.id) || null
    }));

    // Cache and respond
    cache.set(cacheKey, results, 60); // cache 60 seconds
    res.json(results);
  } catch (err) {
    console.error('Error fetching Roblox user search:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});


  return router;
};
