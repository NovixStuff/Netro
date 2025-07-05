// sidebar.js

async function loadSidebar() {
  const sidebar = document.getElementById('sidebar');

  try {
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

    console.log('Current Friend Requests Count: ' + friendReqCount);
    } catch (e) {
      console.warn('Failed to load friend requests count:', e);
    }


    sidebar.innerHTML = `
      <img class="avatar" src="${profile.avatarUrl}" alt="Avatar" />
      <div class="display-name">${profile.displayName}</div>
      <div class="username">@${profile.name}</div>

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

    // Add click listeners for buttons
    sidebar.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        const page = btn.dataset.page;

        switch(page) {
          case 'home':
            window.location.href = '/';
            break;
          case 'profile':
            // Assuming your profile URL format is /profile/{username} or /profile/{userId}
            window.location.href = `/users/${profile.userId}/profile`;
            break;
          case 'friends':
            window.location.href = '/friends'; // Your friend requests page
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

document.addEventListener('DOMContentLoaded', loadSidebar);
console.log('Sidebar Loaded...')
