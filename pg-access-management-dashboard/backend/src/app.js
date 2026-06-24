require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const { router: serverRoutes } = require('./routes/servers');
const databaseRoutes = require('./routes/databases');
const grantRoutes = require('./routes/grants');
const { startRevocationWorker } = require('./workers/revokeExpired');

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173' }));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/servers', serverRoutes);
app.use('/api/servers', databaseRoutes);
app.use('/api/grants', grantRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
  startRevocationWorker();
});
