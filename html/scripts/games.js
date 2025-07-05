async function loadGame() {
      // Get the last non-empty segment as gameId
      const pathParts = window.location.pathname.split('/').filter(Boolean);
      const gameId = pathParts[pathParts.length - 1];
      const gameDiv = document.getElementById('game');

      try {
        const res = await fetch(`/api/game/${gameId}`);
        const game = await res.json();

        if (game.error) {
          gameDiv.innerHTML = `<p style="color:red;">${game.error}</p>`;
          return;
        }

        const likePercent = game.downVotes + game.upVotes > 0
          ? Math.round((game.upVotes / (game.upVotes + game.downVotes)) * 100)
          : 'N/A';

        // Fallbacks for missing data
        const thumbnail = game.thumbnail || 'https://tr.rbxcdn.com/1e8b6e6b9b6b6b6b6b6b6b6b6b6b6b6b/420/420/Image/Png';
        const creator = typeof game.creator === 'object' ? (game.creator.name || 'Unknown') : (game.creator || 'Unknown');
        const playerCount = typeof game.playerCount === 'number' ? game.playerCount : 'N/A';

        gameDiv.innerHTML = `
          <div class="game-header">
            <img class="game-thumbnail" src="${thumbnail}" alt="Game Thumbnail" />
            <div class="game-info">
              <div class="game-title">${game.name || 'Unknown Game'}</div>
              <div class="game-creator">by ${creator}</div>

              <div class="game-buttons">
                <button id="playBtn" class="action-btn">Play</button>
                <button class="game-btn">Favorite</button>
              </div>

              <div class="game-stats">
                👥 ${playerCount} Players<br>
                👍 ${likePercent}% Like Ratio
              </div>
            </div>
          </div>

          <div class="game-description">${game.description || 'No description available.'}</div>
        `;

        // Add event listener to Play button
        const playBtn = document.getElementById('playBtn');
        if (playBtn) {
          playBtn.addEventListener('click', () => {
            const robloxURL = `roblox://placeId=${game.placeId}`;
            window.location.href = robloxURL;
          });
        }
      } catch (err) {
        gameDiv.innerHTML = `<p style="color:red;">Failed to load game data.</p>`;
        console.error(err);
      }
    }

    document.addEventListener('DOMContentLoaded', loadGame);