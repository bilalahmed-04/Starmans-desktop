# Decision Log

> Every meaningful technical decision made on this project, in the order they were made. Each entry records **what** was decided, **why**, and what alternatives were considered and rejected. New entries are appended as the project progresses — this file is never rewritten retroactively, only added to (unless a past decision is explicitly reversed, in which case the reversal is logged as its own new entry referencing the old one).

---

## 2026-08-13 — Replace MongoDB with MSSQL

**Decision:** Migrate the backend's database layer from MongoDB/Mongoose to Microsoft SQL Server.

**Why:** Required by the client/project scope for the desktop version. Also enables using a well-supported, silently-installable local database engine (SQL Server Express/LocalDB) as part of a scripted Windows installer — a capability MongoDB doesn't offer in the same turnkey way for an end-user desktop install.

**Alternatives considered:** Keeping MongoDB (rejected — not the client's requirement, and doesn't fit the "simple Windows installer" goal as cleanly); SQLite as a lighter local-only alternative (not chosen — client explicitly wants MSSQL; noted in `EFFORT_ANALYSIS.md` as a lower-friction option but not pursued since MSSQL was later confirmed as final).

---

## 2026-08-13 — Package the app as Electron for Windows desktop

**Decision:** Wrap the existing Express backend + React frontend inside an Electron shell, distributed as a Windows installer.

**Why:** Client wants a single-user, single-machine desktop app rather than a browser-based client-server deployment. Electron lets the existing React frontend run largely unchanged inside a native-feeling window, and lets the existing Express backend run as a local process instead of a hosted server.

**Alternatives considered:** Native Windows app (WPF/.NET, etc.) — rejected, would require a full rewrite of the frontend and backend in a different stack, discarding all existing work.

---

## 2026-08-13 — Frontend ↔ backend communication: keep localhost HTTP, do not refactor to Electron IPC

**Decision:** Inside the Electron app, the Express backend continues running as a local HTTP server bound to `127.0.0.1`, and the React frontend continues calling it via ordinary `fetch()` — the same pattern used today against a remote server, just pointed at a local address.

**Why:** Reuses the existing REST API, validation, and business logic with minimal changes — only the database layer needs rewriting for MSSQL, not the transport layer. An IPC-based redesign would require rewriting all 10 backend route files' handler signatures *and* all 9 frontend `lib/*.ts` files' call patterns, on top of the MSSQL migration that's happening either way — roughly doubling the rewrite surface for a single-window, single-user app where IPC's main advantages (no listening socket, no port) don't outweigh the added risk and timeline. Full comparison recorded in `EFFORT_ANALYSIS.md` §2.2 and the `PROPOSED_PLAN.md`.

**Alternatives considered:** Full Electron IPC (main process calls DB directly, renderer talks over `ipcMain`/`ipcRenderer`) — rejected for this project; estimated to add ~2 weeks and touch ~20 files vs. the HTTP approach's more contained scope. Documented as a real tradeoff, not a dismissed option — could be revisited if the app's requirements change (e.g. it will never need a second terminal/LAN mode).

**Known tradeoff accepted:** the local HTTP server may trigger a one-time Windows Firewall permission prompt on first launch, and requires dynamic port allocation (see next entry) to avoid port-conflict failures. Considered acceptable, low-cost tradeoffs compared to a full IPC rewrite.

---

## 2026-08-13 — REVERSED: adopt Electron IPC, not localhost HTTP

**Decision:** Reverses the entry immediately above. The renderer↔main transport is now Electron IPC (`ipcMain`/`ipcRenderer` + `contextBridge`), not a localhost Express server. This is the second time this exact question has been decided — the answer changed.

**Why:** `IPC_VS_HTTP_FINDINGS.md` (root of repo, authored by Claude Fable 5, 2026-08-13) is a rigorous per-property comparison of IPC vs. localhost HTTP evaluated specifically against *this app's actual deployment model*: single machine, single user, auto-updating via GitHub Actions + `electron-updater`, MSSQL provisioned silently by the installer script. That framing wasn't applied with this level of rigor when the original HTTP decision was made. Under it, IPC wins on 8 of 12 properties:
- **No listening socket / attack surface** — a loopback socket still accepts connections from any process running as the same OS user (and, via DNS-rebinding against a naively-configured origin check, from browser tabs); IPC has no socket at all, so this class of vulnerability cannot occur.
- **No Windows Firewall prompt** — nothing for a non-technical client to misclick "Block" on.
- **Simpler first-launch ordering** — one readiness gate (DB ready) instead of two (DB ready *and* server bound + port injected into the renderer) on the launch that's already the most failure-prone (installer script is still provisioning MSSQL).
- **No server lifecycle to own** — no readiness race, no port-conflict handling, no crash-isolation (`utilityProcess` spawn/kill/restart) that an in-process Express server would otherwise require.
- **Better auto-update robustness** — `electron-updater`'s quit-and-relaunch has nothing to rebind under IPC; under HTTP every relaunch re-runs the bind-and-inject-port handshake, one more thing that can fail mid-update.
- **Lower AV/SmartScreen friction** — "self-updating app" and "silently launches a listening server" are each independently a pattern AV heuristics flag; HTTP combines both, IPC carries only the first.
- **Smaller signed artifact** — no bundled Express/Node server binary to ship or sign.
- **No network-shaped failure modes in application code** — status codes, timeouts, retries, CORS, JSON error envelopes for calls that never leave the process; these simply cannot occur under IPC.

**What changes vs. the original localhost-HTTP reasoning:** the original decision's stated reasons for HTTP (reuse the existing Express routes unchanged, avoid touching frontend `lib/*.ts`) are real, one-time migration-cost advantages — not disputed. But per the Findings doc, they are a *build-time* cost, not an *ongoing* property: they don't change any of the 8 points above, which apply for as long as the shipped app runs a local HTTP server. Re-weighed against this app's actual deployment model (auto-update + silent installer + single machine, no near-term multi-client requirement), the ongoing properties are judged to outweigh the one-time reuse savings.

**New scope this reopens (not something the MSSQL migration already accounted for):** every backend route file migrated to MSSQL under the HTTP assumption (Tasks 2–11 in `TASKS.md` — check that file for current per-task status, not restated here since it changes as agents complete tasks) is written as an Express `req`/`res` handler. Under IPC, each needs its business logic separated from that transport shape so it's callable from `ipcMain.handle` instead. This is real, not-yet-done work — logged as new tasks in `TASKS.md` (Group 5), not retroactively folded into Tasks 2–11's status, which accurately describes the MSSQL rewrite itself (a separate, already largely-complete concern from the transport-shape work Group 5 covers).

**Recommended IPC implementation conventions** (from `IPC_VS_HTTP_FINDINGS.md` §4, sourced from a reference app, "Wentox," already shipping this way) — logged here as *recommended for when Group 5 work begins*, not a locked-in implementation decision requiring its own separate quiz, since no code is being written in this pass:
- Never throw raw errors across `ipcMain.handle` (Electron strips custom properties like `.code` off thrown errors) — resolve a `{ ok: true, data }` / `{ ok: false, error: { message, code } }` envelope instead.
- Expose a single `contextBridge` primitive (e.g. `__ipcInvoke`) and build `window.api` via a `Proxy` over a `FEATURES` registry, rather than hand-exposing one function per channel (avoids the maintenance chore of a growing preload file, and avoids `window.api.<feature>` silently being `undefined` when a feature is forgotten from the registry).
- Keep IPC payloads plain-JSON-shaped — structured clone can't carry functions or class instances across the boundary.

**Alternatives reconsidered:** localhost HTTP (the immediately preceding entry) — not rejected as wrong for every app (the Findings doc notes it's the right call for an app with a genuine near-term multi-client/LAN requirement, which this app doesn't have), just reversed for this app's specific deployment model.

**Open question, not resolved by this entry:** whether `Backend/src/routes/*.js` (Express) stays in the codebase as an optional dev-only testability harness (curl/Postman against a fixed contract, per Findings §3.3) once IPC ships, or gets removed entirely. Deferred — see `TASKS.md` Group 5 note.

---

## 2026-08-13 — Use dynamic port allocation instead of a fixed port

> **Moot as of the IPC reversal below** — this entry solved a problem specific to running a local HTTP server. Under IPC there is no server and no port to allocate, so this decision no longer applies to the shipped app. Kept for historical context (and in case Express is ever kept as a dev-only harness per the open question in the reversal entry, in which case this reasoning would still apply to *that* optional dev server).

**Decision:** The Express server started inside Electron's main process requests an OS-assigned free port (`listen(0)`) at startup, rather than a hardcoded port like `5000`. The frontend receives the actual assigned port at runtime instead of relying on a fixed constant.

**Why:** A hardcoded port risks colliding with another application already using it on the client's machine, which would prevent the backend from starting. Asking the OS for any free port eliminates this failure mode entirely rather than just reducing its likelihood, since the OS guarantees the returned port is free at that moment.

**Alternatives considered:** Fixed port with fallback/retry logic on `EADDRINUSE` — rejected as unnecessarily complex when the OS can just hand back a guaranteed-free port directly.

---

## 2026-08-13 — SQL Server installed via internet download during setup, not bundled offline

**Decision:** The Windows installer will download SQL Server (and other dependencies) from the internet during the one-time installation step, rather than embedding the SQL Server installer files inside the app's installer package.

**Why:** Client's explicit call — bundling SQL Server offline would make the installer file size too large to distribute comfortably. Internet is only required during the one-time install step, not during day-to-day use of the app afterward.

**Alternatives considered:** Fully offline/bundled installer (SQL Server installer embedded inside the app's `.exe`) — this was the initially recommended approach for a zero-internet-dependency install experience, but rejected by the client due to resulting installer file size.

---

## 2026-08-13 — Auto-update deferred until Electron shell exists; approach agreed in principle

**Decision:** When implemented, auto-updates will use a GitHub Actions workflow (triggered on version tags) that builds and publishes the installer as a GitHub Release, paired with `electron-updater` inside the app checking that release feed on launch. Not implemented yet — no Electron project is scaffolded in the repo as of this decision.

**Why:** Standard, well-supported pattern for Electron auto-update; avoids the client needing to manually reinstall the app for every update. Deferred because building the workflow file before the Electron app itself exists would produce a non-functional placeholder.

**Note:** Auto-update via `electron-updater` requires the installer to be **code-signed** — unsigned installers can't be silently trust-verified for auto-replacement. This is a future cost to budget for if auto-update remains a requirement, not yet resolved.

---

## 2026-08-13 — Development environment: MSSQL running locally on Linux dev machine

**Decision:** Backend/MSSQL migration development proceeds against the Linux build of SQL Server (`mssql-server` service) already installed and running on the developer's machine, with `mssql-tools18`'s `sqlcmd` added to `PATH` (`~/.zshrc`) for direct query access.

**Why:** Enables starting backend route-rewrite work immediately without needing a Windows machine for every development iteration. The final desktop installer still targets Windows specifically (SQL Server Express/LocalDB via the Windows installer) — this Linux instance is for backend development and testing only, not a substitute for eventual Windows/installer testing.

**Resolved 2026-08-13:** user set the `sa` password locally and confirmed the server is running. `.env.example`'s template committed a real password value by mistake (not gitignored) — scrubbed back to a blank placeholder before any commit was made; the working value now lives only in `Backend/.env` (gitignored, never entered git history — verified via a scan of the exact file set `git` would commit, plus a check that the secret does not appear in any existing commit). With this resolved, `001_initial_schema.sql` was run, `seed.js` populated all 14 tables, and a full smoke-test pass (login, slip create/edit/delete with stock deduction, the PUT double-restore fix, profit aggregation, chemical usage over-limit rejection) confirmed the entire MSSQL migration (Tasks 1–12) works correctly end-to-end, not just passes static checks. See `TASKS.md` Task 1 for the closing note.

---

## 2026-08-13 — MSSQL data-access approach: raw `mssql` (tedious) driver, INT auto-increment IDs, hand-written SQL migrations

**Decision:** Three related choices for the MSSQL layer, made together since they shape the same foundation:
1. **Driver:** use the raw `mssql` npm package (built on `tedious`, pure JavaScript) with hand-written SQL queries/transactions — no ORM.
2. **ID strategy:** SQL tables use `INT IDENTITY` auto-increment primary keys. The API layer casts these to strings on the way out, so the frontend's existing `id: string` type contract (built around Mongo ObjectIds) needs zero changes.
3. **Migrations:** plain numbered `.sql` files in `Backend/migrations/`, run manually (e.g. via `sqlcmd`) — no ORM-managed migration tooling.

**Why:** Client asked me to pick the most optimal option and log the reasoning.
- Raw `mssql`/tedious avoids native-binding rebuild problems inside Electron's packaged Node ABI (already flagged in `EFFORT_ANALYSIS.md` §2.3) — an ORM with native bindings would add packaging risk for no clear benefit on a backend this size. It also gives full manual control over transactions, which the stock-deduction race-condition fix (flagged as the #1 risk area in `EFFORT_ANALYSIS.md` §3) specifically needs — an ORM's default transaction API would work but adds an abstraction layer between the code and the exact locking behavior needed.
- `INT IDENTITY` keeps joins/indexes simple and fast for a small single-shop dataset, and casting to string on the way out means the frontend requires no changes — confirmed explicitly by the client over the GUID/UNIQUEIDENTIFIER alternative.
- Hand-written numbered migrations are transparent (every schema change is a plain, readable `.sql` file) and let multiple agents add new migrations in parallel without needing to coordinate through an ORM's migration-state tracking — fits the multi-agent task-board workflow already in place (`TASKS.md`).

**Alternatives considered:** Prisma (rejected — adds a Client-generation build step that needs extra care when packaged inside Electron, and less direct control over transaction/locking behavior); Sequelize (rejected — heavier dependency footprint, more abstraction than needed); TypeORM (rejected — decorator-based, fits TypeScript backends; this backend is plain JS, so the fit is weaker and unjustified extra complexity); UNIQUEIDENTIFIER/GUID IDs (rejected by client — slower joins/indexes at this data scale with no real benefit over INT + string-casting).

**Bundled fix:** the new MSSQL connection setup (`Backend/src/mssqlDb.js`) does **not** log the full connection string/credentials on connect — only host/port/database name. This closes the credential-logging issue already flagged against the old `db.js` in `ANALYSIS.md` §7, done opportunistically as part of this change rather than as a separate task.

**Transition approach:** the existing MongoDB connection (`Backend/src/db.js`) is left in place and still used by not-yet-migrated routes; the new MSSQL connection is added alongside it, not as a replacement, so the app keeps working incrementally as each route file is migrated one at a time (see `TASKS.md`). MongoDB/Mongoose gets removed as a final cleanup task once every route is migrated.

---

## 2026-08-13 — Electron code lives in a new `Desktop_app/` folder; shell only, no duplicated source

**Decision:** All Electron-specific code (main process, preload script if needed, packaging config) goes in a new top-level `Desktop_app/` folder. It does **not** contain copies of the backend or frontend code — it imports/runs the existing `Backend/` (once MSSQL-migrated) and builds/loads the existing `frontend/app/` output. `Backend/` and `frontend/app/` are not touched by this folder's creation.

**Why:** User's requirement was that the client ends up with a single `.exe` containing all dependencies. That outcome comes from how `electron-builder` packages the *output* — it bundles files from multiple source locations into one installer — not from how the *source code* is organized beforehand. Duplicating the backend/frontend into `Desktop_app/` would create two codebases needing to be kept in sync for every future fix or feature, with no packaging benefit, and would contradict the already-logged "reuse existing code" approach (see the localhost-HTTP decision above and `PROPOSED_PLAN.md`).

**Alternatives considered:** Fully self-contained `Desktop_app/` with its own duplicate copies of `Backend/` and `frontend/app/` — rejected; doubles maintenance burden (every bug fix or feature applied twice) for no gain, since the single-`.exe` requirement is satisfied by the build/packaging step regardless of source layout.

**Current status:** folder created, but empty of actual Electron code (`main.js`, packaging config) — that work is still blocked on Task 0 (client's pending localhost-HTTP vs. IPC decision, see `TASKS.md`), since the main process's transport logic depends on which approach is chosen.

---

## 2026-08-13 — Revised: `Backend/` and `frontend/app/` relocated into `Desktop_app/`, not just referenced

**Decision:** Physically moved (`git mv`, history preserved — not duplicated) the top-level `Backend/` and `frontend/app/` folders into `Desktop_app/Backend/` and `Desktop_app/frontend/app/`. This **revises** the entry immediately above ("Electron code lives in a new `Desktop_app/` folder; shell only") — that entry's *shell-only, don't-duplicate* reasoning still holds (there is still exactly one copy of the backend/frontend code, not two), but the *location* decision changes: instead of staying at the repo root and being referenced/bundled by `Desktop_app/` at build time, the code now lives inside `Desktop_app/` directly, since the project's direction is now desktop-only (no separate browser-hosted deployment being maintained in parallel).

**Why:** User's explicit instruction — since the backend files are already being actively edited for the MSSQL migration, consolidate everything the desktop product needs (backend, frontend, and eventually the Electron shell) into one self-contained folder rather than splitting it between the repo root and `Desktop_app/`. This is a relocation, not the "duplicate codebase" option rejected in the prior entry — there is still a single source of truth, it just lives in a different place. User explicitly authorized proceeding without further confirmation ("don't ask me any question").

**What moved:** `Backend/` → `Desktop_app/Backend/` (including `node_modules`, in-progress MSSQL migration work from Tasks 1–5), `frontend/app/` → `Desktop_app/frontend/app/`. `.gitignore` entries referencing `Backend/create-admin.js`, `Backend/wipe-data.js`, and `frontend/app/.env` updated to their new `Desktop_app/`-prefixed paths so those ignore rules keep working. Verified post-move: `node --check` passes on all Backend entry files, and a live `import()` of the new `mssqlDb.js` module succeeds from the new location.

**What did NOT move:** `Database/`, `Project_detials/`, `frontend_images/`, `images/`, `fontend_images.zip`, and the root-level tracking docs (`ANALYSIS.md`, `EFFORT_ANALYSIS.md`, `PROPOSED_PLAN.md`, `DECISIONS.md`, `TASKS.md`, `FLOW.md`) — these are project documentation/reference assets, not part of the buildable app, and stay at the repo root.

**Known staleness accepted:** file paths referenced inside `ANALYSIS.md`, `EFFORT_ANALYSIS.md`, and `PROPOSED_PLAN.md` (written before this move) still say `Backend/...`/`frontend/app/...` without the `Desktop_app/` prefix. Per this file's own convention (append-only, never rewritten retroactively), those are left as point-in-time snapshots rather than edited — `TASKS.md` and `FLOW.md`, which are living documents, have been updated to the new paths going forward.

---

## 2026-08-13 — Express will be fully removed after IPC is built and smoke-tested, not kept as a dev harness

**Decision:** Resolves the open question logged in the IPC-reversal entry above. Once the Electron IPC architecture (`TASKS.md` Group 5, Tasks 13–15) is built and manually smoke-tested end-to-end through the real IPC path, Express is deleted entirely — not retained as an optional dev-only testability harness. Tracked as the new `TASKS.md` Task 17, gated on Task 15 being done *and* the IPC path being proven working first.

**Why:** User's explicit instruction. This means giving up one of HTTP's few surviving advantages noted in `IPC_VS_HTTP_FINDINGS.md` §3.3 (standalone curl/Postman testability) — a real, acknowledged tradeoff, not an oversight. Consistent with the deployment model that drove the original IPC reversal: this is a single-user, single-machine desktop app with no need for a standalone network-testable API surface once IPC is proven, and keeping Express around indefinitely would mean maintaining two parallel code paths (Express handlers + IPC handlers) for the life of the app rather than one.

**Sequencing, not a shortcut:** Express is explicitly *not* removed early. It stays in place through all of Group 5's build-out as the working, testable reference implementation — the newly MSSQL-migrated SQL logic (Tasks 1–12, already smoke-tested manually: login, stock deduction on slip create/edit, `PUT` double-restore fix, profit aggregation, chemical usage over-limit rejection) needs a known-working way to be exercised while the IPC layer around it is still being built. Removing Express before that would leave no way to verify the SQL logic independently of a half-built IPC layer, making it harder to isolate whether a bug is in the SQL or in the new transport code.

**Alternatives considered:** Keep Express as a permanent dev-only harness (the option `IPC_VS_HTTP_FINDINGS.md` §3.3 flagged as available) — rejected by explicit user instruction; the app ships as IPC-only, and maintaining a second, permanently-unused-in-production transport layer was judged not worth the ongoing maintenance cost for this app's deployment model.

---

## 2026-08-13 — Group 5 build-out: four IPC implementation decisions, quizzed and accepted

**Decision:** Before starting Tasks 13–17, the user was quizzed (multiple-choice, per the standing "quiz before major changes" instruction) on four decisions this group's code depends on, then gave explicit accept. All four:

1. **Packaging tool: `electron-builder`** (not `electron-forge`). Matches what `TASKS.md` Task 16 already assumed and pairs directly with the already-committed `electron-updater` auto-update path (see the "Auto-update deferred" entry above) — `electron-builder` and `electron-updater` are designed to work together; `electron-forge` would need extra glue for the same auto-update flow.
2. **IPC bridge shape: one explicit `contextBridge`-exposed function per channel**, not the `Proxy`-over-`FEATURES`-registry pattern `IPC_VS_HTTP_FINDINGS.md` §4 recommended. **This reverses that recommendation** — the user chose explicitness (every available call visible directly in `preload.js`, no indirection) over the Proxy pattern's lower boilerplate-as-features-grow benefit. Given this app has a fixed, already-fully-scoped set of ~10 route files' worth of actions (not an open-ended growing API), the boilerplate downside of one-function-per-channel is bounded and known upfront, while the Proxy pattern's main advantage (graceful scaling to new features) matters less here.
3. **Drop JWT entirely under IPC** — no token issuance/verification layer. Login becomes a plain local username/password check (bcrypt against `Settings`, same as today) that returns success/failure with no token. **Why:** every IPC call already only ever originates from this app's own renderer process inside the OS process boundary — there is no remote/network attacker for a JWT to defend against the way there was for the localhost HTTP server design (which itself was already reversed — see the earlier IPC-vs-HTTP entries). Keeping JWT would mean plumbing a session/user param through every one of Task 13's service functions for a threat that doesn't exist in this architecture.
4. **Error convention: `{ ok: true, data }` / `{ ok: false, error: { message, code } }` envelope** crossing `ipcMain.handle`, per `IPC_VS_HTTP_FINDINGS.md` §4's original recommendation. **Why:** Electron strips custom properties (like `.code`) off thrown `Error` objects crossing the IPC boundary, silently downgrading to just the `.message` string — an envelope is the only reliable way to carry the structured error info this app's routes already depend on (e.g. `phone_conflict`, insufficient-stock messages) back to the renderer.

**Alternatives considered (and rejected by the user's answers):** `electron-forge` (less proven pairing with the already-committed `electron-updater` auto-update flow); the `Proxy`/`FEATURES`-registry IPC bridge (more indirection than wanted for a bounded, already-known feature set); keeping JWT as IPC-era defense-in-depth (adds a token lifecycle with no real attacker model to defend against, complicates every service function's signature); letting `ipcMain.handle` throw normally and catching only `.message` in the renderer (loses structured error codes needed for flows like the phone-conflict 409).

**Downstream effect on Task 13:** since JWT auth becomes IPC-irrelevant, `requireAuth`/`src/middleware/auth.js` is *not* touched during Task 13–16 — Express keeps its existing JWT-protected behavior unchanged throughout (it's temporary scaffolding per the entry above, not the new architecture). The JWT middleware and `jsonwebtoken` dependency are removed only at Task 17, alongside the rest of Express, per that task's existing scope.

---

## 2026-08-13 — Task 16's SQL Server Express auto-install (`ensureSqlServer.js`) is unverified — flagged, not silently shipped

**Decision:** Implemented `Desktop_app/scripts/ensureSqlServer.js` per the earlier "SQL Server installed via internet download during setup" decision, but explicitly documented — in the file itself, in `TASKS.md`'s Task 16 entry, and here — that it has never been executed against a real Windows machine, because this project's entire development environment is Linux-only (see the "Development environment" entry above). The download URL and silent-install command-line flags are written from Microsoft's own documented reference, not from a tested run.

**Why this is being logged as its own decision rather than just noted in passing:** this is system-level provisioning code (installs software, generates and stores a database password) that will run unattended on a client's real machine. Shipping it silently, without flagging that it's unverified, would misrepresent its actual confidence level — the difference between "written correctly" and "known to work" matters most exactly for code with this much blast radius.

**Mitigation in place:** the script fails safe — if the automated install doesn't work for any reason, `main.js` catches the failure and falls through to `provisionDatabase()`/`connectMSSQL()`, which then fail with a clear, `dialog.showErrorBox`-surfaced error rather than a silent or confusing crash (verified: this exact fallback path was exercised when testing the packaged app with no MSSQL credentials configured — see `TASKS.md` Task 16).

**Required before this ships in a client-facing installer:** a real Windows test of `ensureSqlServer.js` end-to-end — confirm the bootstrap URL still resolves to a current SQL Server Express installer (Microsoft's fwlink targets change over time), confirm the silent-install flags produce a working instance, and confirm the generated `sa` password round-trips correctly through `userData/mssql.env` on a real Windows `userData` path.
