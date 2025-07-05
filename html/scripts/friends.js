const tabContent = document.getElementById('tab-content');

async function fetchData(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error(err);
    throw err;
  }
}

function renderList(data, showTime = false) {
  if (!Array.isArray(data) || data.length === 0) {
    tabContent.innerHTML = '<p class="empty-message">Nothing found.</p>';
    return;
  }

  data.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  const container = document.createElement('div');
  container.className = 'card-list';

  data.forEach(item => {
    const displayName = item.displayName || item.name || 'Unknown';
    const username = item.name || 'unknown';
    const avatarUrl = `/thumbnail/user/${item.id}?size=100x100`;
    const timestamp = item.timestamp ? new Date(item.timestamp).toLocaleString() : '';
    
    // Fix: Use item.type to assign CSS classes
    const statusClass = item.type === 'removed' ? 'lost-friend' :
                        item.type === 'added' ? 'new-friend' : '';

    const card = document.createElement('div');
    card.className = 'card';

    card.innerHTML = `
      <div class="avatar-container ${statusClass}">
        <img class="avatar" src="${avatarUrl}" alt="Avatar" />
      </div>
      <div class="names">
        <div class="display-name">${displayName}</div>
        <div class="username">@${username}</div>
        ${showTime ? `<div class="username">${timestamp}</div>` : ''}
      </div>
    `;

    container.appendChild(card);
  });

  tabContent.innerHTML = '';
  tabContent.appendChild(container);
}

function renderRequests(data) {
  if (!Array.isArray(data) || data.length === 0) {
    tabContent.innerHTML = '<p class="empty-message">No pending friend requests.</p>';
    return;
  }

  const container = document.createElement('div');
  container.className = 'card-list';

  data.forEach(user => {
    const avatarUrl = `/thumbnail/user/${user.id}?size=100x100`;
    const displayName = user.displayName || user.name || 'Unknown';
    const username = user.name || 'unknown';
    const sentAt = user.friendRequest?.sentAt
      ? new Date(user.friendRequest.sentAt).toLocaleString()
      : 'Unknown time';
    const mutuals = user.mutualFriendsList?.length
      ? `Mutuals: ${user.mutualFriendsList.join(', ')}`
      : '';

    const card = document.createElement('div');
    card.className = 'card';

    card.innerHTML = `
      <div class="avatar-container">
        <img class="avatar" src="${avatarUrl}" alt="Avatar" />
      </div>
      <div class="names">
        <div class="display-name">${displayName}</div>
        <div class="username">@${username}</div>
        <div class="username">Sent: ${sentAt}</div>
        ${mutuals ? `<div class="username">${mutuals}</div>` : ''}
        <div>
          <button class="accept-btn" data-id="${user.id}">Accept</button>
          <button class="decline-btn" data-id="${user.id}">Decline</button>
        </div>
      </div>
    `;

    container.appendChild(card);
  });

  tabContent.innerHTML = '';
  tabContent.appendChild(container);

  document.querySelectorAll('.accept-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const userId = btn.dataset.id;
      try {
        await fetch(`/api/friend/accept/${userId}`, { method: 'POST' });
        btn.closest('.card').remove();
      } catch (err) {
        alert('Failed to accept request');
      }
    });
  });

  document.querySelectorAll('.decline-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const userId = btn.dataset.id;
      try {
        await fetch(`/api/friend/decline/${userId}`, { method: 'POST' });
        btn.closest('.card').remove();
      } catch (err) {
        alert('Failed to decline request');
      }
    });
  });
}

async function showTab(tab) {
  tabContent.innerHTML = '<p>Loading...</p>';
  try {
    let data = [];
    if (tab === 'friends') {
      data = await fetchData('/api/me/friends');
      renderList(data);
    } else if (tab === 'requests') {
      const raw = await fetchData('/api/me/friend-requests');
      renderRequests(raw);
    } else if (tab === 'history') {
      data = await fetchData('/api/me/friend-history');
      renderList(data, true);
    }
  } catch (err) {
    tabContent.innerHTML = '<p class="error-message">Failed to load data.</p>';
  }
}

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelector('.tab.active')?.classList.remove('active');
    tab.classList.add('active');
    showTab(tab.dataset.tab);
  });
});

window.addEventListener('DOMContentLoaded', () => {
  showTab('friends');
});
