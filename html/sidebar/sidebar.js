// sidebar.js

async function loadSidebar() {
  const sidebar = document.getElementById('sidebar');

  try {
    // Fetch user profile
    const res = await fetch('/api/me');
    const profile = await res.json();

    if (profile.error) {
      sidebar.innerHTML = `<p style="color:#f44;">Error loading profile: ${profile.error}</p>`;
      return;
    }

    // Fetch friend requests count
    let friendReqCount = 0;
    try {
      const data = await fetch('/api/me/friend-requests/count');
      const dataResponse = await data.json();
      if (!dataResponse.error && typeof dataResponse.count === 'number') {
        friendReqCount = dataResponse.count;
      }
    } catch (e) {
      console.warn('Failed to load friend requests count:', e);
    }

    sidebar.innerHTML = `
      <img class="avatar" src="${profile.avatarUrl}" alt="Avatar" />
      <div class="display-name">${profile.displayName}</div>
      <div class="username">@${profile.name}</div>

      <input
        id="search-input"
        type="text"
        placeholder="Search users by username..."
        autocomplete="off"
      />

      <div id="search-results" class="search-results"></div>

      <div class="btn-group">
        <button type="button" data-page="home">Home</button>
        <button type="button" data-page="profile">Profile</button>
        <button type="button" data-page="friends">
          Friends
          ${friendReqCount > 0 ? `<span class="friend-req-badge">${friendReqCount}</span>` : ''}
        </button>
        <button type="button" data-page="groups">Groups</button>
        <button type="button" data-page="roblox">Roblox</button>
      </div>
    `;

    // Search logic
    const searchInput = document.getElementById('search-input');
    const resultsContainer = document.getElementById('search-results');
    let searchTimeout = null;

    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      const query = searchInput.value.trim();
      if (!query) {
        resultsContainer.innerHTML = '';
        return;
      }
      // Debounce 800
      searchTimeout = setTimeout(() => {
        searchUsers(query, resultsContainer);
      }, 800);
    });

    // Button navigation
    sidebar.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        const page = btn.dataset.page;
        switch (page) {
          case 'home':
            window.location.href = '/';
            break;
          case 'profile':
            window.location.href = `/users/${profile.userId}/profile`;
            break;
          case 'friends':
            window.location.href = '/friends';
            break;
          case 'groups':
            window.location.href = '/groups';
            break;
          case 'roblox':
            window.location.href = 'https://www.roblox.com';
            break;
          default:
            console.warn('Unknown page:', page);
        }
      });
    });

  } catch (e) {
    sidebar.innerHTML = `<p style="color:#f44;">Failed to load sidebar.</p>`;
    console.error(e);
  }
}

// Search users using Roblox API
async function searchUsers(query, container) {
  container.innerHTML = `<p class="search-loading">Searching...</p>`;

  try {
    const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`);
    if (!res.ok) throw new Error('Failed to fetch');

    const users = await res.json();

    if (!users || users.length === 0) {
      container.innerHTML = `<p class="search-empty">No users found.</p>`;
      return;
    }

    container.innerHTML = '';
    users.forEach(user => {
      const card = createUserCard(user);
      container.appendChild(card);
    });
  } catch (err) {
    container.innerHTML = `<p class="search-error">Error searching users.</p>`;
    console.error(err);
  }
}

function createUserCard(user) {
  const card = document.createElement('div');
  card.className = 'user-card';

  // Use avatarUrl from backend
  const avatarUrl = user.avatarUrl || `https://www.roblox.com/headshot-thumbnail/image?userId=${user.id}&width=150&height=150&format=png`;

  card.innerHTML = `
    <img src="${avatarUrl}" alt="${user.name}" class="avatar-small" />
    <div class="user-info">
      <div class="display-name">${user.displayName || user.name}</div>
      <div class="username">@${user.name}</div>
    </div>
  `;

  card.style.cursor = 'pointer';
  card.addEventListener('click', () => {
    window.location.href = `/users/${user.id}/profile`;
  });

  return card;
}


document.addEventListener('DOMContentLoaded', loadSidebar);
console.log('Sidebar Loaded...');
