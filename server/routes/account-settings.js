const express = require('express');
const fetch = require('node-fetch');
const router = express.Router();

module.exports = function ({ RBLX_KEY, loggedInUser }) {

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

// Blocking user route
router.post('/api/block/:userId', async (req, res) => {
  const userId = req.params.userId;
  const blockUrl = `https://accountsettings.roblox.com/v1/users/${userId}/block`;

  try {
    // Step 1: Get CSRF token
    const csrfToken = await getCSRFToken();

    // Step 2: Block user
    const response = await fetch(blockUrl, {
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
        error: 'Failed to block user.',
        status: response.status,
        body: errorText
      });
    }

    res.json({ message: `User ${userId} blocked successfully.` });
  } catch (error) {
    console.error('[Block Error]', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// API route to get the list of blocked users, returns display names, usernames, user IDs, and avatars
router.get('/api/block/users', async (req, res) => {
  const CSRF = await getCSRFToken();
  const RBLX_KEY = process.env.RBLX_KEY;

  try {
    const response = await fetch('https://accountsettings.roblox.com/v1/users/get-detailed-blocked-users', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `.ROBLOSECURITY=${RBLX_KEY}`,
        'x-csrf-token': CSRF
      }
    });

    const rawText = await response.text();

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'Failed to fetch blocked users.',
        status: response.status,
        body: rawText
      });
    }

    let data;
    try {
      data = JSON.parse(rawText);
    } catch (parseError) {
      console.error('[JSON Parse Error]', parseError);
      return res.status(500).json({ error: 'Failed to parse JSON response from Roblox' });
    }

    if (!data || !Array.isArray(data.blockedUsers)) {
      console.error('[Malformed Response]', data);
      return res.status(502).json({ error: 'Unexpected response format from Roblox', raw: data });
    }

    const blockedUsers = data.blockedUsers.map(user => ({
      ...user,
      avatar: `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${user.userId}&size=150x150&format=Png&isCircular=true`
    }));

    res.json({
      blockedUsers,
      maxBlockedUsers: data.maxBlockedUsers || null,
      total: data.total || blockedUsers.length
    });
  } catch (error) {
    console.error('[Fetch Blocked Users Error]', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// API route to change the about section of the logged-in user
router.post('/api/change-about/', async (req, res) => {
  const RBLX_KEY = process.env.RBLX_KEY; // Or wherever you store it
  if (!RBLX_KEY) return res.status(500).json({ error: 'Server missing ROBLOSECURITY token.' });

  const about = req.body.about;
  if (typeof about !== 'string') return res.status(400).json({ error: 'Missing or invalid about text.' });

  try {
    const csrfToken = await getCSRFToken(RBLX_KEY);
    console.log('[DEBUG] CSRF Token:', csrfToken);

    const response = await fetch('https://accountinformation.roblox.com/v1/description', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `.ROBLOSECURITY=${RBLX_KEY}`,
        'x-csrf-token': csrfToken
      },
      body: JSON.stringify({ description: about })
    });

    const text = await response.text();

    if (!response.ok) {
      console.error('[ERROR] Failed to update bio:', response.status, text);
      return res.status(response.status).json({
        error: 'Failed to change about section.',
        status: response.status,
        body: text
      });
    }

    console.log('[SUCCESS] Bio updated:', text || '(no response body)');
    res.json({ success: true });
  } catch (err) {
    console.error('[EXCEPTION] Error updating bio:', err);
    res.status(500).json({ error: 'Server error changing about section.', details: err.message });
  }
});

return router;
};