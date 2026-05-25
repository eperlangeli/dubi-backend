const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { Pool } = require('pg');

dotenv.config();

const app = express();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(cors());
app.use(express.json());
app.get('/', (req, res) => {
  res.json({
    message: 'DUBI Backend is running successfully',
    status: 'online'
  });
});

// HEALTH CHECK
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// ROUTES
app.use('/auth', require('./routes/auth')(pool));
app.use('/api/onboarding', require('./routes/onboarding')(pool));
app.use('/api/plans', require('./routes/plans')(pool));
app.use('/user', require('./routes/user')(pool));
app.use('/plan', require('./routes/plan')(pool));
app.use('/adherence', require('./routes/adherence')(pool));
app.use('/weight', require('./routes/weight')(pool));
app.use('/nps', require('./routes/nps')(pool));

// ERROR HANDLER
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

// START SERVER
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ DUBI Backend running on port ${PORT}`);
});

module.exports = { pool, app };
