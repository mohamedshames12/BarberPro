require('dotenv').config({
  path: require('path').join(__dirname, '../../.env')
});

const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is missing from .env');
}

const connectionUrl = new URL(process.env.DATABASE_URL);
connectionUrl.searchParams.set('sslmode', 'verify-full');

const pool = new Pool({
  connectionString: connectionUrl.toString(),
  max: 5,
  connectionTimeoutMillis: 10000
});

module.exports = pool;
