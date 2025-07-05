const express = require('express');
const fetch = require('node-fetch');
const router = express.Router();

module.exports = function ({ RBLX_KEY, loggedInUser }) {

// API route to get the logged-in user's Robux balance
router.get('/api/robux', (req, res) => {
  if (!loggedInUser) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  // Fetch the user's Robux balance
  fetch(`https://economy.roblox.com/v1/user/currency`, {
    headers: {
      'Cookie': `.ROBLOSECURITY=${RBLX_KEY}`,
    }
  })
  .then(response => {
    if (!response.ok) {
      throw new Error('Failed to fetch Robux balance');
    }
    return response.json();
    })
    .then(data => {
      res.json({
        robux: data.robux || 0,
      });
    })
    .catch(error => {
      console.error('[Robux Error]', error.message);
      res.status(500).json({ error: 'Internal server error' });
    });
});

return router;
};