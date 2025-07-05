const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

// Save cache inside /data/thumbnail-cache relative to this file
const CACHE_DIR = path.join(__dirname, 'thumbnail-cache');

module.exports = function ({ RBLX_KEY, loggedInUser }) {

// Ensure cache directory exists (recursive creation)
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

// Utility functions
function getCachePath(userId, size) {
  return path.join(CACHE_DIR, `${userId}_${size}.png`);
}

function getPublicUrl(req, userId, size) {
  // Make sure the URL matches your route
  return `${req.protocol}://${req.get('host')}/api/thumbnail/user/${userId}?size=${size}`;
}

async function fetchAndCacheThumbnail(userId, size = '100x100') {
  const apiUrl = `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=${size}&format=Png&isCircular=true`;
  const res = await fetch(apiUrl);
  const data = await res.json();

  if (!data?.data?.[0]?.imageUrl) {
    throw new Error('Thumbnail URL not found');
  }

  const imgUrl = data.data[0].imageUrl;
  const imgRes = await fetch(imgUrl);
  const buffer = await imgRes.buffer();

  const cachePath = getCachePath(userId, size);
  fs.writeFileSync(cachePath, buffer);
  return cachePath;
}

// Single user thumbnail endpoint (serves image file)
router.get('/thumbnail/user/:userId', async (req, res) => {
  const userId = req.params.userId;
  const size = req.query.size || '100x100';
  const cachePath = getCachePath(userId, size);

  try {
    if (fs.existsSync(cachePath)) {
      return res.sendFile(cachePath);
    }

    const filePath = await fetchAndCacheThumbnail(userId, size);
    res.sendFile(filePath);
  } catch (err) {
    console.error('[Thumbnail Error]', err.message);
    res.status(500).json({ error: 'Failed to fetch thumbnail' });
  }
});

// Multiple user thumbnails endpoint (returns JSON)
router.get('/thumbnails/user/', async (req, res) => {
  const userIds = req.query.userIds?.split(',') || [];
  const size = req.query.size || '100x100';

  if (userIds.length === 0) {
    return res.status(400).json({ error: 'No userIds provided.' });
  }

  const results = [];

  await Promise.all(userIds.map(async (userId) => {
    const cachePath = getCachePath(userId, size);
    try {
      if (!fs.existsSync(cachePath)) {
        await fetchAndCacheThumbnail(userId, size);
      }

      results.push({
        userId,
        imageUrl: getPublicUrl(req, userId, size),
      });
    } catch (err) {
      console.error(`[Thumbnail Error] ${userId}`, err.message);
      results.push({ userId, error: 'Failed to fetch thumbnail' });
    }
  }));

  res.json(results);
});

return router;
};
