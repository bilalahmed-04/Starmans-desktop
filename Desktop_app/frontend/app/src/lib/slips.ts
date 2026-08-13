import { apiRequest } from '@/lib/api';
import type { Client, SlipItem } from '@/types';

export function getClients(): Promise<Client[]> {
  return apiRequest<Client[]>('/clients');
}

export interface CreateSlipPayload {
  clientName: string;
  clientPhone: string;
  clientResolution?: 'existing' | 'new';
  items: SlipItem[];
}

export function createSlip(payload: CreateSlipPayload): Promise<unknown> {
  return apiRequest('/slips', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function deleteSlip(id: string): Promise<{ message: string }> {
  return apiRequest<{ message: string }>(`/slips/${id}`, { method: 'DELETE' });
}

export function updateSlip(id: string, items: SlipItem[]): Promise<unknown> {
  return apiRequest(`/slips/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ items }),
  });
}
