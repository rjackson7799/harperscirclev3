// Verify that supabase_migrations.schema_migrations contains EXACTLY the
// version prefixes of the migration files in the given directory — the
// round-6 auditability rule: after any reset or upgrade leg, the applied
// list is compared two-way against the filenames before tests are trusted.
//
//   node scripts/verify-migration-state.mjs <migrations-dir>
//
// Exit 0 on an exact two-way match; exit 1 with the diff otherwise.

import pg from 'pg';
import { readdirSync } from 'node:fs';

const dir = process.argv[2] ?? 'supabase/migrations';
const DB_URL = process.env.DATABASE_URL
  ?? 'postgresql://postgres:postgres@127.0.0.1:54342/postgres';

const expected = readdirSync(dir)
  .filter(f => /^\d{14}_.+\.sql$/.test(f))
  .map(f => f.slice(0, 14))
  .sort();

const client = new pg.Client({ connectionString: DB_URL });
await client.connect();
const res = await client.query(
  'select version from supabase_migrations.schema_migrations order by version');
await client.end();
const applied = res.rows.map(r => r.version);

const missing = expected.filter(v => !applied.includes(v));
const extra = applied.filter(v => !expected.includes(v));

if (missing.length === 0 && extra.length === 0) {
  console.log(`migration state exact: ${applied.length} applied == ${dir}`);
  process.exit(0);
}
console.error(`MIGRATION STATE MISMATCH against ${dir}`);
if (missing.length) console.error(`  in files, not applied: ${missing.join(', ')}`);
if (extra.length) console.error(`  applied, not in files: ${extra.join(', ')}`);
process.exit(1);
