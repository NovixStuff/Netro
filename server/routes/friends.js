const express = require('express');
const fetch = require('node-fetch');
const NodeCache = require('node-cache');

const router = express.Router();
const cache = new NodeCache({ stdTTL: 60, checkperiod: 120 }); // 60s default TTL, check every 2 mins

module.exports = function ({ RBLX_KEY, loggedInUser }) {

// Helper to fetch with caching
async function fetchWithCache(cacheKey, url, options = {}, ttl = 60) {
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const response = await fetch(url, options);
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Error] Fetch failed for ${url}: ${response.status} - ${errorText}`);
    throw new Error(`Fetch failed: ${response.statusText}`);
  }

  const data = await response.json();
  cache.set(cacheKey, data, ttl);
  return data;
}

// Your getFriends with caching
async function getFriends(userId) {
  return fetchWithCache(
    `friends_${userId}`,
    `https://friends.roblox.com/v1/users/${userId}/friends`
  ).then(json => {
    if (!Array.isArray(json.data)) {
      console.error(`Unexpected response for user ${userId}:`, json);
      throw new Error(`Roblox API did not return a friend list array for user ${userId}`);
    }
    return json.data.map(friend => friend.id);
  });
}

// Your getCSRFToken WITHOUT caching (tokens expire fast)
async function getCSRFToken() {
  const response = await fetch('https://auth.roblox.com/v2/logout', {
    method: 'POST',
    headers: {
      'Cookie': `.ROBLOSECURITY=${RBLX_KEY}`,
    }
  });

  const token = response.headers.get('x-csrf-token');
  if (!token) {
    throw new Error('Failed to get CSRF token.');
  }

  return token;
}

// Example route with caching
router.get('/api/me/friends', async (req, res) => {
  try {
    if (!loggedInUser) return res.status(401).json({ error: 'Unauthorized' });

    // Cached friends list
    const friendData = await fetchWithCache(
      `friendlist_${loggedInUser}`,
      `https://friends.roblox.com/v1/users/${loggedInUser}/friends`
    );

    if (!Array.isArray(friendData.data)) {
      return res.status(500).json({ error: 'Invalid friend list format.' });
    }

    const friends = friendData.data;
    if (friends.length === 0) return res.json([]);

    // Cached avatars for friends
    const userIdsCSV = friends.map(f => f.id).join(',');
    const headshotData = await fetchWithCache(
      `headshots_${userIdsCSV}`,
      `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userIdsCSV}&size=100x100&format=Png&isCircular=true`
    );

    const enrichedFriends = friends.map(friend => {
      const headshot = headshotData.data.find(h => h.targetId === friend.id);
      return {
        id: friend.id,
        name: friend.name,
        displayName: friend.displayName,
        avatarUrl: headshot?.imageUrl || null
      };
    });

    res.json(enrichedFriends);
  } catch (error) {
    console.error('[Error] /api/me/friends:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/api/me/friend-requests', async (req, res) => {
  try {
    const allUsers = [];
    let cursor = null;

    while (true) {
      const url = new URL('https://friends.roblox.com/v1/my/friends/requests');
      if (cursor) url.searchParams.set('cursor', cursor);

      const cacheKey = `friendrequests_${cursor || 'start'}`;
      let data = cache.get(cacheKey);

      if (!data) {
        const response = await fetch(url.toString(), {
          headers: {
            'Content-Type': 'application/json',
            'Cookie': `.ROBLOSECURITY=${process.env.RBLX_KEY}`
          }
        });
        if (!response.ok) {
          const errorText = await response.text();
          return res.status(response.status).json({
            error: 'Failed to fetch friend requests.',
            status: response.status,
            body: errorText
          });
        }
        data = await response.json();
        cache.set(cacheKey, data, 60);
      }

      allUsers.push(...(data.data || []));
      cursor = data.nextPageCursor;
      if (!cursor) break;
    }

    const userIds = allUsers.map(u => u.id);
    const userIdChunks = [];
    for (let i = 0; i < userIds.length; i += 100) {
      userIdChunks.push(userIds.slice(i, i + 100));
    }

    let avatarResults = [];
    for (const chunk of userIdChunks) {
      const chunkKey = `friendrequests_headshots_${chunk.join(',')}`;
      const headshotData = await fetchWithCache(
        chunkKey,
        `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${chunk.join(',')}&size=100x100&format=Png&isCircular=true`
      );
      avatarResults.push(...(headshotData.data || []));
    }

    const enriched = allUsers.map(user => {
      const avatar = avatarResults.find(a => a.targetId === user.id);
      return {
        ...user,
        avatarUrl: avatar ? avatar.imageUrl : null
      };
    });

    res.json(enriched);
  } catch (error) {
    console.error('[Error] /api/me/friend-requests:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/api/me/friend-requests/count', async (req, res) => {
  try {
    const cacheKey = 'friendrequests_count';
    const countData = await fetchWithCache(
      cacheKey,
      `https://friends.roblox.com/v1/user/friend-requests/count`,
      {
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `.ROBLOSECURITY=${process.env.RBLX_KEY}`
        }
      }
    );
    res.json({ count: countData.count || 0 });
  } catch (error) {
    console.error('[Error] /api/me/friend-requests/count:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/api/mutual-friends/:user1/:user2', async (req, res) => {
  const userA = req.params.user1;
  const userB = req.params.user2;

  if (!userA || !userB) {
    return res.status(400).json({ error: 'Missing user1 or user2 in URL parameters.' });
  }

  try {
    // Assume getFriends uses caching internally
    const [friendsA, friendsB] = await Promise.all([
      getFriends(userA), 
      getFriends(userB)
    ]);

    const setB = new Set(friendsB);
    const mutual = friendsA.filter(id => setB.has(id));

    res.json({
      mutualFriendIds: mutual,
      count: mutual.length
    });
  } catch (err) {
    console.error('Error fetching mutual friends:', err);
    res.status(500).json({ error: err.message });
  }
});

// API route to add a friend
router.post('/api/friends/add/:userId', async (req, res) => {
  const userId = req.params.userId;

  try {
    // Step 1: Get CSRF token
    const csrfToken = await getCSRFToken();

    // Step 2: Add friend
    const response = await fetch(`https://friends.roblox.com/v1/users/${loggedInUser}/friends/request/${userId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `.ROBLOSECURITY=${RBLX_KEY}`,
        'x-csrf-token': csrfToken
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({
        error: 'Failed to add friend.',
        status: response.status,
        body: errorText
      });
    }

    res.json({ message: `Friend request sent to ${userId}.` });
  } catch (error) {
    console.error('[Add Friend Error]', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

//API route to remove a friend
router.post('/api/friends/remove/:userId', async (req, res) => {
  const userId = req.params.userId;

  try {
    // Step 1: Get CSRF token
    const csrfToken = await getCSRFToken();
    // Step 2: Remove friend
    const response = await fetch(`https://friends.roblox.com//v1/users/${userId}/unfriend`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `.ROBLOSECURITY=${RBLX_KEY}`,
        'x-csrf-token': csrfToken
      }
    });
    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({
        error: 'Failed to remove friend.',
        status: response.status,
        body: errorText
      });
    }

    res.json({ message: `Unfriended ${userId}.` });
  } catch (error) {
    console.error('[Remove Friend Error]', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

//Checks if the logged-in user is friends with the specified user
router.get('/api/is-friends/:userId', async (req, res) => {
  const userId = req.params.userId;

  try {
    const response = await fetch(`https://friends.roblox.com/v1/users/${loggedInUser}/friends/${userId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `.ROBLOSECURITY=${RBLX_KEY}`,
      }
    });

    if (response.status === 200) {
      return res.json({ isFriend: true });
    } else if (response.status === 404) {
      return res.json({ isFriend: false });
    } else {
      const errorText = await response.text();
      return res.status(response.status).json({
        error: 'Failed to check friendship status.',
        status: response.status,
        body: errorText
      });
    }
  } catch (error) {
    console.error('[Check Friendship Error]', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Accept friend request
router.post('/api/friend/accept/:userId', async (req, res) => {
  const userId = req.params.userId;
  try {
    
    csrfToken = await getCSRFToken();

    // Step 2: Send accept friend request
    const acceptRes = await fetch(`https://friends.roblox.com/v1/user/${userId}/accept-friend-request`, {
      method: 'POST',
      headers: {
        'Cookie': `.ROBLOSECURITY=${process.env.RBLX_KEY}`,
        'x-csrf-token': csrfToken,
        'Content-Type': 'application/json',
      },
    });

    if (acceptRes.status === 200) {
      return res.json({ success: true, message: `Accepted friend request from userId ${userId}` });
    } else {
      const errorBody = await acceptRes.text();
      return res.status(acceptRes.status).json({ success: false, error: errorBody });
    }
  } catch (err) {
    console.error('[Friend Accept Error]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Decline friend request
router.post('/api/friend/decline/:userId', async (req, res) => {
  const userId = req.params.userId;
  try {

    csrfToken = await getCSRFToken();

    // Step 2: Send decline friend request
    const declineRes = await fetch(`https://friends.roblox.com/v1/users/${userId}/decline-friend-request`, {
      method: 'POST',
      headers: {
        'Cookie': `.ROBLOSECURITY=${process.env.RBLX_KEY}`,
        'x-csrf-token': csrfToken,
        'Content-Type': 'application/json',
      },
    });

    if (declineRes.status === 200) {
      return res.json({ success: true, message: `Declined friend request from userId ${userId}` });
    } else {
      const errorBody = await declineRes.text();
      return res.status(declineRes.status).json({ success: false, error: errorBody });
    }
  } catch (err) {
    console.error('[Friend Decline Error]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

return router;
};