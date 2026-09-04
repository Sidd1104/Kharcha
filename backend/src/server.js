const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const groupRoutes = require('./routes/groups');
const expenseRoutes = require('./routes/expenses');
const settlementRoutes = require('./routes/settlements');
const inviteRoutes = require('./routes/invites');
const notificationRoutes = require('./routes/notifications');

const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/auth', authRoutes);
app.use('/groups', groupRoutes);
// expenses and settlements are nested under /groups/:groupId/...
app.use('/groups', expenseRoutes);
app.use('/groups', settlementRoutes);
app.use('/invites', inviteRoutes);
app.use('/notifications', notificationRoutes);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// Basic error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 Kharcha backend running on http://localhost:${PORT}`);
});
