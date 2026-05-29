const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const initDb = async () => {
  const client = await pool.connect();

  try {
    const schemaPath = path.join(__dirname, 'supabase-schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');

    console.log('Initializing database from supabase-schema.sql...');
    await client.query(schemaSql);
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database init failed:', error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
};

initDb();
