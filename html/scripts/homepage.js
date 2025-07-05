const tabBar = document.getElementById('tab-bar');
    const tabContent = document.getElementById('tab-content');
    let currentProfile;
    let activeTab = 'overview';

    // Render Overview tab
    function renderOverview(profile) {
      tabContent.innerHTML = `
        <h2>About</h2>
        <div class="description">${profile.description || 'No description set.'}</div>
        <div class="meta">Joined on ${new Date(profile.created).toLocaleDateString(undefined, {
          year: 'numeric', month: 'long', day: 'numeric'
        })}</div>
      `;
    }

    // Render Friends tab with avatars
    async function renderFriends(profile) {
      tabContent.innerHTML = `
        <h2 style="margin-bottom: 10px;">Friends</h2>
        <div class="friend-list"></div>
      `;

      const list = tabContent.querySelector('.friend-list');

      let allFriends = [];
      try {
        const response = await fetch('/api/me/friends');
        allFriends = await response.json();
      } catch (err) {
        console.error('Failed to load friends:', err);
        list.innerHTML = '<p style="color: red;">Failed to load friends.</p>';
        return;
      }

      if (!allFriends || allFriends.length === 0) {
        list.innerHTML = '<p>No friends found.</p>';
        return;
      }

      allFriends.forEach(friend => {
        const card = document.createElement('a');
        card.className = 'friend-card';
        card.href = `/users/${friend.id}/profile`;
        card.title = `${friend.displayName || friend.name}`;
        card.style = `
          display: flex;
          align-items: center;
          gap: 12px;
          background-color: #1c1c1c;
          padding: 10px;
          border-radius: 10px;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
          text-decoration: none;
        `;

        card.innerHTML = `
          <img src="${friend.avatarUrl}" alt="Avatar" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover;" />
          <div>
            <div style="font-weight: bold; font-size: 16px; color: #fff;">${friend.displayName}</div>
            <div style="color: #aaa;">${friend.name}</div>
          </div>
        `;

        list.appendChild(card);
      });
    }

    // Render Settings tab placeholder
    function renderSettings() {
      tabContent.innerHTML = `
        <h2>Edit About Me</h2>
        <div class="settings-list">
          <label for="bioTextarea" style="display:block; margin-bottom:8px;">Your Bio:</label>
          <textarea id="bioTextarea" rows="5" style="width:100%; padding:10px; background:#1a1a1a; color:#fff; border:1px solid #444; border-radius:6px;">${currentProfile.description || ''}</textarea>
          <button id="saveBioBtn" style="margin-top:12px; padding:10px 16px; background:#ab13e2; color:#fff; border:none; border-radius:6px; cursor:pointer;">Save Bio</button>
          <div id="bioSaveStatus" style="margin-top:10px; font-size:14px;"></div>
        </div>
      `;

      document.getElementById('saveBioBtn').addEventListener('click', async () => {
        const newBio = document.getElementById('bioTextarea').value;
        const status = document.getElementById('bioSaveStatus');

        try {
          const res = await fetch('/api/change-about/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ about: newBio })
          });

          const data = await res.json();

          if (!res.ok || data.error) {
            status.style.color = 'red';
            status.textContent = data.error || 'Failed to update bio.';
          } else {
            status.style.color = 'limegreen';
            status.textContent = 'Bio updated successfully!';
            currentProfile.description = newBio;
          }
        } catch (err) {
          status.style.color = 'red';
          status.textContent = 'Error updating bio.';
          console.error(err);
        }
      });
    }

    // Handle tab switching
    tabBar.addEventListener('click', e => {
      if (!e.target.classList.contains('tab')) return;
      if (e.target.dataset.tab === activeTab) return;

      tabBar.querySelector('.tab.active').classList.remove('active');
      e.target.classList.add('active');
      activeTab = e.target.dataset.tab;

      if (activeTab === 'overview') renderOverview(currentProfile);
      else if (activeTab === 'friends') renderFriends(currentProfile);
      else if (activeTab === 'settings') renderSettings();
    });

    async function init() {
      // Wait for sidebar.js to load and render sidebar
      // Assume sidebar.js sets window.sidebarProfile or fires event, or you can fetch here again if needed
      try {
        const res = await fetch('/api/me');
        currentProfile = await res.json();

        if (!currentProfile || currentProfile.error) {
          tabContent.innerHTML = '<p style="color:#f44;">Failed to load profile data.</p>';
          return;
        }

        renderOverview(currentProfile);
      } catch(e) {
        tabContent.innerHTML = '<p style="color:#f44;">Failed to load profile data.</p>';
        console.error(e);
      }
    }

    document.addEventListener('DOMContentLoaded', init);