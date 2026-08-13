import { findClients, findClientById, findClientByNameCaseInsensitive, createClient } from '../models/Client.js';
import { ValidationError, NotFoundError } from './errors.js';

export class ClientExistsError extends Error {
  constructor(client) {
    super('Client already exists');
    this.code = 'client_exists';
    this.client = client;
  }
}

export async function listClients() {
  return findClients();
}

export async function getClient(id) {
  if (!Number.isInteger(id)) throw new NotFoundError('Client not found');
  const client = await findClientById(id);
  if (!client) throw new NotFoundError('Client not found');
  return client;
}

export async function addClient({ name, phone }) {
  if (!name?.trim() || !phone?.trim()) throw new ValidationError('Name and phone are required');
  const existing = await findClientByNameCaseInsensitive(name.trim());
  if (existing) throw new ClientExistsError(existing);
  return createClient({ name: name.trim(), phone: phone.trim() });
}
