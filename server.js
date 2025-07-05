const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const app = express();
const http = require('http');
require('dotenv').config();

app.use(express.json());

// Port that you run the server on
const PORT = 3000;

app.use(express.static(path.join(__dirname, 'html')));

const RBLX_KEY = process.env.RBLX_KEY; // Gets your .ROBLOXSECURITY cookie from your .env file
let loggedInUser = null;

app.use(express.json()); // For parsing JSON request bodies

// This gets the user ID of your profile by your .ROBLOXSECURITY cookie
async function getLoggedInUser() {
  const response = await fetch('https://users.roblox.com/v1/users/authenticated', {
    headers: {
      'Cookie': `.ROBLOSECURITY=${RBLX_KEY}`,
    }
  });

  if (!response.ok) {
    throw new Error('Failed to get logged in user.');
  }

  const data = await response.json();
  return data.id; // Only return the user ID
}

// Start server with retry on port conflict
function startServer(port) {
  const server = http.createServer(app); // ✅ define server here

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
    console.log(`Visit http://localhost:${port}/ to view the homepage`);
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.log(`\n[${getTimestamp()}] ⚠️ Port ${port} is in use, trying ${port + 1}...`);
      startServer(port + 1); // Try next port
    } else {
      console.error(`\n[${getTimestamp()}] ❌ Server error:`, error);
    }
  });
}

// Serve the homepage at /
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'html', 'homepage.html'));
});

// Route to serve the profile page at /users/:userId/profile
app.get('/users/:userId/profile', (req, res) => {
  res.sendFile(path.join(__dirname, 'html', 'profile.html'));
});

app.get('/groups', (req, res) => {
  res.sendFile(path.join(__dirname, 'html', 'group.html'));
});

// Route to server the gorup page at /groups/:id
app.get('/groups/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'html', 'group.html'));
});

// Route to serve the game page at /game/:id
app.get('/game/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'html', 'game.html'));
});

// Route to load your friends list, friends requests, and friends history/
app.get('/friends', (req, res) => {
  res.sendFile(path.join(__dirname, 'html', 'friends.html'));
});

// Main async block
(async () => {
  try {
    loggedInUser = await getLoggedInUser();
    console.log(`✅ Logged in as user ID: ${loggedInUser}`);
    console.log('-------------------------------------');

    // =========================
    //        Routes
    // =========================

    // Load account settings routes
    console.log('Loading Acount Settings routes...');
    app.use('/', require('./server/routes/account-settings')({ RBLX_KEY, loggedInUser }));
    console.log('✅ Account Settings routes loaded successfully');
    console.log('-------------------------------------');

    // Load account settings routes
    console.log('Loading Ecomony routes...');
    app.use('/', require('./server/routes/ecomony')({ RBLX_KEY, loggedInUser }));
    console.log('✅ Ecomony routes loaded successfully');
    console.log('-------------------------------------');

    // Load friends routes
    console.log('Loading friends routes...');
    app.use('/', require('./server/routes/friends')({ RBLX_KEY, loggedInUser }));
    console.log('✅ Friends routes loaded successfully');
    console.log('-------------------------------------');

    // Load games routes
    console.log('Loading Games routes...');
    app.use('/', require('./server/routes/games')({ RBLX_KEY, loggedInUser }));
    console.log('✅ Game routes loaded successfully');
    console.log('-------------------------------------');

    // Load group routes
    console.log('Loading Group routes...');
    app.use('/', require('./server/routes/groups')({ RBLX_KEY, loggedInUser }));
    console.log('✅ Game groups loaded successfully');
    console.log('-------------------------------------');

    // Load thumbnail routes
    console.log('Loading thumbnail routes...');
    app.use('/', require('./server/routes/thumbnails')({ RBLX_KEY, loggedInUser }));
    console.log('✅ Thumbnail routes loaded successfully');
    console.log('-------------------------------------');

    // Load user routes
    console.log('Loading User routes...');
    app.use('/', require('./server/routes/users')({ RBLX_KEY, loggedInUser }));
    console.log('✅ User routes loaded successfully');
    console.log('-------------------------------------');

    // =========================
    //       Servers
    // =========================

    // Initialize friend history
    console.log('Initializing Advanced Friend Features...');
    app.use('/', require('./server/advanced-friend-features')({ RBLX_KEY, loggedInUser }));
    console.log('✅ Friend history initialized successfully');
    console.log('-------------------------------------');

    console.log('Initializing Advanced Game Features...');
    app.use('/', require('./server/advanced-game-features')({ RBLX_KEY, loggedInUser }));
    console.log('✅ Game History initialized successfully');
    console.log('-------------------------------------');

    // Start the server with error handling
    startServer(PORT);

  } catch (err) {
    console.error('❌ Error getting logged in user or starting server:', err.message);
    process.exit(1);
  }
})();