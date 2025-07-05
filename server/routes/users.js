const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');

module.exports = function ({ RBLX_KEY, loggedInUser }) {

// API route to get the logged-in user's profile info
router.get('/api/me/', async (req, res) => {
  
  try {
    const [userRes, followersRes, friendsRes, followingRes] = await Promise.all([
      fetch(`https://users.roblox.com/v1/users/${loggedInUser}`),
      fetch(`https://friends.roblox.com/v1/users/${loggedInUser}/followers/count`),
      fetch(`https://friends.roblox.com/v1/users/${loggedInUser}/friends/count`),
      fetch(`https://friends.roblox.com/v1/users/${loggedInUser}/followings/count`)
    ]);

    if (!userRes.ok || !followersRes.ok || !friendsRes.ok || !followingRes.ok) {
      return res.status(404).json({ error: 'Failed to fetch some data from Roblox API.' });
    }

    const user = await userRes.json();
    const userId = loggedInUser;
    const followers = await followersRes.json();
    const friends = await friendsRes.json();
    const following = await followingRes.json();

    // 🔁 Fetch avatar headshot for main user
    const headshotRes = await fetch(
      `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${loggedInUser}&size=150x150&format=Png&isCircular=true`
    );
    const headshotData = await headshotRes.json();
    const avatarUrl = headshotData.data[0]?.imageUrl || '';

    res.json({
      name: user.name,
      displayName: user.displayName,
      description: user.description || '',
      userId: userId,
      avatarUrl,
      followers: followers.count || 0,
      friends: friends.count || 0,
      following: following.count || 0,
      created: user.created,
    });
  } catch (error) {
    console.error('[Error]', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});    

// API route to get user profile info by ID
router.get('/api/profile/:userId', async (req, res) => {
  const userId = req.params.userId;

  try {
    const [userRes, followersRes, friendsRes, followingRes] = await Promise.all([
      fetch(`https://users.roblox.com/v1/users/${userId}`),
      fetch(`https://friends.roblox.com/v1/users/${userId}/followers/count`),
      fetch(`https://friends.roblox.com/v1/users/${userId}/friends/count`),
      fetch(`https://friends.roblox.com/v1/users/${userId}/followings/count`)
    ]);

    if (!userRes.ok || !followersRes.ok || !friendsRes.ok || !followingRes.ok) {
      return res.status(404).json({ error: 'Failed to fetch some data from Roblox API.' });
    }

    const user = await userRes.json();
    const followers = await followersRes.json();
    const friends = await friendsRes.json();
    const following = await followingRes.json();

    // 🔁 Fetch avatar headshot for main user
    const headshotRes = await fetch(
      `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=true`
    );
    const headshotData = await headshotRes.json();
    const avatarUrl = headshotData.data[0]?.imageUrl || '';

    // 🔍 Mutual Friends
    let mutualFriends = [];
    if (loggedInUser) {
      const [targetFriendsRes, viewerFriendsRes] = await Promise.all([
        fetch(`https://friends.roblox.com/v1/users/${userId}/friends`),
        fetch(`https://friends.roblox.com/v1/users/${loggedInUser}/friends`)
      ]);

      const [targetFriendsJson, viewerFriendsJson] = await Promise.all([
        targetFriendsRes.json(),
        viewerFriendsRes.json()
      ]);

      const targetFriends = Array.isArray(targetFriendsJson.data) ? targetFriendsJson.data : [];
      const viewerFriendIds = new Set(
        Array.isArray(viewerFriendsJson.data) ? viewerFriendsJson.data.map(f => f.id) : []
      );

      const mutualList = targetFriends.filter(friend => viewerFriendIds.has(friend.id));
      const mutualIds = mutualList.map(f => f.id);

      if (mutualIds.length > 0) {
        const mutualHeadshotRes = await fetch(
          `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${mutualIds.join(',')}&size=100x100&format=Png&isCircular=true`
        );
        const mutualHeadshotData = await mutualHeadshotRes.json();

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
    console.error('[Error]', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// API route to get a user's presence
router.get('/api/user/presence/:userId', async (req, res) => {
  const userId = req.params.userId;

  try {
    const response = await fetch('https://presence.roblox.com/v1/presence/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `.ROBLOSECURITY=${RBLX_KEY}`,
      },
      body: JSON.stringify({ userIds: [parseInt(userId)] }),
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch user presence.' });
    }

    const data = await response.json();

    if (!data || !data.userPresences || data.userPresences.length === 0) {
      return res.status(404).json({ error: 'User presence not found.' });
    }

    const presence = data.userPresences[0];

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
    console.error('[Error]', error);
    res.status(500).json({ error: 'Failed to fetch user presence.' });
  }
});

    
return router;
};