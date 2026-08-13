export {};

// Matches Desktop_app/preload.js exactly — one explicit function per IPC
// channel, envelope shape from DECISIONS.md's Group 5 entry. Loosely typed
// here (unknown in, unknown out) on purpose: the precise per-domain types
// live in src/lib/*.ts, which unwrap the envelope via callIpc<T>().
interface IpcResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: { message: string; code: string };
}

declare global {
  interface Window {
    api: {
      auth: {
        login: (username: string, password: string) => Promise<IpcResult>;
        updateSettings: (payload: unknown) => Promise<IpcResult>;
      };
      articles: {
        list: (filter?: unknown) => Promise<IpcResult>;
        create: (data: unknown) => Promise<IpcResult>;
        delete: (id: string) => Promise<IpcResult>;
      };
      clients: {
        list: () => Promise<IpcResult>;
        get: (id: string) => Promise<IpcResult>;
        create: (data: unknown) => Promise<IpcResult>;
      };
      chemicals: {
        summary: () => Promise<IpcResult>;
        listPurchases: (filter?: unknown) => Promise<IpcResult>;
        createPurchase: (data: unknown) => Promise<IpcResult>;
        listUsages: (filter?: unknown) => Promise<IpcResult>;
        createUsage: (data: unknown) => Promise<IpcResult>;
      };
      expenses: {
        list: (filter?: unknown) => Promise<IpcResult>;
        create: (data: unknown) => Promise<IpcResult>;
      };
      bills: {
        list: (filter?: unknown) => Promise<IpcResult>;
        create: (data: unknown) => Promise<IpcResult>;
      };
      productions: {
        list: (filter?: unknown) => Promise<IpcResult>;
        create: (data: unknown) => Promise<IpcResult>;
      };
      slips: {
        list: (filter?: unknown) => Promise<IpcResult>;
        create: (data: unknown) => Promise<IpcResult>;
        get: (id: string) => Promise<IpcResult>;
        update: (id: string, items: unknown) => Promise<IpcResult>;
        delete: (id: string) => Promise<IpcResult>;
      };
      payments: {
        list: (filter?: unknown) => Promise<IpcResult>;
        create: (data: unknown) => Promise<IpcResult>;
      };
      profit: {
        monthly: (month?: string) => Promise<IpcResult>;
        annual: (year?: string | number) => Promise<IpcResult>;
        analytics: (month?: string, year?: string | number) => Promise<IpcResult>;
      };
      updates: {
        check: () => Promise<IpcResult<{ currentVersion: string; availableVersion: string; updateAvailable: boolean }>>;
        install: () => Promise<IpcResult<void>>;
      };
    };
  }
}
