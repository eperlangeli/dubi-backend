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
app.use(express.json({ limit: '1mb' }));
app.get('/', (req, res) => {
  res.json({
    message: 'DUBI Backend is running successfully',
    status: 'online'
  });
});

// HEALTH CHECK
app.get('/health', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date(),
    database: { status: 'unknown' },
    onboardingSchema: { status: 'unknown' }
  };

  try {
    await pool.query('SELECT 1');
    health.database.status = 'ok';

    const schema = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'user_onboarding'
        AND column_name = ANY($1::text[])
    `, [[
      'user_id',
      'age',
      'height',
      'weight',
      'goal',
      'diet',
      'allergies',
      'day_start',
      'day_end',
      'wearable_provider'
    ]]);

    const found = schema.rows.map((row) => row.column_name);
    const required = ['user_id', 'age', 'height', 'weight', 'goal', 'diet', 'allergies', 'day_start', 'day_end', 'wearable_provider'];
    const missing = required.filter((column) => !found.includes(column));
    health.onboardingSchema = {
      status: missing.length ? 'missing_columns' : 'ok',
      missing
    };

    if (missing.length) health.status = 'degraded';
    res.json(health);
  } catch (error) {
    health.status = 'degraded';
    health.database = { status: 'error', error: error.message };
    res.status(503).json(health);
  }
});

// ROUTES
app.use('/auth', require('./routes/auth')(pool));
app.use('/api/onboarding', require('./routes/onboarding')(pool));
app.use('/api/plans', require('./routes/plans')(pool));
app.use('/api/progress', require('./routes/progress')(pool));
app.use('/api/ai', require('./routes/ai-engine')(pool));
app.use('/api/ask-dubi', require('./routes/ask-dubi')(pool));
app.use('/api/nutrition-brain', require('./routes/nutrition-brain')(pool));
app.use('/api/wearables', require('./routes/wearables')(pool));
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
