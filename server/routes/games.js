const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');

module.exports = function ({ RBLX_KEY, loggedInUser }) {

// API route to get game info by Place ID
router.get('/api/game/:id', async (req, res) => {
  const placeId = req.params.id;

  try {
    // Step 1: Get Universe ID from Place ID
    const uniRes = await fetch(`https://apis.roblox.com/universes/v1/places/${placeId}/universe`);
    const uniData = await uniRes.json();

    if (!uniData.universeId) {
      return res.status(404).json({ error: 'Universe ID not found for this Place ID' });
    }

    const universeId = uniData.universeId;

    // Step 2: Get Game Info by Universe ID
    const gameRes = await fetch(`https://games.roblox.com/v1/games?universeIds=${universeId}`);
    const gameData = await gameRes.json();

    if (!gameData.data || gameData.data.length === 0) {
      return res.status(404).json({ error: 'Game not found for this Universe ID' });
    }

    const game = gameData.data[0];

    // Step 3: Get Game Icon/Thumbnail
    const thumbRes = await fetch(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${universeId}&size=512x512&format=Png&isCircular=false`);
    const thumbData = await thumbRes.json();
    const thumbnail = thumbData.data?.[0]?.imageUrl || null;

    // ✅ Respond with game info
    res.json({
      universeId,
      placeId,
      name: game.name,
      description: game.description,
      creator: game.creator?.name || 'Unknown',
      playing: game.playing,
      visits: game.visits,
      maxPlayers: game.maxPlayers,
      upVotes: game.upVotes,
      downVotes: game.downVotes,
      thumbnail
    });

  } catch (error) {
    console.error('[Error]', error.message);
    res.status(500).json({ error: 'Failed to fetch game data' });
  }
});
    
return router;
};