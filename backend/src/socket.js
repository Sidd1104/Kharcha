const jwt = require('jsonwebtoken');
const { pool } = require('./db');

function setupSocketIO(io) {
  // 1. Authentication middleware
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }
    try {
      const payload = jwt.verify(
        token,
        process.env.JWT_SECRET || 'kharcha_super_secret_jwt_key_2026_dev'
      );
      if (!payload.userId) {
        return next(new Error('Invalid token payload'));
      }
      socket.user = {
        userId: Number(payload.userId),
        email: payload.email,
        name: payload.name,
      };
      next();
    } catch (err) {
      return next(new Error('Invalid token'));
    }
  });

  // 2. Connection and Room Management
  io.on('connection', (socket) => {
    socket.on('join-group', async (groupId) => {
      try {
        const parsedGroupId = Number(groupId);
        if (!parsedGroupId) {
          return socket.emit('error', { message: 'Invalid group ID' });
        }

        // SECURITY: verify user is actually an active member of this group before letting them join the room!
        const { rows } = await pool.query(
          'SELECT id FROM group_participants WHERE group_id = $1 AND user_id = $2 AND status = $3',
          [parsedGroupId, socket.user.userId, 'active']
        );

        if (rows.length > 0) {
          socket.join(`group:${parsedGroupId}`);
          socket.emit('joined-group', { groupId: parsedGroupId });
        } else {
          socket.emit('error', { message: 'Not authorized for this group room' });
        }
      } catch (err) {
        console.error('join-group error:', err);
        socket.emit('error', { message: 'Failed to join group room' });
      }
    });

    socket.on('leave-group', (groupId) => {
      const parsedGroupId = Number(groupId);
      if (parsedGroupId) {
        socket.leave(`group:${parsedGroupId}`);
        socket.emit('left-group', { groupId: parsedGroupId });
      }
    });
  });
}

module.exports = { setupSocketIO };
