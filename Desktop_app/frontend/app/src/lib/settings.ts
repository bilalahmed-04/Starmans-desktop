import { callIpc } from '@/lib/api';

export interface UpdateSettingsPayload {
  username: string;
  oldPassword?: string;
  newPassword?: string;
}

export interface UpdateSettingsResponse {
  username: string;
}

export function updateSettings(payload: UpdateSettingsPayload): Promise<UpdateSettingsResponse> {
  return callIpc<UpdateSettingsResponse>(window.api.auth.updateSettings(payload));
}
