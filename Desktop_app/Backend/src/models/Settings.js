import { getPool, sql } from '../mssqlDb.js';

// Singleton table (see 001_initial_schema.sql) — app always operates on the
// first/only row; SQL has no native "singleton table" concept.
export async function getSettings() {
  const result = await getPool().request().query('SELECT TOP 1 Id, Username, PasswordHash FROM dbo.Settings ORDER BY Id');
  const row = result.recordset[0];
  return row ? { id: row.Id, username: row.Username, passwordHash: row.PasswordHash } : null;
}

export async function upsertSettings({ username, passwordHash }) {
  const pool = getPool();
  const existing = await getSettings();
  if (existing) {
    await pool.request()
      .input('id', sql.Int, existing.id)
      .input('username', sql.NVarChar(100), username)
      .input('passwordHash', sql.NVarChar(255), passwordHash)
      .query('UPDATE dbo.Settings SET Username = @username, PasswordHash = @passwordHash WHERE Id = @id');
    return { id: existing.id, username, passwordHash };
  }
  const result = await pool.request()
    .input('username', sql.NVarChar(100), username)
    .input('passwordHash', sql.NVarChar(255), passwordHash)
    .query(`INSERT INTO dbo.Settings (Username, PasswordHash)
            OUTPUT INSERTED.Id
            VALUES (@username, @passwordHash)`);
  return { id: result.recordset[0].Id, username, passwordHash };
}
