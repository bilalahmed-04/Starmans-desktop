import bcrypt from 'bcryptjs';
import { getSettings, upsertSettings } from '../models/Settings.js';
import { ValidationError } from './errors.js';

// Token issuance (JWT for Express, nothing for IPC) is transport-specific
// session management, not business logic — it stays out of this layer.
// See DECISIONS.md's Group 5 entry for why JWT is dropped under IPC.
export class InvalidCredentialsError extends Error {
  constructor(message) {
    super(message);
    this.code = 'invalid_credentials';
  }
}

// Default credentials for a brand-new install. A fresh database has an empty
// Settings table, and there is no way to create the first account through the
// UI — verifyCredentials rejects (no row to match against) and changeSettings
// rejects too (it requires an existing row to check oldPassword against). So
// without this, a client installing fresh could never log in at all. See
// TASKS.md Task 19 and DECISIONS.md.
//
// SECURITY TRADEOFF, accepted deliberately by the project owner over the
// alternative (a first-run "create your account" screen): every install ships
// with these publicly-known credentials, and nothing in the app forces a
// change. Mitigated only by surfacing them on the login screen so the client
// cannot fail to notice them. If this app ever grows a network surface, or
// runs anywhere less trusted than a single-operator shop PC, revisit this.
export const DEFAULT_ADMIN_USERNAME = 'admin';
export const DEFAULT_ADMIN_PASSWORD = 'admin';

// Idempotent: only ever inserts when the table is completely empty, so it is
// safe to run on every launch and will never clobber a client's real password.
export async function ensureDefaultAdmin() {
  const existing = await getSettings();
  if (existing) return { created: false, username: existing.username };
  const passwordHash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10);
  await upsertSettings({ username: DEFAULT_ADMIN_USERNAME, passwordHash });
  return { created: true, username: DEFAULT_ADMIN_USERNAME };
}

// True while the account is still on its shipped default password — drives the
// warning banner on the login screen. Checks the hash, not a flag, so it stops
// warning the moment the client actually changes the password (and correctly
// starts warning again if they ever change it back).
export async function isUsingDefaultCredentials() {
  const settings = await getSettings();
  if (!settings) return false;
  if (settings.username !== DEFAULT_ADMIN_USERNAME) return false;
  return bcrypt.compare(DEFAULT_ADMIN_PASSWORD, settings.passwordHash);
}

export async function verifyCredentials(username, password) {
  if (!username || !password) throw new ValidationError('Username and password are required');
  const settings = await getSettings();
  if (!settings || username !== settings.username) throw new InvalidCredentialsError('Invalid credentials');
  const match = await bcrypt.compare(password, settings.passwordHash);
  if (!match) throw new InvalidCredentialsError('Invalid credentials');
  return { username: settings.username };
}

export async function changeSettings({ username, oldPassword, newPassword }) {
  if (!username?.trim()) throw new ValidationError('Username is required');
  const settings = await getSettings();
  let passwordHash = settings?.passwordHash;
  if (newPassword) {
    const match = settings && await bcrypt.compare(oldPassword || '', settings.passwordHash);
    if (!match) throw new ValidationError('Old password is incorrect');
    passwordHash = await bcrypt.hash(newPassword, 10);
  }
  if (!passwordHash) throw new ValidationError('No existing settings to update');
  const updated = await upsertSettings({ username: username.trim(), passwordHash });
  return { username: updated.username };
}
