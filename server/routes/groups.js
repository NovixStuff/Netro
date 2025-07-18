const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');

module.exports = function ({ RBLX_KEY, loggedInUser }) {

router.get('/api/me/groups', async (req, res) => {
  try {
    const response = await fetch(`https://groups.roblox.com/v2/users/${loggedInUser}/groups/roles`, {
      headers: {
        'Cookie': `.ROBLOSECURITY=${RBLX_KEY}`,
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch user groups.' });
    }

    const data = await response.json();
    const groupsData = data.data || [];

    if (groupsData.length === 0) {
      return res.json([]);
    }

    const groupIds = groupsData.map(g => g.group.id);

    // Fetch thumbnails for all group IDs
    const thumbnailsRes = await fetch(`https://thumbnails.roblox.com/v1/groups/icons?groupIds=${groupIds.join(',')}&size=420x420&format=Png&isCircular=false`);
    if (!thumbnailsRes.ok) {
      console.warn('Failed to fetch group thumbnails');
      // Continue without thumbnails
    }
    const thumbnailsData = thumbnailsRes.ok ? await thumbnailsRes.json() : { data: [] };

    // Map groupId to imageUrl
    const thumbnailMap = {};
    for (const thumb of thumbnailsData.data || []) {
      thumbnailMap[thumb.targetId] = thumb.imageUrl;
    }

    // Map groups to desired format, replacing thumbnail API URL with actual image URL
    const groups = groupsData.map(g => ({
      id: g.group.id,
      name: g.group.name,
      thumbnail: thumbnailMap[g.group.id] || '', // empty string if no thumbnail found
      role: g.role,
    }));

    res.json(groups);
  } catch (error) {
    console.error('[Error]', error);
    res.status(500).json({ error: 'Failed to fetch user groups.' });
  }
});

// API route to get group info by Group ID
router.get('/api/groups/:groupId', async (req, res) => {
  const groupId = req.params.groupId;

  try {
    // Fetch group info
    const response = await fetch(`https://groups.roblox.com/v1/groups/${groupId}`, {
      headers: {
        'Cookie': `.ROBLOSECURITY=${RBLX_KEY}`,
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch group data.' });
    }

    const groupData = await response.json();

    // Fetch thumbnail
    const thumbRes = await fetch(`https://thumbnails.roblox.com/v1/groups/icons?groupIds=${groupId}&size=420x420&format=Png&isCircular=false`);
    let thumbnailUrl = null;
    if (thumbRes.ok) {
      const thumbData = await thumbRes.json();
      if (thumbData.data && thumbData.data.length > 0) {
        thumbnailUrl = thumbData.data[0].imageUrl;
      }
    }

    // Fetch roles of the group
    const roleId_response = await fetch(`https://groups.roblox.com/v1/groups/${groupId}/roles`, {
      headers: {
        'Cookie': `.ROBLOSECURITY=${RBLX_KEY}`,
      }
    });

    let roles = [];
    if (roleId_response.ok) {
      const roleData = await roleId_response.json();
      if (Array.isArray(roleData.data)) {
        roles = roleData.data.map(role => ({
          id: role.id,
          name: role.name,
          rank: role.rank,
        }));
      }
    }

    // Fetch user's roles in groups, find role for this group if userId provided
    let userRole = null;
    const userRolesRes = await fetch(`https://groups.roblox.com/v2/users/${loggedInUser}/groups/roles`, {
      headers: {
        'Cookie': `.ROBLOSECURITY=${RBLX_KEY}`,
      }
    });
    if (userRolesRes.ok) {
      const userRolesData = await userRolesRes.json();
      if (userRolesData.data && Array.isArray(userRolesData.data)) {
        const groupRole = userRolesData.data.find(g => String(g.group.id) === String(groupId));
          if (groupRole) {
            userRole = {
            roleId: groupRole.role.id,
            roleName: groupRole.role.name,
            rank: groupRole.role.rank,
          };
        }
      }
    }

    res.json({
      id: groupData.id,
      name: groupData.name,
      description: groupData.description,
      owner: groupData.owner?.name || 'Unknown',
      memberCount: groupData.memberCount,
      thumbnail: thumbnailUrl,
      roles,
      userRole, // Your role in the group if any
    });

  } catch (error) {
    console.error('[Error fetching group data]', error);
    res.status(500).json({ error: 'Failed to fetch group data.' });
  }
});

router.get('/api/groups/member-of-group/:groupId', async (req, res) => {

});

router.post('api/groups/join-group/:groupId', async (req, res) => {

});

router.post('api/groups/leave-group/:groupId', async (req, res) => {

});
    
return router;
};