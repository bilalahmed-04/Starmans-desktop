// No token/session handling here anymore — every IPC call already only ever
// originates from this app's own renderer process inside the OS process
// boundary, so there's no remote attacker for a token to defend against.
// See DECISIONS.md's Group 5 entry ("drop JWT entirely under IPC").

export class IpcError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

interface IpcResult {
  ok: boolean;
  data?: unknown;
  error?: { message: string; code: string };
}

// T is supplied explicitly at each call site (window.api's methods return a
// loosely-typed IpcResult — see types/window.d.ts — so TS can't infer T from
// the argument alone; every lib/*.ts caller passes callIpc<ConcreteType>(...)).
export async function callIpc<T>(promise: Promise<IpcResult>): Promise<T> {
  const result = await promise;
  if (!result.ok) {
    throw new IpcError(result.error?.message ?? 'Request failed', result.error?.code ?? 'internal_error');
  }
  return result.data as T;
}

export interface LoginResponse {
  username: string;
}

export function login(username: string, password: string): Promise<LoginResponse> {
  return callIpc<LoginResponse>(window.api.auth.login(username, password));
}
