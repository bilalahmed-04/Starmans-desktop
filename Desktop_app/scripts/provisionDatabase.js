// First-run schema provisioning. Runs Backend/migrations/001_initial_schema.sql
// against MSSQL if the `starmans` database doesn't exist yet — matches
// PROPOSED_PLAN.md's "creates the database schema on first launch" installer
// flow. This is the part of Task 16 that's directly testable (Node + the
// mssql driver + a live MSSQL instance, all available in this dev environment) —
// unlike ensureSqlServer.js's SQL Server Express install step, which needs a
// real Windows machine to verify at all.
const fs = require('node:fs');

// sqlcmd's "GO" batch separator is not real T-SQL — the mssql/tedious driver
// can't run a migration file containing it as a single statement, so each
// GO-delimited section has to be sent as its own batch.
function splitSqlBatches(script) {
  return script
    .split(/^\s*GO\s*$/im)
    .map((batch) => batch.trim())
    .filter(Boolean);
}

async function databaseExists(masterPool) {
  const result = await masterPool.request().query("SELECT DB_ID('starmans') AS id");
  return result.recordset[0].id !== null;
}

// Connects against `master` (not `starmans` — which may not exist yet; a
// connection string naming a nonexistent database fails MSSQL login outright,
// see DECISIONS.md's Development environment entry for how this was
// discovered), runs the migration if needed, using the SAME connection/session
// throughout so the migration's own `USE starmans;` (partway through the
// script) correctly redirects the remaining batches — tedious's `request.batch()`
// preserves session state (USE context) across calls on one connection.
async function provisionDatabase({ sql, config, migrationPath }) {
  const masterConfig = { ...config, database: 'master' };
  const pool = await sql.connect(masterConfig);
  try {
    if (await databaseExists(pool)) {
      console.log('Database "starmans" already exists — skipping schema provisioning.');
      return;
    }
    console.log('Database "starmans" not found — running initial schema migration...');
    const script = fs.readFileSync(migrationPath, 'utf8');
    const batches = splitSqlBatches(script);
    for (const batch of batches) {
      await pool.request().batch(batch);
    }
    console.log('Schema migration complete.');
  } finally {
    await pool.close();
  }
}

module.exports = { splitSqlBatches, databaseExists, provisionDatabase };
