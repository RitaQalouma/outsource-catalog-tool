import fs from 'fs';
import pg from 'pg';

// Load .env manually
const envContent = fs.readFileSync('.env', 'utf8');
const match = envContent.match(/DATABASE_URL="([^"]+)"/);
if (!match) {
  console.error('❌ DATABASE_URL not found in .env');
  process.exit(1);
}
const databaseUrl = match[1];
console.log('Using database URL (password hidden):', databaseUrl.replace(/:[^:@]+@/, ':****@'));

const client = new pg.Client({ connectionString: databaseUrl });
try {
  await client.connect();
  const res = await client.query('SELECT current_database(), current_schema;');
  console.log('✅ Connected to database:', res.rows[0].current_database);
  console.log('   Current schema:', res.rows[0].current_schema);
  await client.end();
} catch (err) {
  console.error('❌ Connection error:', err.message);
}
