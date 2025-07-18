// Get groupId from URL path /groups/{groupId}
    function getGroupIdFromUrl() {
      const parts = window.location.pathname.split('/').filter(Boolean);
      if (parts.length === 2 && parts[0].toLowerCase() === 'groups') return parts[1];
      return null;
    }

    async function loadGroupList() {
      const mainContent = document.getElementById('mainContent');
      mainContent.innerHTML = '<h2>My Groups</h2><div class="group-list" id="groupList">Loading groups...</div>';
      const groupList = document.getElementById('groupList');

      try {
        const res = await fetch('/api/me/groups');
        const groups = await res.json();

        if (!groups || groups.length === 0) {
          groupList.innerHTML = '<p style="color:#ccc;">You are not in any groups.</p>';
          return;
        }

        groupList.innerHTML = '';

        groups.forEach(group => {
          const imgSrc = group.thumbnail || 'default-thumbnail.png';
          const groupCard = document.createElement('a');
          groupCard.className = 'group-card';
          groupCard.href = `/groups/${group.id}`;
          groupCard.innerHTML = `
            <img class="group-thumbnail" src="${imgSrc}" alt="Group Thumbnail" />
            <div class="group-info">
              <div class="group-name">${group.name}</div>
              <div class="group-role">Role: ${group.role.name || group.role}</div>
            </div>
          `;
          groupList.appendChild(groupCard);
        });
      } catch (err) {
        console.error('Failed to load groups:', err);
        groupList.innerHTML = '<p style="color:red;">Failed to load groups.</p>';
      }
    }

    async function loadGroupDetail(groupId) {
      const mainContent = document.getElementById('mainContent');
      mainContent.innerHTML = '<p>Loading group info...</p>';

      try {
        const res = await fetch(`/api/groups/${groupId}`);
        if (!res.ok) {
          mainContent.innerHTML = `<p style="color: red;">Failed to load group data. (${res.status})</p>`;
          return;
        }
        const group = await res.json();

        mainContent.innerHTML = `
          <div class="group-detail">
            <img src="${group.thumbnail}" alt="Group Thumbnail" />
            <h2>${group.name}</h2>
            <div class="group-info-row"><span class="group-info-label">Role:</span> ${group.userRole.roleName}</div>
            <div class="group-info-row"><span class="group-info-label">Members:</span> ${group.memberCount}</div>
            <div class="group-description">${group.description || 'No description available.'}</div>
          </div>
        `;
      } catch (err) {
        console.error('Error loading group detail:', err);
        mainContent.innerHTML = '<p style="color:red;">Error loading group data.</p>';
      }
    }

    document.addEventListener('DOMContentLoaded', () => {
      const groupId = getGroupIdFromUrl();
      if (groupId) {
        loadGroupDetail(groupId);
      } else {
        loadGroupList();
      }
    });