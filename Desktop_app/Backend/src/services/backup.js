// Native SQL Server backups (BACKUP DATABASE), not a file copy of the
// .mdf/.ldf - a file copy would need the database briefly detached/stopped
// on every cycle, which an hourly job cannot do without visible downtime.
// BACKUP DATABASE runs online while the app keeps reading/writing.
//
// TO DISK accepts a T-SQL variable (unlike ALTER LOGIN's password literal
// restriction elsewhere in this codebase - see setup-sqlserver.ps1), so the
// path is passed as a real bound parameter, not string-interpolated.
import path from 'node:path';
import fs from 'node:fs/promises';

export class BackupError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code || 'backup_failed';
  }
}

function backupFileName(label) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `starmans_${label}_${stamp}.bak`;
}

async function runBackupToPath({ getPool, sql, database, targetPath }) {
  const pool = getPool();
  const request = pool.request();
  request.input('path', sql.NVarChar(4000), targetPath);
  try {
    await request.query(`BACKUP DATABASE [${database}] TO DISK = @path;`);
  } catch (err) {
    throw new BackupError(`SQL Server could not write the backup to ${targetPath}: ${err.message}`, 'backup_write_failed');
  }
}

// The scheduled (hourly) backup - writes directly into the folder the
// installer collected. That folder's write permission for the SQL Server
// service account is granted once, at install time, by setup-sqlserver.ps1
// - see that file for why this can't be done for arbitrary folders chosen
// later at runtime (see backupToExternalFolder below).
export async function backupToPrimaryFolder({ getPool, sql, database, backupFolder }) {
  if (!backupFolder) {
    throw new BackupError('No backup folder is configured (app-config.json is missing backupFolder).', 'no_backup_folder');
  }
  const fileName = backupFileName('auto');
  const targetPath = path.join(backupFolder, fileName);
  await runBackupToPath({ getPool, sql, database, targetPath });
  return { fileName, filePath: targetPath };
}

// The manual "backup to external drive" action. SQL Server's own service
// account only has write permission on the fixed staging folder (granted at
// install time, same as the primary backup folder) - NOT on whatever USB
// drive or folder the user browses to at runtime, which electron-builder's
// installer has no way to know about in advance and which can change every
// time (different drive letter, different media). So the fresh backup is
// taken into staging first (still a fresh, up-to-the-second backup), then
// copied to the chosen destination using the app process's own permissions,
// which - unlike the SQL Server service account - already has normal access
// to whatever the logged-in user can browse to.
export async function backupToExternalFolder({ getPool, sql, database, stagingFolder, destinationFolder }) {
  if (!destinationFolder) {
    throw new BackupError('No destination folder was chosen.', 'no_destination');
  }
  await fs.mkdir(stagingFolder, { recursive: true });

  const fileName = backupFileName('manual');
  const stagingPath = path.join(stagingFolder, fileName);
  await runBackupToPath({ getPool, sql, database, targetPath: stagingPath });

  const destinationPath = path.join(destinationFolder, fileName);
  try {
    await fs.copyFile(stagingPath, destinationPath);
  } catch (err) {
    throw new BackupError(`Backup succeeded but could not be copied to ${destinationFolder}: ${err.message}`, 'copy_failed');
  } finally {
    await fs.unlink(stagingPath).catch(() => {});
  }

  return { fileName, filePath: destinationPath };
}
