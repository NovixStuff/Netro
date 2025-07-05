function getUserIdFromURL() {
  const parts = window.location.pathname.split('/');
  return parts[2];
}

function formatDate(iso) {
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

// Close dropdown if clicked outside
document.addEventListener('click', (e) => {
  const dropdown = document.getElementById('dropdown');
  if (!dropdown) return;
  if (!dropdown.contains(e.target)) {
    dropdown.classList.remove('show');
  }
});

async function loadProfile() {
  const userId = getUserIdFromURL();
  const profileDiv = document.getElementById('profile');

  let friendStatus = null;
  let gameStatus = null;
  let presenceStatus = null;

  try {
    // Fetch profile info
    const res = await fetch(`/api/profile/${userId}`);
    const profileRes = await res.json();

    if (profileRes.error) {
      profileDiv.innerHTML = `<p>Error: ${profileRes.error}</p>`;
      return;
    }

    // Fetch presence data
    try {
      const presenceRes = await fetch(`/api/user/presence/${userId}`); // note singular 'user' to match your router
      presenceStatus = await presenceRes.json();
    } catch (e) {
      console.warn('Failed to fetch presence data:', e);
      presenceStatus = null;
    }

    // Fetch friendStatus and gameStatus in parallel
    try {
      const [friendRes, gameRes] = await Promise.all([
        fetch(`/api/is-friends/${userId}`),
        fetch(`/api/user/presence/${userId}`)
      ]);
      friendStatus = await friendRes.json();
      gameStatus = await gameRes.json();
    } catch (e) {
      console.warn('Failed to load friend or game status:', e);
    }

    // Build presence display text
    let presenceText = '';
    if (presenceStatus) {
      if (presenceStatus.userPresenceType === 'Online') {
        presenceText = 'Online';
        if (presenceStatus.lastLocation) {
          presenceText += ` - In game: ${presenceStatus.lastLocation}`;
        }
      } else if (presenceStatus.userPresenceType === 'Offline') {
        presenceText = 'Offline';
      } else {
        presenceText = presenceStatus.userPresenceType || 'Unknown';
      }
    }

    profileDiv.innerHTML = `
      <div class="profile-header">
        <div class="profile-left">
          <div style="display: flex; flex-direction: column; align-items: center;">
            <img class="avatar" src="${profileRes.avatarUrl}" alt="Avatar" />
          </div>
          <div class="user-info">
            <div class="display-name">${profileRes.displayName}</div>
            <div class="username">@${profileRes.name} ${presenceText ? `<span style="font-size: 14px; color: #66ff66; margin-left: 8px;">(${presenceText})</span>` : ''}</div>
            <div class="stats">
              <div>${profileRes.friends} Friends</div>
              <div>${profileRes.mutualFriendCount} Mutual</div>
              <div>${profileRes.followers} Followers</div>
              <div>${profileRes.following} Following</div>
            </div>
          </div>
        </div>
        <div class="profile-actions">
          <div class="action-buttons" id="action-buttons"></div>
          <div class="dropdown-wrapper" id="dropdown">
            <div class="dropdown-trigger" aria-label="More options" role="button" tabindex="0">⋯</div>
            <div class="dropdown-menu" role="menu" aria-hidden="true">
              <div class="dropdown-item" id="blockUserBtn" role="menuitem" tabindex="0">Block User</div>
              <a class="dropdown-item" href="https://www.roblox.com/users/${profileRes.id}/profile" target="_blank" rel="noopener" role="menuitem" tabindex="0">View on Roblox</a>
            </div>
          </div>
        </div>
      </div>

      <div class="tab-bar">
        <div class="tab active">About</div>
        <div class="tab">Creations</div>
      </div>

      <div class="section">
        <h2>About</h2>
        <div class="description">${profileRes.description || 'No description set.'}</div>
        <div class="meta">Joined on ${formatDate(profileRes.created)}</div>
      </div>
    `;

    // Dropdown toggle
    const dropdownTrigger = document.querySelector('.dropdown-trigger');
    const dropdownWrapper = document.getElementById('dropdown');
    dropdownTrigger.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent triggering document click handler
      dropdownWrapper.classList.toggle('show');
    });
    dropdownTrigger.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        dropdownWrapper.classList.toggle('show');
      }
    });

    const actionButtons = document.getElementById('action-buttons');
    actionButtons.innerHTML = '';

    function createButton(id, text) {
      const btn = document.createElement('button');
      btn.id = id;
      btn.className = 'action-btn';
      btn.textContent = text;
      return btn;
    }

    if ((gameStatus && gameStatus.inGame && gameStatus.joinUrl) || (presenceStatus && presenceStatus.lastLocation)) {
      const joinBtn = createButton('joinBtn', 'Join');
      joinBtn.onclick = () => {
        if (gameStatus && gameStatus.joinUrl) {
          window.open(gameStatus.joinUrl, '_blank');
        } else {
          alert('Join URL not available');
        }
      };
      actionButtons.appendChild(joinBtn);
    }

    if (friendStatus) {
      if (friendStatus.isFriend) {
        const unfriendBtn = createButton('unfriendBtn', 'Unfriend');
        unfriendBtn.onclick = async () => {
          if (!confirm('Are you sure you want to unfriend this user?')) return;
          try {
            const res = await fetch(`/api/unfriend/${profileRes.id}`, { method: 'POST' });
            const data = await res.json();
            if (data.success) {
              alert('User unfriended.');
              unfriendBtn.remove();
              actionButtons.appendChild(createButton('friendBtn', 'Friend'));
            } else {
              alert('Failed to unfriend user.');
            }
          } catch {
            alert('Failed to unfriend user.');
          }
        };
        actionButtons.appendChild(unfriendBtn);
      } else if (friendStatus.hasPendingRequest) {
        const cancelReqBtn = createButton('friendReqCancelBtn', 'Cancel Request');
        cancelReqBtn.onclick = async () => {
          if (!confirm('Cancel the pending friend request?')) return;
          try {
            const res = await fetch(`/api/cancel-friend-request/${profileRes.id}`, { method: 'POST' });
            const data = await res.json();
            if (data.success) {
              alert('Friend request cancelled.');
              cancelReqBtn.remove();
              actionButtons.appendChild(createButton('friendBtn', 'Friend'));
            } else {
              alert('Failed to cancel friend request.');
            }
          } catch {
            alert('Failed to cancel friend request.');
          }
        };
        actionButtons.appendChild(cancelReqBtn);
      } else {
        const friendBtn = createButton('friendBtn', 'Friend');
        friendBtn.onclick = async () => {
          try {
            const res = await fetch(`/api/friend/${profileRes.id}`, { method: 'POST' });
            const data = await res.json();
            if (data.success) {
              alert('Friend request sent.');
              friendBtn.remove();
              const cancelReqBtn = createButton('friendReqCancelBtn', 'Cancel Request');
              cancelReqBtn.onclick = async () => {
                if (!confirm('Cancel the pending friend request?')) return;
                try {
                  const res = await fetch(`/api/cancel-friend-request/${profileRes.id}`, { method: 'POST' });
                  const data = await res.json();
                  if (data.success) {
                    alert('Friend request cancelled.');
                    cancelReqBtn.remove();
                    actionButtons.appendChild(createButton('friendBtn', 'Friend'));
                  } else {
                    alert('Failed to cancel friend request.');
                  }
                } catch {
                  alert('Failed to cancel friend request.');
                }
              };
              actionButtons.appendChild(cancelReqBtn);
            } else {
              alert('Failed to send friend request.');
            }
          } catch {
            alert('Failed to send friend request.');
          }
        };
        actionButtons.appendChild(friendBtn);
      }
    } else {
      const friendBtn = createButton('friendBtn', 'Friend');
      friendBtn.onclick = async () => {
        try {
          const res = await fetch(`/api/friend/${profileRes.id}`, { method: 'POST' });
          const data = await res.json();
          if (data.success) {
            alert('Friend request sent.');
            friendBtn.remove();
          } else {
            alert('Failed to send friend request.');
          }
        } catch {
          alert('Failed to send friend request.');
        }
      };
      actionButtons.appendChild(friendBtn);
    }

    // Block user button
    document.getElementById('blockUserBtn').addEventListener('click', async () => {
      if (!confirm('Are you sure you want to block this user?')) return;
      try {
        const res = await fetch(`/api/block/${profileRes.id}`, { method: 'POST' });
        const data = await res.json();
        alert(data.success ? 'User blocked.' : 'Failed to block user.');
      } catch {
        alert('Failed to block user.');
      }
    });

  } catch (err) {
    profileDiv.innerHTML = 'Failed to load profile.';
    console.error(err);
  }
}

loadProfile();
