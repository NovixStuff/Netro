document.addEventListener('DOMContentLoaded', async () => {
  const tabContent = document.getElementById('tab-content');

  tabContent.innerHTML = '';

  let currentProfile;

  try {
    const res = await fetch('/api/me');
    currentProfile = await res.json();

    if (!currentProfile || !currentProfile.userId) {
      tabContent.innerHTML = '<p style="color:#f44;">No valid profile or user ID.</p>';
      return;
    }

    renderProfile(currentProfile);
    await renderFriends(currentProfile); // Handles both best and normal friends
    await renderRecentlyPlayedGames();
  } catch (e) {
    tabContent.innerHTML = '<p style="color:#f44;">Failed to load profile data.</p>';
    console.error(e);
  }

  function renderProfile(profile) {
    const section = document.createElement('section');
    section.innerHTML = `
      <h2>Welcome, ${profile.displayName || profile.name}!</h2>
    `;
    tabContent.appendChild(section);
  }

  async function renderRecentlyPlayedGames() {
    const container = document.createElement('section');
    container.innerHTML = `
      <h2 style="margin-top: 40px;">Recently Played Games</h2>
      <div class="game-list" style="display: flex; flex-wrap: wrap; gap: 16px;"></div>
    `;
    tabContent.appendChild(container);

    const list = container.querySelector('.game-list');

    try {
      const historyRes = await fetch('/api/game-history');
      const gameHistory = await historyRes.json();

      if (!Array.isArray(gameHistory) || gameHistory.length === 0) {
        list.innerHTML = `<p>No recently played games found.</p>`;
        return;
      }

      const placeIds = [...new Set(gameHistory.map(g => g.placeId))];
      if (placeIds.length === 0) {
        list.innerHTML = `<p>No valid game IDs found.</p>`;
        return;
      }

      const infoRes = await fetch(`/api/game/simple-info/${placeIds.join(',')}`);
      const gameInfos = await infoRes.json();

      placeIds.forEach(placeId => {
        const game = gameInfos[placeId];
        if (!game) return;

        const card = document.createElement('a');
        card.href = `/game/${placeId}`;
        card.className = 'game-card';
        card.style = `
          width: 160px;
          background: #1d1d1d;
          padding: 10px;
          border-radius: 10px;
          color: #ddd;
          text-decoration: none;
          display: flex;
          flex-direction: column;
          align-items: center;
          transition: background 0.2s;
        `;
        card.onmouseenter = () => card.style.background = '#262626';
        card.onmouseleave = () => card.style.background = '#1d1d1d';

        card.innerHTML = `
          <img src="${game.thumbnailUrl || '/default-thumb.png'}" 
               alt="${game.name}" 
               style="width: 140px; height: 140px; border-radius: 8px; object-fit: cover;" />
          <div style="margin-top: 8px; font-size: 14px; font-weight: bold; text-align: center;">${game.name}</div>
          <div style="font-size: 12px; color: #aaa;">by ${game.creatorName}</div>
        `;

        list.appendChild(card);
      });
    } catch (err) {
      console.error('Failed to load game history:', err);
      list.innerHTML = `<p style="color: red;">Failed to load game history.</p>`;
    }
  }

async function renderFriends(profile) {
  // Fetch all friends (for regular list)
  const allFriendsRes = await fetch('/api/me/friends');
  const allFriends = await allFriendsRes.json();

  // Fetch best friend IDs (raw array)
  const bestRes = await fetch('/api/friends/best-friends');
  let bestFriendIds = await bestRes.json();

  if (!Array.isArray(bestFriendIds)) {
    console.warn('Expected an array from /api/friends/best-friends, got:', bestFriendIds);
    bestFriendIds = [];
  }

  bestFriendIds = bestFriendIds.map(id => String(id)); // Ensure all are strings
  console.log('Best friend IDs:', bestFriendIds);

  // Remove best friends from regular friends
  const normalFriends = allFriends.filter(f => !bestFriendIds.includes(String(f.id)));

  // Fetch best friend profile data
  let bestFriends = [];

  try {
    if (bestFriendIds.length === 0) {
      console.warn('No best friend IDs found.');
    } else {
      const batchRes = await fetch(`/api/profile/multi/${bestFriendIds.join(',')}`);
      if (batchRes.ok) {
        const batchData = await batchRes.json();
        if (Array.isArray(batchData)) {
          bestFriends = batchData;
        }
      }

      // Fallback if batch failed
      if (bestFriends.length === 0) {
        bestFriends = await Promise.all(
          bestFriendIds.map(async id => {
            try {
              const res = await fetch(`/api/profile/${id}`);
              return res.ok ? await res.json() : null;
            } catch (err) {
              console.error(`Failed to fetch user ${id}:`, err);
              return null;
            }
          })
        );
        bestFriends = bestFriends.filter(Boolean);
      }
    }
  } catch (err) {
    console.error('Error fetching best friend profiles:', err);
  }

  console.log('Best friend profiles:', bestFriends);

  renderFriendSection('Best Friends', bestFriends);
  renderFriendSection('Friends', normalFriends);
}


  function renderFriendSection(title, friends) {
    const section = document.createElement('section');
    section.innerHTML = `
      <h2 style="margin-top: 40px;">${title}</h2>
      <div class="friend-list"></div>
    `;
    tabContent.appendChild(section);
    const list = section.querySelector('.friend-list');

    if (!friends.length) {
      list.innerHTML = `<p>No ${title.toLowerCase()} found.</p>`;
      return;
    }

    const ids = friends.map(f => f.id).join(',');
    fetch(`/api/user/presence/${ids}`)
      .then(res => res.json())
      .then(presences => {
        const presenceMap = {};
        presences.forEach(p => {
          let type = p.userPresenceType;
          if (type === null || typeof type !== 'number') {
            if (p.lastLocation === 'Website') type = 1;
            else if (p.placeId) type = 2;
            else type = 0;
          }
          p.userPresenceType = type;
          presenceMap[p.userId] = p;
        });

        const presenceSortPriority = { 2: 0, 3: 1, 1: 2, 0: 3, undefined: 4 };
        friends.sort((a, b) => {
          const aType = presenceMap[a.id]?.userPresenceType ?? 0;
          const bType = presenceMap[b.id]?.userPresenceType ?? 0;
          return presenceSortPriority[aType] - presenceSortPriority[bType];
        });

        fetch('/api/friends/last-online')
          .then(res => res.json())
          .then(lastOnlineData => {
            const placeIds = friends
              .map(f => {
                const p = presenceMap[f.id];
                return p && p.userPresenceType === 2 && p.placeId ? p.placeId : null;
              })
              .filter(Boolean);
            const uniquePlaceIds = [...new Set(placeIds)];

            if (uniquePlaceIds.length > 0) {
              fetch(`/api/game/simple-info/${uniquePlaceIds.join(',')}`)
                .then(res => res.json())
                .then(gameInfoMap => {
                  friends.forEach(friend => {
                    renderFriendCard(friend, presenceMap[friend.id], lastOnlineData[friend.id], gameInfoMap, list);
                  });
                });
            } else {
              friends.forEach(friend => {
                renderFriendCard(friend, presenceMap[friend.id], lastOnlineData[friend.id], {}, list);
              });
            }
          });
      })
      .catch(err => {
        console.error(`Failed to load presence or last online for ${title}:`, err);
        list.innerHTML = `<p style="color: red;">Failed to load ${title.toLowerCase()} presence.</p>`;
      });
  }

  function renderFriendCard(friend, presence, lastOnlineISO, gameInfoMap, container) {
    presence = presence || {};
    const presenceType = presence.userPresenceType ?? 0;
    const presenceColors = { 0: '#888888', 1: '#0078d7', 2: '#0fba00', 3: '#ff7f0f' };
    const ringColor = presenceColors[presenceType];
    const placeId = presence.placeId || null;
    const game = placeId ? gameInfoMap[String(placeId)] : null;

    function formatLastOnline(isoString) {
      if (!isoString) return 'Offline';
      const diffMs = Date.now() - new Date(isoString).getTime();
      if (diffMs < 0) return 'Just now';
      const mins = Math.floor(diffMs / (1000 * 60));
      if (mins < 1) return 'Just now';
      if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`;
      const hours = Math.floor(mins / 60);
      if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
      const days = Math.floor(hours / 24);
      return `${days} day${days === 1 ? '' : 's'} ago`;
    }

    let subText;
    if (presenceType === 2 && game) {
      subText = `Playing ${game.name.length > 18 ? game.name.slice(0, 18) + '…' : game.name}`;
    } else if (presenceType === 2) {
      subText = `Online (In-Game)`;
    } else if (presenceType === 1) {
      subText = `Online on Website`;
    } else if (presenceType === 3) {
      subText = `In Roblox Studio`;
    } else if (lastOnlineISO) {
      subText = `Last seen ${formatLastOnline(lastOnlineISO)}`;
    } else {
      subText = `Offline`;
    }

    const card = document.createElement('a');
    card.className = 'friend-card';
    card.href = `/users/${friend.id}/profile`;
    card.title = `${friend.displayName || friend.name}`;
    card.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      width: 140px;
      padding: 10px;
      background-color: #1c1c1c;
      border-radius: 10px;
      text-decoration: none;
      color: inherit;
      position: relative;
      cursor: pointer;
    `;

    card.innerHTML = `
      <div style="position: relative; width: 70px; height: 70px; margin-bottom: 6px;">
        <img
          src="${friend.avatarUrl}"
          alt="Avatar"
          style="width: 64px; height: 64px; border-radius: 50%; border: 3px solid ${ringColor}; object-fit: cover;"
        />
        ${game ? `
          <img src="${game.thumbnailUrl}" alt="Game Thumbnail" style="position: absolute; bottom: 0; right: 0; width: 28px; height: 28px; border-radius: 6px; border: 2px solid #222; object-fit: cover;" />
        ` : ''}
      </div>
      <div class="friend-name" style="font-weight: bold; color: #fff;">${friend.displayName}</div>
      <div class="friend-username" style="color: #aaa; font-size: 13px; margin-bottom: 8px;">@${friend.name}</div>
      <div style="font-size: 12px; color: #bbb; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 130px;">
        ${subText}
      </div>
    `;

    container.appendChild(card);
  }
});
