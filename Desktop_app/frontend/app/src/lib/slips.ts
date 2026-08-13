import { callIpc } from '@/lib/api';
import type { Client, SlipItem } from '@/types';

export function getClients(): Promise<Client[]> {
  return callIpc<Client[]>(window.api.clients.list());
}

export interface CreateSlipPayload {
  clientName: string;
  clientPhone: string;
  clientResolution?: 'existing' | 'new';
  items: SlipItem[];
}

export function createSlip(payload: CreateSlipPayload): Promise<unknown> {
  return callIpc<unknown>(window.api.slips.create(payload));
}

export function deleteSlip(id: string): Promise<void> {
  return callIpc<void>(window.api.slips.delete(id));
}

export function updateSlip(id: string, items: SlipItem[]): Promise<unknown> {
  return callIpc<unknown>(window.api.slips.update(id, items));
}
