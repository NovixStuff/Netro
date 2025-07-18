function getUserIdFromURL() {
  const parts = window.location.pathname.split('/');
  return parts[2];
}

function formatDate(iso) {
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
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
  if (!profileDiv) {
    console.error('No element with id "profile" found.');
    return;
  }

  let friendStatus = null;
  let presenceStatus = null;
  let presenceClass = 'presence-offline';
  let joinUrl = null;
  let loggedInUser = null;
  let lastOnlineDate = null; // <-- new variable for last online date
  let bestFriends = [];

  try {
    const authRes = await fetch('/api/auth');
    if (authRes.ok) {
      const authData = await authRes.json();
      loggedInUser = authData.id;
    }
  } catch (e) {
    console.warn('Not logged in');
  }

  try {
    // Fetch profile info
    const res = await fetch(`/api/profile/${userId}`);
    const profileRes = await res.json();

    if (profileRes.error) {
      profileDiv.innerHTML = `<p>Error: ${profileRes.error}</p>`;
      return;
    }

    // Fetch presence info and friend status
    try {
      const presenceRes = await fetch(`/api/user/presence/${userId}`);
      const presenceArray = await presenceRes.json();
      presenceStatus = presenceArray.length > 0 ? presenceArray[0] : null;

      friendStatus = {
        isFriend: profileRes.isFriend || false,
        hasPendingRequest: profileRes.hasPendingRequest || false,
      };
    } catch (e) {
      console.warn('Failed to load presence or friend status:', e);
      friendStatus = { isFriend: false, hasPendingRequest: false };
    }

    // Fetch last online info from your API if user is friend
    if (friendStatus.isFriend) {
      try {
        const lastOnlineRes = await fetch('/api/friends/last-online');
        if (lastOnlineRes.ok) {
          const lastOnlineData = await lastOnlineRes.json();
          const lastOnlineTimestamp = lastOnlineData[userId];
          if (lastOnlineTimestamp) {
            lastOnlineDate = new Date(lastOnlineTimestamp);
          }
        }
      } catch (e) {
        console.warn('Failed to load last online info:', e);
      }
    }

    // Fetch best friends list (only if logged in)
    if (loggedInUser) {
      try {
        const bestRes = await fetch('/api/friends/best-friends');
        const bestData = await bestRes.json();
        bestFriends = bestData.bestFriends || [];
      } catch (e) {
        console.warn('Failed to load best friends list:', e);
      }
    }

    // Determine presence text and ring class
    const presenceMap = {
      0: 'Offline',
      1: 'Online',
      2: 'In Game',
      3: 'In Studio',
    };
    const presenceText = presenceMap[presenceStatus?.userPresenceType] || 'Unknown';

    switch (presenceStatus?.userPresenceType) {
      case 1:
        presenceClass = 'presence-website';
        break;
      case 2:
        presenceClass = 'presence-ingame';
        if (presenceStatus.placeId && presenceStatus.gameId && presenceStatus.lastLocation) {
          joinUrl = `roblox://placeId=${presenceStatus.placeId}&jobId=${presenceStatus.gameId}`;
        }
        break;
      case 3:
        presenceClass = 'presence-studio';
        break;
      default:
        presenceClass = 'presence-offline';
    }

    // Render profile HTML, replace last online display with your API data if available
    profileDiv.innerHTML = `
      <div class="profile-header">
        <div class="profile-left">
          <div style="display: flex; flex-direction: column; align-items: center;">
            <div class="avatar-wrapper ${presenceClass}">
              <img class="avatar" src="${profileRes.avatarUrl}" alt="Avatar" />
            </div>
          </div>
          <div class="user-info">
            <div class="display-name">${profileRes.displayName}</div>
            <div class="username">@${profileRes.name} <span style="font-size: 14px; color: #66ff66; margin-left: 8px;">(${presenceText})</span></div>
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
        <div class="description">${(profileRes.description || 'No description set.').replace(/\n/g, '<br>')}</div>
        <div class="meta">
          Joined on ${formatDate(profileRes.created)}
          ${
            friendStatus.isFriend && lastOnlineDate
              ? `<br>Last Seen: ${formatDate(lastOnlineDate.toISOString())}`
              : ''
          }
        </div>
      </div>
    `;

    // Dropdown toggle events
    const dropdownTrigger = document.querySelector('.dropdown-trigger');
    const dropdownWrapper = document.getElementById('dropdown');

    // Add "Mark/Unmark Best Friend" dropdown item if user is a friend
    if (friendStatus.isFriend) {
      let bestFriendItem = document.getElementById('toggleBestFriend');
      if (!bestFriendItem) {
        bestFriendItem = document.createElement('div');
        bestFriendItem.className = 'dropdown-item';
        bestFriendItem.id = 'toggleBestFriend';
        bestFriendItem.role = 'menuitem';
        bestFriendItem.tabIndex = 0;
        dropdownWrapper.querySelector('.dropdown-menu').prepend(bestFriendItem);
      }

      const isBestFriend = bestFriends.includes(String(profileRes.id));
      bestFriendItem.textContent = isBestFriend ? 'Unmark Best Friend' : 'Mark as Best Friend';

      bestFriendItem.onclick = async () => {
        bestFriendItem.textContent = 'Processing...';

        try {
          const endpoint = isBestFriend
            ? `/api/friends/best-friends/remove/${profileRes.id}`
            : `/api/friends/best-friends/add/${profileRes.id}`;
          const res = await fetch(endpoint, { method: 'POST' });
          const data = await res.json();

          if (data.success) {
            alert(isBestFriend ? 'Removed from best friends.' : 'Added to best friends.');

            if (isBestFriend) {
              bestFriends = bestFriends.filter(id => id !== String(profileRes.id));
              bestFriendItem.textContent = 'Mark as Best Friend';
            } else {
              bestFriends.push(String(profileRes.id));
              bestFriendItem.textContent = 'Unmark Best Friend';
            }
          } else {
            alert('Failed to update best friend status.');
            bestFriendItem.textContent = isBestFriend ? 'Unmark Best Friend' : 'Mark as Best Friend';
          }
        } catch (e) {
          alert('Error updating best friend status.');
          bestFriendItem.textContent = isBestFriend ? 'Unmark Best Friend' : 'Mark as Best Friend';
        }
      };
    }

    if (dropdownTrigger && dropdownWrapper) {
      dropdownTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdownWrapper.classList.toggle('show');
      });
      dropdownTrigger.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          dropdownWrapper.classList.toggle('show');
        }
      });
    }

    // Action buttons container
    const actionButtons = document.getElementById('action-buttons');
    actionButtons.innerHTML = '';

    // Helper to create buttons
    function createButton(id, text) {
      const btn = document.createElement('button');
      btn.id = id;
      btn.className = 'action-btn';
      btn.textContent = text;
      return btn;
    }

    if (joinUrl) {
      const joinBtn = createButton('joinBtn', 'Join Game');
      joinBtn.title = presenceStatus.lastLocation || 'Join user in-game';
      joinBtn.onclick = () => {
        window.location.href = joinUrl;
      };
      actionButtons.appendChild(joinBtn);
    }

    // Render friend button(s)
    function renderFriendButton() {
      actionButtons.innerHTML = '';

      // Don't show friend button on your own profile
      if (parseInt(profileRes.id, 10) === parseInt(loggedInUser, 10)) return;

      if (friendStatus.isFriend) {
        const unfriendBtn = createButton('unfriendBtn', 'Unfriend');
        unfriendBtn.onclick = async () => {
          if (!confirm('Are you sure you want to unfriend this user?')) return;
          try {
            const res = await fetch(`/api/unfriend/${profileRes.id}`, { method: 'POST' });
            const data = await res.json();
            if (data.success) {
              alert('User unfriended.');
              friendStatus.isFriend = false;
              renderFriendButton();
            } else {
              alert('Failed to unfriend user.');
            }
          } catch {
            alert('Failed to unfriend user.');
          }
        };
        actionButtons.appendChild(unfriendBtn);
      } else if (friendStatus.hasPendingRequest) {
        const cancelBtn = createButton('friendReqCancelBtn', 'Cancel Request');
        cancelBtn.onclick = async () => {
          if (!confirm('Cancel the pending friend request?')) return;
          try {
            const res = await fetch(`/api/cancel-friend-request/${profileRes.id}`, { method: 'POST' });
            const data = await res.json();
            if (data.success) {
              alert('Friend request cancelled.');
              friendStatus.hasPendingRequest = false;
              renderFriendButton();
            } else {
              alert('Failed to cancel friend request.');
            }
          } catch {
            alert('Failed to cancel friend request.');
          }
        };
        actionButtons.appendChild(cancelBtn);
      } else {
        const friendBtn = createButton('friendBtn', 'Friend');
        friendBtn.onclick = async () => {
          try {
            const res = await fetch(`/api/friend/${profileRes.id}`, { method: 'POST' });
            const data = await res.json();
            if (data.success) {
              alert('Friend request sent.');
              friendStatus.hasPendingRequest = true;
              renderFriendButton();
            } else {
              alert('Failed to send friend request.');
            }
          } catch {
            alert('Failed to send friend request.');
          }
        };
        actionButtons.appendChild(friendBtn);
      }
    }

    if (loggedInUser && parseInt(profileRes.id, 10) !== parseInt(loggedInUser, 10)) {
      renderFriendButton();
    }

    // Block User button (hide if own profile)
    const blockUserBtn = document.getElementById('blockUserBtn');
    if (parseInt(profileRes.id, 10) !== parseInt(loggedInUser, 10)) {
      if (blockUserBtn) {
        blockUserBtn.addEventListener('click', async () => {
          if (!confirm('Are you sure you want to block this user?')) return;
          try {
            const res = await fetch(`/api/block/${profileRes.id}`, { method: 'POST' });
            const data = await res.json();
            alert(data.success ? 'User blocked.' : 'Failed to block user.');
          } catch {
            alert('Failed to block user.');
          }
        });
      }
    } else {
      if (blockUserBtn) blockUserBtn.style.display = 'none';
    }
  } catch (err) {
    profileDiv.innerHTML = 'Failed to load profile.';
    console.error(err);
  }
}

// Start loading profile when script loads
loadProfile();
