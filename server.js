const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const http = require('http');
const NodeCache = require('node-cache');
require('dotenv').config();

const app = express();
app.use(express.json());

const PORT = 3000;
const RBLX_KEY = process.env.RBLX_KEY;

app.use(express.static(path.join(__dirname, 'html')));

const cache = new NodeCache({ stdTTL: 60, checkperiod: 120 });
let loggedInUser = null;

// Optional: Log cache activity for debugging
cache.on('set', (key) => console.log(`[CACHE SET] ${key}`));
cache.on('del', (key) => console.log(`[CACHE DEL] ${key}`));
cache.on('expired', (key) => console.log(`[CACHE EXPIRED] ${key}`));

// Helper to fetch with caching and error logging
async function fetchWithCache(cacheKey, url, options = {}, ttl = 60) {
  try {
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const res = await fetch(url, options);
    if (!res.ok) {
      const errMsg = `Fetch failed: ${res.status} ${res.statusText} for URL: ${url}`;
      console.error(`[ERROR] ${errMsg}`);
      throw new Error(errMsg);
    }

    const data = await res.json();
    cache.set(cacheKey, data, ttl);
    return data;
  } catch (error) {
    console.error(`[ERROR] fetchWithCache error for key "${cacheKey}":`, error);
    throw error; // rethrow so caller knows
  }
}

// Get authenticated user with error logging
async function getLoggedInUser() {
  try {
    const data = await fetchWithCache(
      'loggedInUser',
      'https://users.roblox.com/v1/users/authenticated',
      {
        headers: {
          'Cookie': `.ROBLOSECURITY=${RBLX_KEY}`,
        }
      },
      300 // 5 min TTL
    );
    return data.id;
  } catch (error) {
    console.error('[ERROR] Failed to get logged in user:', error);
    throw error;
  }
}

// Retry on port conflict
function startServer(port) {
  const server = http.createServer(app);

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
    console.log(`Visit http://localhost:${port}/ to view the homepage`);
    console.log('-------------------------------------');
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.log(`\n[${new Date().toISOString()}] ⚠️ Port ${port} is in use, trying ${port + 1}...`);
      startServer(port + 1);
    } else {
      console.error(`\n[${new Date().toISOString()}] ❌ Server error:`, error);
    }
  });
}

// Page routes
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'html', 'homepage.html')));
app.get('/users/:userId/profile', (req, res) => res.sendFile(path.join(__dirname, 'html', 'profile.html')));
app.get('/groups', (req, res) => res.sendFile(path.join(__dirname, 'html', 'group.html')));
app.get('/groups/:id', (req, res) => res.sendFile(path.join(__dirname, 'html', 'group.html')));
app.get('/game/:id', (req, res) => res.sendFile(path.join(__dirname, 'html', 'game.html')));
app.get('/friends', (req, res) => res.sendFile(path.join(__dirname, 'html', 'friends.html')));

// Start main app
(async () => {
  try {
    loggedInUser = await getLoggedInUser();
    console.log(`✅ Logged in as user ID: ${loggedInUser}`);
    console.log('-------------------------------------');

    // Load routes
    console.log('Loading Account Settings routes...');
    app.use('/', require('./server/routes/account-settings')({ RBLX_KEY, loggedInUser }));
    console.log('✅ Account Settings routes loaded');

    console.log('Loading Economy routes...');
    app.use('/', require('./server/routes/ecomony')({ RBLX_KEY, loggedInUser }));
    console.log('✅ Economy routes loaded');

    console.log('Loading Friends routes...');
    app.use('/', require('./server/routes/friends')({ RBLX_KEY, loggedInUser }));
    console.log('✅ Friends routes loaded');

    console.log('Loading Games routes...');
    app.use('/', require('./server/routes/games')({ RBLX_KEY, loggedInUser }));
    console.log('✅ Games routes loaded');

    console.log('Loading Group routes...');
    app.use('/', require('./server/routes/groups')({ RBLX_KEY, loggedInUser }));
    console.log('✅ Groups routes loaded');

    console.log('Loading Thumbnail routes...');
    app.use('/', require('./server/routes/thumbnails')({ RBLX_KEY, loggedInUser }));
    console.log('✅ Thumbnails routes loaded');

    console.log('Loading User routes...');
    app.use('/', require('./server/routes/users')({ RBLX_KEY, loggedInUser }));
    console.log('✅ User routes loaded');

    // Initialize advanced features
    console.log('Initializing Advanced Friend Features...');
    app.use('/', require('./server/advanced-friend-features')({ RBLX_KEY, loggedInUser }));
    console.log('✅ Friend history initialized');

    console.log('Initializing Advanced Game Features...');
    app.use('/', require('./server/advanced-game-features')({ RBLX_KEY, loggedInUser }));
    console.log('✅ Game history initialized');

    // Start server
    startServer(PORT);

  } catch (err) {
    console.error('❌ Error initializing server:', err);
    process.exit(1);
  }
})();