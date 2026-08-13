# Proposed Plan — Localhost Rendering Architecture for the Electron Desktop App

> **⚠️ Superseded 2026-08-13** — this plan's core recommendation (localhost HTTP) was reversed in favor of Electron IPC. See `DECISIONS.md` and `IPC_VS_HTTP_FINDINGS.md` for the current decision and reasoning. This document is kept as a historical record of the original evaluation.

> Covers the goal, architecture, and approach for running the existing Express backend and React frontend together inside a single Windows Electron desktop app, using a local HTTP connection (not IPC), with dynamic port allocation to eliminate port-conflict risk.

---

## 1. Goal

Convert the current browser-based client-server app (React frontend + Express/MongoDB backend, hosted separately) into a **single-executable Windows desktop application** that:

- Runs entirely on the client's own computer, with **no internet dependency during day-to-day use**
- Looks and behaves like a normal native desktop app — one icon, one window, no visible browser chrome, no visible URLs or ports
- Reuses the existing, already-built Express backend and React frontend with **minimal rewriting**, keeping the migration timeline and risk as low as possible
- Uses **MSSQL** as the database (replacing MongoDB/Atlas), installed locally on the client's machine
- Supports **automatic updates** in the future via GitHub Actions + `electron-updater`, without requiring the client to manually reinstall anything

---

## 2. Approach: Localhost HTTP, not IPC

### 2.1 The core idea

Electron apps are made of two processes:
- **Main process** — the backend/OS-level process
- **Renderer process** — the window the user actually sees (a Chromium browser view)

Instead of rewriting the frontend to talk to the backend through Electron's native IPC channels, this plan keeps the **existing REST API architecture**: the Express backend runs inside the **main process** as a normal local HTTP server, bound to `127.0.0.1` (loopback only — never exposed to the network). The React frontend, running in the **renderer process**, continues to call it with ordinary `fetch()` requests — exactly as it does today against a remote server, just now pointed at a local address instead.

```
┌─────────────────────────── Electron App ───────────────────────────┐
│                                                                      │
│   Main Process                         Renderer Process             │
│   ┌───────────────────────┐            ┌─────────────────────────┐ │
│   │  Express backend       │  HTTP      │  React frontend         │ │
│   │  (existing routes,     │◄──────────►│  (existing lib/*.ts     │ │
│   │  business logic,       │ 127.0.0.1  │  fetch() calls,         │ │
│   │  MSSQL connection)     │  :<port>   │  unchanged)              │ │
│   └───────────┬────────────┘            └─────────────────────────┘ │
│               │                                                     │
│               ▼                                                     │
│      Local MSSQL instance                                           │
│      (installed on the client's machine)                            │
│                                                                      │
└──────────────────────────────────────────────────────────────────┘
```

Nothing in this diagram touches the internet. The HTTP call between renderer and main process never leaves the machine.

### 2.2 Why this approach over IPC

| | Localhost HTTP (this plan) | Electron IPC |
|---|---|---|
| Frontend rewrite | None — existing `fetch()`-based `lib/*.ts` files work unchanged, only the base URL changes | Every one of the 9 API files rewritten to `ipcRenderer.invoke()`, plus a new `preload.js` bridge exposing ~30 channels |
| Backend rewrite | Only the database layer changes (MongoDB → MSSQL); route handler shape (`req`/`res`) stays the same | Both the database layer *and* every handler's function signature changes (`req`/`res` → IPC event/return-or-throw) |
| Testability | REST API remains independently testable (Postman/curl) during development | No standalone API surface to test against — everything is Electron-internal |
| Future flexibility | Same backend could later serve a second terminal/tablet on a LAN with no rework | Tied permanently to a single-process, single-machine model |
| Estimated added timeline | Baseline (already accounted for in the MSSQL migration estimate) | Roughly +2 weeks on top of the MSSQL migration, since nearly every file is touched twice |

**Decision: use localhost HTTP.** It reuses the most code, carries the least additional risk on top of the already-necessary MSSQL rewrite, and produces an identical end-user experience — the client will never know or care that the app is technically making local HTTP calls to itself.

---

## 3. Dynamic Port Allocation

### 3.1 The problem it solves

Hardcoding a fixed port (e.g. `5000`) for the local Express server creates a real failure mode: another application already running on the client's machine (a dev tool, another background service, etc.) could already be using that exact port, which would prevent the app's backend from starting.

### 3.2 The approach

Instead of requesting a specific port number, the Express server asks the operating system for **any currently free port**:

```js
const server = app.listen(0); // 0 = "give me any available port"
const assignedPort = server.address().port;
```

This is a standard, well-established technique — the OS is the single source of truth for which ports are in use system-wide at any given moment, so it can guarantee the port it hands back is free **at that exact instant**. There is no scenario where this fails due to a port conflict, because the app never claims a specific number in the first place.

### 3.3 How the frontend learns the assigned port

Since the port is only known at runtime (it changes between app launches), the main process passes the actual assigned port to the renderer before the page finishes loading — for example, by injecting it as a small runtime value the renderer reads on startup, rather than relying on a hardcoded `VITE_API_URL`. The existing `lib/api.ts` base-URL logic is adapted to read this dynamic value instead of a fixed constant.

### 3.4 Reserved-port awareness

Ports `0`–`1023` are OS-reserved "well-known" ports (e.g. `80` for HTTP, `443` for HTTPS) and typically require administrator privileges to bind — the dynamic allocation approach never touches this range, since the OS only ever hands back an available port above that threshold.

### 3.5 Net result

- No fixed port to configure, document, or troubleshoot
- No risk of startup failure due to a port already being in use by another app
- No need to shut down or interfere with any other application on the client's machine
- Entirely invisible to the end user — they never see a port number, a URL, or any indication that a local server is involved at all

---

## 4. Supporting Pieces (for context, not the focus of this plan)

- **Database**: MSSQL, installed on the client's machine via the app's Windows installer (downloaded during setup, per the agreed approach — not bundled offline, to keep installer size reasonable)
- **Installer**: a single Windows `.exe` (via `electron-builder`/NSIS) that installs the app, installs SQL Server if not already present, and creates the database schema on first launch — all behind a standard "Next → Next → Finish" wizard
- **Auto-update** (future): a GitHub Actions workflow builds and publishes new versions as GitHub Releases; `electron-updater` inside the app checks for and applies updates automatically. Deferred until the Electron shell itself is built.

---

## 5. Summary

| Question | Answer |
|---|---|
| Does the client need internet to use the app? | No — internet is only needed during the one-time installation of MSSQL |
| Will the client know the app is running a local server? | No — it looks, feels, and behaves like a normal native desktop app |
| Does this require rewriting the frontend? | No — existing `fetch()`-based API calls work as-is, only the base URL/port becomes dynamic |
| Does this require rewriting the backend? | Only the database layer (MongoDB → MSSQL) — route logic and structure stay intact |
| What happens if the app's usual port is already taken by another program? | Nothing — the app never requests a fixed port; it asks the OS for any free one at startup |
