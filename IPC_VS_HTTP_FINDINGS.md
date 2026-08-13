# Findings — Electron IPC over Localhost HTTP

*Analysis prepared and verified by Claude Fable 5 — 2026-08-13.*

> Decision record for how the renderer (React UI) talks to the backend inside an Electron desktop
> app: **native Electron IPC** vs. an **embedded Express server on `127.0.0.1`**. Written against
> two concrete apps:
>
> - **Wentox** — already on IPC. Distributed as a self-updating appliance: GitHub Actions builds →
>   GitHub Releases → `electron-updater` "Check for updates"; MSSQL is provisioned silently by the
>   installer script. Single machine, single user.
> - **The second app** (`PROPOSED_PLAN.md`) — live Express + MongoDB REST backend undergoing a
>   forced MongoDB → MSSQL migration; localhost HTTP proposed.
>
> Both apps share the same deployment model (auto-update, single machine, script-provisioned
> database). The sections below report each approach's technical properties under that model; §6
> summarizes them.

---

## 1. The two approaches

| | Electron IPC | Localhost HTTP |
|---|---|---|
| Call flow | `window.api.<feature>.<action>(payload)` → preload `contextBridge` → `ipcMain.handle('<feature>:<action>')` → service → repository → DB | `fetch('http://127.0.0.1:<port>/api/...')` → Express route → controller → service → DB |
| Backend shape | Plain JS modules in the main process; no server, no socket | Full Express server bound to loopback, port chosen at runtime (`listen(0)`) |
| Transport | Structured-clone message passing, in-process | JSON over the OS TCP/IP stack |
| Auth | In-memory session in the main process; no token crosses a wire | Whatever the API does (JWT/session/token) — now over a local socket |
| Failure modes | Per-call errors only | Timeouts, port conflicts, readiness races, connection refused |

---

## 2. Technical characteristics of IPC

### 2.1 No listening socket

A loopback-bound socket accepts connections from any process running as the same OS user, not
just the app itself — this includes other local software and, via requests to `localhost` or
DNS-rebinding against a naïvely-configured origin check, web pages open in the user's browser.
Local-server desktop apps have shipped CVEs on this exact vector (e.g. Zoom's 2019 localhost
web-server issue). Mitigating it requires app-level auth layered on top of the transport.

IPC has no socket, port, or listener — there is nothing on the machine for another process to
connect to. The mitigation the HTTP case requires (auth, origin checks) has no equivalent
requirement under IPC, because the class of connection it defends against cannot occur.

### 2.2 No Windows Firewall prompt

An app that opens a listening socket can trigger the Windows Firewall dialog on first launch. A
non-technical user may not recognize what the prompt is for, and if they click **Block**, the app
fails to reach its own backend — a failure mode that is difficult to diagnose remotely. IPC opens
no socket, so the prompt cannot appear.

### 2.3 No server lifecycle to own

An embedded HTTP server is a lifecycle the app must manage on every launch:

- **Readiness race** — the renderer must not `fetch()` before the server has bound its port and
  the port has been injected into the page. With `listen(0)` (dynamic port), this handshake runs
  on every launch.
- **Port management** — `listen(0)` removes static conflicts but the assigned port must still be
  plumbed to the renderer at the right moment.
- **Crash handling** — an unhandled throw in an in-process Express server can take down the main
  process; isolating it means a `utilityProcess`/child, which adds spawn, kill, restart, and
  zombie-process handling.

Under IPC, handlers are registered synchronously in the main process before the window opens, so
the readiness race, port allocation, and crash-respawn logic described above do not apply.

### 2.4 Packaging, signing, and antivirus heuristics under auto-update

Two properties of the auto-update distribution model interact with this choice:

- An app that downloads and swaps its own binary (`electron-updater`) and an app that silently
  launches a listening server are each, independently, a pattern AV/SmartScreen heuristics flag.
  HTTP combines both in the same app; IPC carries only the first.
- No bundled Express/Node server binary means a smaller artifact, which means faster and more
  reliable update downloads and less surface to sign.

### 2.5 Auto-update robustness

`electron-updater`'s quit-and-relaunch tears the app down and brings it back. With HTTP, every
relaunch re-runs the bind-and-inject-port handshake — one additional step that can fail during an
update, when the app is already mid-transition between versions. With IPC there is nothing to
rebind.

### 2.6 First launch with script-provisioned MSSQL

On the first launch, the installer script is still creating the database. IPC has one gate: DB
ready. HTTP has two: DB ready and server bound + port injected — both on the launch that is
already the most failure-prone.

### 2.7 Performance on heavy payloads

Reports, exports, and PDF/image blobs pay HTTP's serialize → TCP → parse cost, and binary data is
base64-inflated in transit. IPC moves structured data via structured clone and can hand off binary
without inflation. This is not significant for form-sized payloads, but the cost concentrates on
the heavier operations.

### 2.8 No network failure-modes in application code

Once the boundary is HTTP, network-shaped concerns spread into the app: status codes, timeouts,
retries, CORS, JSON error envelopes — for calls to code in the same binary. Under IPC, "the
request timed out," "got a 502," or "connection refused" are not cases the code has to handle;
they cannot occur.

### 2.9 Multi-terminal / LAN access is not a current requirement for either app

HTTP's transport would support a second terminal on a LAN without a transport-level change; IPC's
would not. Neither app has a stated near-term requirement for this. If it becomes a requirement
later, loopback HTTP with single-user, in-memory-session auth would still need rework — transport
security and multi-client auth are not the same problem as loopback-only auth — so today's cost of
keeping a socket open is only partially offset by that future option.

---

## 3. Technical characteristics of HTTP

### 3.1 Reuse of an existing REST backend

If a working Express API already exists, routing it over HTTP preserves routes, validation,
controllers, and business logic unchanged, avoiding a rewrite. This reduces migration cost and
regression risk once, at build time. It does not change the ongoing, per-launch properties in §2 —
those apply for as long as the app ships an HTTP server, independent of how the backend code was
originally reused.

### 3.2 Migration scope when a data-layer rewrite is already required

The second app's data layer must be rewritten regardless (MongoDB → MSSQL). Under IPC, that
migration also requires changing every handler's signature (`req`/`res` → IPC event/return),
estimated at +2 weeks in `PROPOSED_PLAN.md`. Under HTTP, the rewrite is confined to the
data-access layer; handler signatures are unchanged.

### 3.3 Standalone testability

A REST surface can be exercised with curl/Postman independent of the Electron shell, and
frontend/backend development can proceed against a fixed contract. IPC handlers have no standalone
network surface; testing targets the service layer directly instead.

### 3.4 Multi-client requirements

A network transport (HTTP) supports additional clients — a second terminal, a web client, mobile —
without a transport-level change. An in-process transport (IPC) does not; adding a client later
would require introducing a network layer at that point. Neither app currently has this
requirement (§2.9).

---

## 4. IPC's own implementation details

IPC is not free of quirks — Wentox encountered and resolved these; any IPC app needs to:

| Detail | Fix (as implemented in Wentox) |
|---|---|
| Electron strips custom properties (e.g. `.code`) off errors thrown across `ipcMain.handle` | Never throw across the boundary — `wrap.js` resolves `{ ok: false, error: { message, code } }` / `{ ok: true, data }` |
| Preload bridge becomes a maintenance chore (one exposed function per channel) | Expose a single `__ipcInvoke` primitive via `contextBridge`; build `window.api` with a Proxy from a `FEATURES` array |
| Forgetting to register a feature makes `window.api.<feature>` `undefined` — TypeError far from the cause | New feature = ipc/service/repository files + registrar line + `FEATURES` entry (checklist in `backend/CLAUDE.md`) |
| Structured clone won't pass functions/class instances | Keep payloads plain-JSON-shaped at the boundary |

These are implementation details specific to the IPC boundary, independent of the transport-level
properties reported in §2–3.

---

## 5. If HTTP is chosen — required hardening

Before build-out, `PROPOSED_PLAN.md` should account for the following, not yet addressed in that
plan:

1. **Readiness gate** — do not `loadURL()` until `listen(0)` has called back; pass the port via
   `additionalArguments`/preload global, never a hardcoded `VITE_API_URL`.
2. **Bind explicitly to `127.0.0.1`** — never `0.0.0.0` (which both triggers the firewall prompt
   *and* exposes the API to the LAN).
3. **Per-launch random bearer token** — generated in main, injected into the renderer, required on
   every request; plus an `Origin`/`Host` check. This is the minimum needed to stop other local
   processes/webpages from driving the API (§2.1).
4. **Firewall verification** on the target Windows build (loopback-only binds usually avoid the
   prompt, but verify).
5. **Crash isolation** — run Express in a `utilityProcess` so a backend crash doesn't kill the
   window; own the spawn/kill/restart logic that creates.
6. **Treat the silent SQL Server install as its own risk item** — unattended install, instance
   naming, auth mode, and connection-string discovery are more likely to affect the timeline than
   the transport choice.

---

## 6. Summary and recommendation

| Property | Favors | Why it matters for an auto-updating, script-provisioned appliance |
|---|---|---|
| Listening socket / attack surface | **IPC** | No socket for local processes/webpages to reach |
| Firewall prompt | **IPC** | Nothing for a non-technical client to misclick |
| Auto-update robustness | **IPC** | Nothing to rebind on relaunch; no port race during updates |
| AV / SmartScreen friction | **IPC** | Avoids the "self-updating app + listening server" double flag |
| First-launch DB provisioning | **IPC** | One ordering gate, not two |
| Server lifecycle | **IPC** | Race/port/zombie/restart handling is not needed |
| Bundle & signing | **IPC** | No server binary to ship |
| Heavy payloads | **IPC** | No JSON/TCP/base64 cost on reports and exports |
| Reuse of existing REST backend | HTTP | Only applies if one still exists |
| Forced-DB-migration economics | HTTP | Confines the rewrite to the data-access layer |
| Standalone testability | HTTP | curl/Postman/API contract |
| Concrete multi-client roadmap | HTTP | Only if such a requirement exists |

### Application to each app

- **Wentox**: already on IPC; there is no REST backend left to reuse, and the eight properties
  above under "Favors: IPC" all apply directly to its deployment model. The one thing that would
  reopen the question is a concrete near-term requirement for a second terminal on the LAN (§2.9).
- **Second app**: an existing REST backend lowers the migration cost of choosing HTTP (§3.1–3.2),
  but does not change the ongoing properties in §2, which apply for as long as the app ships an
  HTTP server — regardless of how the backend was originally built.

Under this deployment model, the properties in §2 apply independent of whether a REST backend
already exists. An existing REST backend changes the one-time cost of adopting IPC; it does not
change the ongoing cost/risk profile reported in §2.
