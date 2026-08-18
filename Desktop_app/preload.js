const { contextBridge, ipcRenderer } = require('electron');

// Every call is explicit here (accepted over a Proxy/FEATURES-registry
// pattern — see DECISIONS.md's Group 5 entry): the full set of available
// actions is bounded and known upfront, so the explicitness of "every call
// visible in this one file" was chosen over the lower per-feature boilerplate
// a Proxy-based bridge would give as the app grows.
contextBridge.exposeInMainWorld('api', {
  auth: {
    login: (username, password) => ipcRenderer.invoke('auth:login', username, password),
    updateSettings: (payload) => ipcRenderer.invoke('auth:updateSettings', payload),
    isUsingDefaultCredentials: () => ipcRenderer.invoke('auth:isUsingDefaultCredentials'),
  },
  articles: {
    list: (filter) => ipcRenderer.invoke('articles:list', filter),
    create: (data) => ipcRenderer.invoke('articles:create', data),
    delete: (id) => ipcRenderer.invoke('articles:delete', id),
  },
  clients: {
    list: () => ipcRenderer.invoke('clients:list'),
    get: (id) => ipcRenderer.invoke('clients:get', id),
    create: (data) => ipcRenderer.invoke('clients:create', data),
  },
  chemicals: {
    summary: () => ipcRenderer.invoke('chemicals:summary'),
    listPurchases: (filter) => ipcRenderer.invoke('chemicals:listPurchases', filter),
    createPurchase: (data) => ipcRenderer.invoke('chemicals:createPurchase', data),
    listUsages: (filter) => ipcRenderer.invoke('chemicals:listUsages', filter),
    createUsage: (data) => ipcRenderer.invoke('chemicals:createUsage', data),
  },
  expenses: {
    list: (filter) => ipcRenderer.invoke('expenses:list', filter),
    create: (data) => ipcRenderer.invoke('expenses:create', data),
  },
  bills: {
    list: (filter) => ipcRenderer.invoke('bills:list', filter),
    create: (data) => ipcRenderer.invoke('bills:create', data),
  },
  productions: {
    list: (filter) => ipcRenderer.invoke('productions:list', filter),
    create: (data) => ipcRenderer.invoke('productions:create', data),
  },
  slips: {
    list: (filter) => ipcRenderer.invoke('slips:list', filter),
    create: (data) => ipcRenderer.invoke('slips:create', data),
    get: (id) => ipcRenderer.invoke('slips:get', id),
    update: (id, items) => ipcRenderer.invoke('slips:update', id, items),
    delete: (id) => ipcRenderer.invoke('slips:delete', id),
  },
  payments: {
    list: (filter) => ipcRenderer.invoke('payments:list', filter),
    create: (data) => ipcRenderer.invoke('payments:create', data),
  },
  profit: {
    monthly: (month) => ipcRenderer.invoke('profit:monthly', month),
    annual: (year) => ipcRenderer.invoke('profit:annual', year),
    analytics: (month, year) => ipcRenderer.invoke('profit:analytics', month, year),
  },
  updates: {
    check: () => ipcRenderer.invoke('updates:check'),
    install: () => ipcRenderer.invoke('updates:install'),
  },
  backup: {
    selectExternalFolder: () => ipcRenderer.invoke('backup:selectExternalFolder'),
    runExternal: (destinationFolder) => ipcRenderer.invoke('backup:runExternal', destinationFolder),
  },
});
