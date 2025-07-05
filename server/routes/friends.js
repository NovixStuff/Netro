const express = require('express');
const fetch = require('node-fetch');
const router = express.Router();

module.exports = function ({ RBLX_KEY, loggedInUser }) {

//Get the list of user IDs that the user is friends with
async function getFriends(userId) {
  const res = await fetch(`https://friends.roblox.com/v1/users/${userId}/friends`);
  const json = await res.json();

  if (!Array.isArray(json.data)) {
    console.error(`Unexpected response for user ${userId}:`, json);
    throw new Error(`Roblox API did not return a friend list array for user ${userId}`);
  }

  return json.data.map(friend => friend.id);
}

//Get your CSRF token from Roblox, used for changing user settings
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

// API route to get the logged-in user's friends
router.get('/api/me/friends', async (req, res) => {
  try {

    if (!loggedInUser) return res.status(401).json({ error: 'Unauthorized' });

    // Step 1: Get friend list
    const friendRes = await fetch(`https://friends.roblox.com/v1/users/${loggedInUser}/friends`);
    const friendData = await friendRes.json();

    if (!Array.isArray(friendData.data)) {
      return res.status(500).json({ error: 'Invalid friend list format.' });
    }

    const friends = friendData.data; // Each has: id, name, displayName

    if (friends.length === 0) {
      return res.json([]);
    }

    // Step 2: Get avatar headshots for all friends
    const userIdsCSV = friends.map(f => f.id).join(',');
    const headshotRes = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userIdsCSV}&size=100x100&format=Png&isCircular=true`);
    const headshotData = await headshotRes.json();

    // Step 3: Merge avatar URLs with friend info
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
    console.error('[Error]', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Check Friend Requsts
router.get('/api/me/friend-requests', async (req, res) => {
  try {
    const allUsers = [];
    let cursor = null;

    // Fetch all pages of friend requests
    while (true) {
      const url = new URL('https://friends.roblox.com/v1/my/friends/requests');
      if (cursor) url.searchParams.set('cursor', cursor);

      const response = await fetch(url.toString(), {
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `.ROBLOSECURITY=${RBLX_KEY}`
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

      const data = await response.json();
      const users = data.data || [];
      allUsers.push(...users);

      cursor = data.nextPageCursor;
      if (!cursor) break;
    }

    // Get userIds to fetch headshots
    const userIds = allUsers.map(u => u.id);
    const userIdChunks = [];

    // Split into chunks of 100 (API limit)
    for (let i = 0; i < userIds.length; i += 100) {
      userIdChunks.push(userIds.slice(i, i + 100));
    }

    let avatarResults = [];

    // Fetch avatars in chunks
    for (const chunk of userIdChunks) {
      const headshotRes = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${chunk.join(',')}&size=100x100&format=Png&isCircular=true`);
      const headshotData = await headshotRes.json();
      avatarResults.push(...(headshotData.data || []));
    }

    // Merge avatars into users
    const enriched = allUsers.map(user => {
      const avatar = avatarResults.find(a => a.targetId === user.id);
      return {
        ...user,
        avatarUrl: avatar ? avatar.imageUrl : null
      };
    });

    res.json(enriched);
  } catch (error) {
    console.error('[Error]', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get the count of friend requests
router.get('/api/me/friend-requests/count', async (req, res) => {
  try {
    // Step 1: Get friend requests
    const response = await fetch(`https://friends.roblox.com/v1/user/friend-requests/count`, {
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `.ROBLOSECURITY=${RBLX_KEY}`
      }
    });
    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({
        error: 'Failed to fetch friend requests count.',
        status: response.status,
        body: errorText
      });
    }
    const countData = await response.json();
    res.json({ count: countData.count || 0 });
  } catch (error) {
    console.error('[Error]', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// API route to get mutual friends between two users
router.get('/api/mutual-friends/:user1/:user2', async (req, res) => {
  const userA = req.params.user1;
  const userB = req.params.user2;

  if (!userA || !userB) {
    return res.status(400).json({ error: 'Missing user1 or user2 in URL parameters.' });
  }

  try {
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
    console.error('Error fetching mutual friends:', err); // 👈 this helps
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