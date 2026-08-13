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
