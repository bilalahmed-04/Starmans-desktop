import { apiRequest } from '@/lib/api';

export interface UpdateSettingsPayload {
  username: string;
  oldPassword?: string;
  newPassword?: string;
}

export interface UpdateSettingsResponse {
  message: string;
  token: string;
  username: string;
}

export function updateSettings(payload: UpdateSettingsPayload): Promise<UpdateSettingsResponse> {
  return apiRequest<UpdateSettingsResponse>('/auth/settings', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}
