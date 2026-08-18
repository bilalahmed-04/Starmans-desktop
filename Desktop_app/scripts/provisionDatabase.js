// First-run (and every-run — idempotent) schema provisioning. Runs
// Backend/migrations/001_initial_schema.sql against MSSQL on EVERY startup —
// every statement in it is individually guarded, so this both creates the
// schema on a fresh machine and completes a partial/empty one — release_pipeline.md §6 Step 5's "startup
// self-sufficiency". SQL Server itself and its sa password are already
// provisioned by the installer's build/setup-sqlserver.ps1 by the time this
// runs (see DECISIONS.md's pipeline-adoption entry) — this script only ever
// deals with the `starmans` database's own schema, nothing at the SQL
// Server-instance level. This is directly testable in this dev environment
// (Node + the mssql driver + a live MSSQL instance) — unlike the installer
// script, which needs a real Windows machine to verify at all.
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
    // Run the migration EVERY time, not just when the database is absent.
    //
    // "Database exists" and "schema exists" are different questions, and
    // conflating them shipped a broken app: the installer's
    // setup-sqlserver.ps1 (New-StarmansDatabase) creates `starmans` as an
    // EMPTY database before the app ever starts, so this function used to see
    // it, skip provisioning, and leave every table uncreated. The app then died
    // on the first query with "Invalid object name 'dbo.Settings'" — reported
    // from a real 1.0.15 install. Attaching a recovered .mdf from an older
    // schema reaches the same place by a different route.
    //
    // Running it unconditionally is safe by construction, not by luck: every
    // statement in 001_initial_schema.sql is guarded (IF OBJECT_ID(...) IS NULL
    // for tables, IF NOT EXISTS over sys.indexes for indexes, and the
    // CREATE DATABASE at the top likewise), which is what the header of this
    // file always claimed this function did.
    const existed = await databaseExists(pool);
    console.log(existed
      ? 'Database "starmans" exists — verifying/completing schema (migration is idempotent)...'
      : 'Database "starmans" not found — creating it and running initial schema migration...');

    const script = fs.readFileSync(migrationPath, 'utf8');
    const batches = splitSqlBatches(script);
    for (const batch of batches) {
      await pool.request().batch(batch);
    }

    // Prove the schema is actually usable rather than trusting that the batches
    // ran. Without this the next failure is a bare SQL error 208 from whichever
    // query happens to run first, which says nothing about provisioning.
    const check = await pool.request().query(
      "SELECT OBJECT_ID('starmans.dbo.Settings', 'U') AS id"
    );
    if (check.recordset[0].id === null) {
      throw new Error(
        'Schema provisioning ran but starmans.dbo.Settings still does not exist. ' +
        'The migration did not apply — check the migration file and the sa account\'s ' +
        'permissions on the starmans database.'
      );
    }
    console.log('Schema migration complete.');
  } finally {
    await pool.close();
  }
}

module.exports = { splitSqlBatches, databaseExists, provisionDatabase };
