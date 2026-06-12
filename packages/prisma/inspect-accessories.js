import fs from 'fs';
import pg from 'pg';

const envContent = fs.readFileSync('.env', 'utf8');
const match = envContent.match(/DATABASE_URL="([^"]+)"/);
const databaseUrl = match[1];

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();

// Get column names and types
const columns = await client.query(`
  SELECT column_name, data_type 
  FROM information_schema.columns 
  WHERE table_schema = 'public' AND table_name = 'accessories'
  ORDER BY ordinal_position
`);
console.log('Columns in public.accessories:');
columns.rows.forEach(col => console.log(`  ${col.column_name} (${col.data_type})`));

// Get a sample row (first 3 rows)
const sample = await client.query(`SELECT * FROM public.accessories LIMIT 3`);
console.log('\nSample rows:');
console.log(sample.rows);

await client.end();