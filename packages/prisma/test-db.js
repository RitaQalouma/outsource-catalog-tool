import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

try {
  await client.connect();
  const res = await client.query('SELECT 1');
  console.log('✅ Connection successful:', res.rows);
  await client.end();
} catch (err) {
  console.error('❌ Connection failed:', err.message);
}