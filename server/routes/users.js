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

      // Mutual friends logic with caching
      let mutualFriends = [];
      if (loggedInUser) {
        const [targetFriendsJson, viewerFriendsJson] = await Promise.all([
          fetchWithCache(`friends_list_${userId}`, `https://friends.roblox.com/v1/users/${userId}/friends`),
          fetchWithCache(`friends_list_${loggedInUser}`, `https://friends.roblox.com/v1/users/${loggedInUser}/friends`)
        ]);

        const targetFriends = Array.isArray(targetFriendsJson.data) ? targetFriendsJson.data : [];
        const viewerFriendIds = new Set(Array.isArray(viewerFriendsJson.data) ? viewerFriendsJson.data.map(f => f.id) : []);

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
        mutualFriends
      });
    } catch (error) {
      console.error('[Error] /api/profile/:userId:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // API route to get a user's presence
  router.get('/api/user/presence/:userId', async (req, res) => {
    const userId = req.params.userId;

    try {
      const presenceData = await fetchWithCache(
        `presence_${userId}`,
        'https://presence.roblox.com/v1/presence/users',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': `.ROBLOSECURITY=${RBLX_KEY}`,
          },
          body: JSON.stringify({ userIds: [parseInt(userId)] }),
        }
      );

      if (!presenceData || !presenceData.userPresences || presenceData.userPresences.length === 0) {
        return res.status(404).json({ error: 'User presence not found.' });
      }

      const presence = presenceData.userPresences[0];

      res.json({
        userId: presence.userId,
        lastLocation: presence.lastLocation,
        isOnline: presence.isOnline,
        gameId: presence.gameId || null,
        placeId: presence.placeId || null,
        lastOnline: presence.lastOnline || null,
        userPresenceType: presence.userPresenceType || null,
        lastLocationType: presence.lastLocationType || null
      });
    } catch (error) {
      console.error('[Error] /api/user/presence/:userId:', error);
      res.status(500).json({ error: 'Failed to fetch user presence.' });
    }
  });

  return router;
};
