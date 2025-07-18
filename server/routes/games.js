const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const NodeCache = require('node-cache');
const cache = new NodeCache({ stdTTL: 600 }); // 10 min default TTL

module.exports = function ({ RBLX_KEY, loggedInUser }) {

  // Get universe ID with caching
  async function getUniverseIdFromPlaceId(placeId) {
    const cached = cache.get(`universe-${placeId}`);
    if (cached) return cached;

    const url = `https://apis.roblox.com/universes/v1/places/${placeId}/universe`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch universe for placeId ${placeId}`);
    const data = await res.json();
    if (!data.universeId) throw new Error('Invalid universeId response');
    
    cache.set(`universe-${placeId}`, data.universeId);
    return data.universeId;
  }

  // GET /api/game/:id (Detailed single game fetch)
  router.get('/api/game/:id', async (req, res) => {
    const placeId = req.params.id;

    try {
      const universeId = await getUniverseIdFromPlaceId(placeId);

      const cachedGame = cache.get(`game-${universeId}`);
      if (cachedGame) return res.json(cachedGame);

      const gameRes = await fetch(`https://games.roblox.com/v1/games?universeIds=${universeId}`);
      const gameData = await gameRes.json();

      if (!gameData.data || gameData.data.length === 0) {
        return res.status(404).json({ error: 'Game not found for this Universe ID' });
      }

      const game = gameData.data[0];

      const thumbRes = await fetch(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${universeId}&size=512x512&format=Png&isCircular=false`);
      const thumbData = await thumbRes.json();
      const thumbnail = thumbData.data?.[0]?.imageUrl || null;

      const result = {
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
      };

      cache.set(`game-${universeId}`, result);
      res.json(result);
    } catch (error) {
      console.error('[Error]', error.message);
      res.status(500).json({ error: 'Failed to fetch game data' });
    }
  });

  // GET /api/game/simple-info/:gameIds (Batch game fetch)
  router.get('/api/game/simple-info/:gameIds', async (req, res) => {
    const { gameIds } = req.params;

    if (!gameIds) {
      return res.status(400).json({ error: 'No game IDs provided.' });
    }

    const placeIds = gameIds
      .split(',')
      .map(id => id.trim())
      .filter(id => /^\d+$/.test(id))
      .slice(0, 100);

    if (placeIds.length === 0) {
      return res.status(400).json({ error: 'No valid numeric game IDs provided.' });
    }

    try {
      const universeIdMap = {};
      await Promise.all(
        placeIds.map(async placeId => {
          try {
            const universeId = await getUniverseIdFromPlaceId(placeId);
            universeIdMap[placeId] = universeId;
          } catch (err) {
            console.warn(`Could not get universeId for placeId ${placeId}:`, err.message);
          }
        })
      );

      const universeIds = Object.values(universeIdMap);
      if (universeIds.length === 0) {
        return res.status(500).json({ error: 'Failed to fetch any universe IDs.' });
      }

      // Use cache-aware game metadata fetch
      const freshIds = universeIds.filter(id => !cache.has(`game-${id}`));
      const gameInfos = {};
      const thumbnails = {};

      if (freshIds.length > 0) {
        const [gameRes, thumbRes] = await Promise.all([
          fetch(`https://games.roblox.com/v1/games?universeIds=${freshIds.join(',')}`),
          fetch(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${freshIds.join(',')}&size=512x512&format=Png&isCircular=false`)
        ]);

        const gameData = await gameRes.json();
        const thumbData = await thumbRes.json();

        const thumbMap = {};
        for (const item of thumbData.data) {
          thumbMap[item.targetId] = item.imageUrl;
        }

        for (const game of gameData.data) {
          const data = {
            placeId: game.rootPlaceId,
            universeId: game.id,
            name: game.name,
            playing: game.playing,
            visits: game.visits,
            creatorName: game.creator?.name || 'Unknown',
            thumbnailUrl: thumbMap[game.id] || null
          };
          cache.set(`game-${game.id}`, data);
        }
      }

      // Combine results from cache
      const result = {};
      for (const [placeId, universeId] of Object.entries(universeIdMap)) {
        const game = cache.get(`game-${universeId}`);
        if (game) {
          result[placeId] = game;
        }
      }

      res.json(result);
    } catch (err) {
      console.error('Error fetching game info:', err);
      res.status(500).json({ error: 'Failed to fetch game info from Roblox.' });
    }
  });

  return router;
};
