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

---

## 2026-08-13 — Windows verification: Docker/local VM ruled out, checklist delegated instead

**Decision:** Do not attempt to stand up a Windows test environment inside this session's Linux sandbox (neither a Docker Windows container nor a local QEMU/KVM VM). Instead, produce a precise manual verification checklist (`Desktop_app/WINDOWS_INSTALLER_VERIFICATION.md`) for the user (or whoever has real Windows access) to execute, with results reported back for this log and `TASKS.md` Task 16 to be updated afterward.

**Why:**
- **Docker Windows containers are architecturally impossible here, not just inconvenient** — Windows containers require a Windows kernel underneath; a Linux Docker host can never run them, regardless of configuration.
- **Local QEMU/KVM VM was checked concretely, not assumed impossible:** `/dev/kvm` exists and the CPU has the `vmx` flag, so it's not a hypervisor-support problem. It's blocked by environment limits instead — only 7.2GB free disk (`df -h`, volume at 96% used) against Windows 11's stated 64GB minimum; host RAM already under pressure (519MB free, swap at 844KB free of 4GB) such that adding a Windows VM's memory footprint risks the host, not just the guest; and Microsoft's evaluation-ISO download endpoint returned HTTP `403` to this host (likely datacenter/automation traffic blocking on their CDN).
- **Cross-building the installer itself via the sandbox's installed `wine` was considered and deliberately not done**, even though `electron-builder` supports it — a Wine-cross-built NSIS installer isn't guaranteed identical to a natively Windows-built one (icon/resource embedding via `rcedit.exe`, NSIS compiler behavior can differ). Since the entire point of this work is closing a "never verified on real Windows" gap, partially closing it with a Linux-built artifact would misrepresent the confidence level, the same concern already logged in the `ensureSqlServer.js` entry above.

**Alternatives considered:** A cloud Windows VM (Azure/AWS/etc.) — offered to the user as an option; not pursued because it requires provisioning/spend the user would need to authorize and set up access for, and the user chose the checklist-delegation path instead when asked.

**What this doesn't change:** the underlying verification requirement from the `ensureSqlServer.js` entry above is unchanged — this entry just documents why the actual test execution couldn't happen inside this session, and hands it off with enough detail (see the checklist file) that it doesn't need to be re-derived.

---

## 2026-08-13 — REVISED: adopt a proven bundled-SQL-Server release pipeline, superseding `ensureSqlServer.js`'s install-time-download approach

**Decision:** Replace Task 16's `ensureSqlServer.js` design (SQL Server Express downloaded from Microsoft on the client's machine at install time, `sa` password auto-generated and never seen by the user) with a different, already-proven pattern documented in `release_pipeline.md` (root of repo): SQL Server Express **bundled into the installer at CI build time**, installed via a custom NSIS wizard page that asks the user to type a database password (twice) and a backup folder, with the underlying PowerShell setup script designed to be idempotent so every reinstall/update is also a self-repair.

This pattern, GitHub Actions release automation, and `electron-updater` auto-update are all adopted together as one release pipeline, since `release_pipeline.md` documents them as interdependent parts of a single working system, not separable pieces.

**Why:** `release_pipeline.md` is not a proposal — it documents a **live, already-shipped pipeline** from a sibling project (Wentox), with releases `v0.1.10` through `v1.0.2` built and published this exact way, and specific documented fixes for real failure modes already hit in production (NSIS's double-compile-pass gotcha where a script compiles fine as an installer but fails as an uninstaller; `latest.yml` being easy to omit and silently breaking every client's update check; the installer needing to distinguish "fresh install" from "update" using *both* the uninstall registry key *and* the config file, not either alone; PowerShell's `ConvertTo-Json` needing to be the one writing the password config, not hand-rolled NSIS string escaping, because a mismatch there previously shipped a password that didn't match what was actually set on `sa`). None of these failure modes have been hit or solved in this project's own `ensureSqlServer.js`, because it has never run outside this Linux dev environment (see the entry above) — choosing the proven pattern over the untested one is the whole point of this change.

**What this means concretely:**
- `Desktop_app/scripts/ensureSqlServer.js` and `provisionDatabase.js` are superseded, not merely supplemented — the new pattern moves SQL Server acquisition to build time and the `sa` password from auto-generated to user-supplied via the installer UI. Task 16 is not reopened/edited (per this file's append-only convention) — new tasks cover the replacement, see `TASKS.md`.
- `Desktop_app/WINDOWS_INSTALLER_VERIFICATION.md` (Task 18) is also superseded — it was written to verify the now-replaced approach. A new checklist is needed once the new pipeline is built.
- Auto-update behavior is now fully specified, resolving the quiz question the user deferred to this document: a manual **"Check for Updates" page**, `electron-updater` with `autoDownload = false` (never downloads without explicit confirmation), an explicit connectivity probe against `api.github.com` specifically (so "GitHub is blocked on this network" reports as a clear, distinct error rather than a generic failure).
- Code signing (self-signed, per the earlier quiz answer) gets wired into this same `electron-builder` config, alongside the NSIS/publish settings — not as a separate bolt-on.
- Version source of truth is `Desktop_app/package.json`'s `"version"` field, not the git tag — the tag only decides *when* to build; the two must be bumped together or the published release's assets will be mislabeled and the auto-updater will silently fail to detect the new version.

**Alternatives considered:** Keep `ensureSqlServer.js`'s approach and layer CI/auto-update/signing around it — this was the plan going in, offered explicitly as the lower-effort/lower-installer-size option; rejected by the user in favor of the proven pattern. Smaller installer size (~363MB added for the bundled SQL Server Express vs. install-time download) was accepted as the tradeoff for a pipeline with a real production track record instead of an unverified one.

**Adaptation needed, not a direct copy:** `release_pipeline.md` describes Wentox's own paths (`backend/`, `frontend/`, `Wentox_db`, `SubhanNoor/Wentox_sole`) — every file path, app name, database name, and repo reference needs adapting to this project's actual structure (`Desktop_app/Backend/`, `Desktop_app/frontend/app/`, `starmans` database, `bilalahmed-04/Starmans-desktop`). Implementation is tracked task-by-task in `TASKS.md` rather than as one giant task, following this project's established convention.

---

## 2026-08-13 — Code signing: env-var-based (`CSC_LINK`/`CSC_KEY_PASSWORD`), not `package.json`-embedded

**Decision:** Task 25's self-signed certificate is wired into `electron-builder` via the standard `CSC_LINK`/`CSC_KEY_PASSWORD` environment variables (read from GitHub Actions secrets in CI), rather than `package.json`'s `win.certificateFile`/`certificatePassword` fields as originally scoped in `TASKS.md`.

**Why:** The user's earlier quiz answer ("self-signed cert for now, real cert swap-in is a config change later, not a rewrite") is better satisfied by env vars than by a path in a committed file — swapping to a real purchased certificate later means updating two GitHub secrets, not editing and re-committing `package.json`. A certificate file path baked into `package.json` would also risk that path (or worse, an accidentally-committed certificate) ending up in git history, which env-var-based CI secrets structurally cannot.

**What was generated:** a self-signed 2048-bit RSA certificate with Code Signing EKU, 730-day validity, packaged as a password-protected `.pfx`, stored only in `Desktop_app/build/certs/` (gitignored — confirmed via `git check-ignore` before anything else touched the file) and in this developer's local scratch space, never printed into any chat transcript or log per standard credential handling.

**Not yet done — a manual step outside this session's reach:** the two GitHub repo secrets (`WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`) need to actually be added by someone with admin access to `bilalahmed-04/Starmans-desktop`'s repo settings. Until that happens, `release.yml` will attempt an unsigned build (electron-builder simply skips signing if these env vars are unset — not a hard failure, but not what's wanted for a client-facing release either).

**Alternatives considered:** `package.json`-embedded cert path (the task's original scope) — rejected per the reasoning above. No signing at all — rejected, already decided against in the earlier quiz (self-signed was chosen specifically over "skip signing for now, build unsigned").

---

## 2026-08-14 — First-run login: auto-seed a default `admin`/`admin` account, not a first-run setup screen

**Decision:** A fresh install seeds a default `admin`/`admin` account at startup (`ensureDefaultAdmin()` in `Backend/src/services/auth.js`, called from `main.js`). Chosen by the project owner via the standing quiz process over the alternative: a first-run "create your admin account" screen that would gate login until the client set their own credentials.

**Why this was needed at all:** `TASKS.md` Task 19 — a genuinely fresh database has an empty `Settings` table, and there was **no path through the UI to create the first account**. `verifyCredentials` rejects (no row to match) and `changeSettings` also rejects (it requires an existing row to verify `oldPassword` against, so it throws "Old password is incorrect" when there is nothing to be incorrect about). A client installing this on a clean Windows machine could never have logged in. Every prior login smoke test in this project passed only because `seed.js` had already inserted a `Settings` row directly via SQL, bypassing that path entirely — which is exactly why the bug stayed invisible for so long.

**The security tradeoff, stated plainly because it is real and was accepted knowingly:** every install ships with publicly-known credentials, and **nothing in the app forces a change**. The recommended alternative (first-run setup screen) would have meant no default credential ever existing. The owner chose the seeded default for speed and because it needs no frontend gating flow. This is defensible for the actual deployment model — a single-operator shop PC, local-only database, no network surface (the app is IPC-only; Express was removed in Task 17, see that entry) — where an attacker with the access needed to exploit `admin`/`admin` could equally read the local database directly. **It would not be defensible if this app ever grows a network surface, multi-user access, or runs anywhere less trusted.** Revisit if any of those change.

**Mitigation implemented, since the choice could not be made safe outright:** `LoginPage.tsx` displays a banner naming the default credentials and instructing the operator to change them immediately. It is driven by `isUsingDefaultCredentials()`, which **compares the stored bcrypt hash rather than reading a flag** — so it disappears by itself the moment the password is genuinely changed, and correctly reappears if anyone ever sets it back. This makes the default impossible to overlook without forcing a flow the owner declined.

**Design properties worth preserving if this code is touched:** `ensureDefaultAdmin()` is idempotent — it inserts **only** when the table is completely empty, so it is safe on every launch and can never overwrite a client's real password. Verified explicitly (see Task 19's notes) that a changed password survives subsequent calls.

**Verification approach worth noting:** tested against a throwaway `starmans_task19_scratch` database rather than the live one. An initial attempt to simulate a fresh install by emptying the live `Settings` table was blocked as unsafe — correctly, since that script's failure path would not have restored the row. The scratch-database approach is strictly better and is the pattern to reuse for this kind of destructive-state test.

**Alternatives considered:** first-run setup screen (recommended, declined by the owner — better security and UX, but real frontend work); seed-the-default-then-force-a-change-on-first-login (rejected as the worst of both — it still creates a default-credential window *and* needs the frontend work).

---

## 2026-08-14 — Publish release assets with `gh`, not electron-builder's own publisher

**Decision:** `electron-builder` now runs with `--publish never`. The workflow creates the GitHub Release and uploads assets itself via `gh release create` / `gh release upload`, with explicit verification steps before and after.

**Why — this fixed a real, diagnosed failure, not a hypothetical one.** The `v1.0.0` release build reported success with a green tick but shipped nothing usable: the release page had only an 845KB blockmap, no installer and no `latest.yml`. The CI log showed exactly what happened:

```
• publishing      publisher=Github (…)      ← started twice
• publishing      publisher=Github (…)
• uploading       file=…exe.blockmap
• uploading       file=…exe
• creating GitHub release  reason=release doesn't exist tag=v1.0.0   ← both raced
• creating GitHub release  reason=release doesn't exist tag=v1.0.0
Post job cleanup.                            ← job ended mid-upload
```

Two publisher instances ran concurrently, both checked whether the release existed, both got "no", and **both created one** — which is why two releases shared tag `v1.0.0`. The job then exited while the 795MB upload was still in flight, with no error and no non-zero exit. Only the small blockmap finished in time.

The critical property here is not that it failed but that **it failed silently and reported success**. A release pipeline that can publish an empty release while showing a green tick is worse than one that breaks loudly.

**What the replacement guarantees that the old one didn't:**
- **One release, created explicitly before any upload** — the race cannot occur.
- **Uploads are sequential with real exit codes**, so a failure fails the job.
- **Pre-flight check** that the `.exe`, `latest.yml` and blockmap all exist before creating a release at all.
- **Post-flight check** that ≥3 assets actually reached the release in `uploaded` state — the specific thing nobody verified on `v1.0.0`.
- **Version/tag mismatch is a hard failure.** `release_pipeline.md` §4 calls this the rule that bites: the shipped version comes from `package.json`, not the tag, so a mismatch produces a release whose assets claim a different version and whose update check silently never fires. Now the build refuses to run instead.
- `--clobber` on upload, so re-running a partially-failed release overwrites rather than erroring on an existing asset.

**Confirmed working from the same failed run:** code signing. The log shows `signtool.exe` invoked against the installer with the CI certificate, so `WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD` are correctly named and functioning — that open question is closed.

**Not deleted:** the two broken `v1.0.0` releases still exist. Removing published release state was deliberately left to the project owner rather than done unilaterally; bumping to `v1.0.1` supersedes them anyway, since GitHub marks the newest release `Latest` and that is what the updater reads. They can be deleted manually at any time.

**Alternatives considered:** keeping electron-builder's publisher and adding retries (rejected — doesn't address the race, only the symptom, and the failure mode is silent); pre-creating a draft release for electron-builder to find (would likely avoid the race, but still leaves upload success unverified and the job green either way).

---

## 2026-08-14 — Repository made public; auto-update is now actually viable

**Decision (owner's, recorded here because it unblocks a logged constraint):** `bilalahmed-04/Starmans-desktop` is now public.

**Why it matters technically:** the shipped `app-update.yml` carries no auth token — by design, since embedding a GitHub token in an Electron app publishes that credential to anyone who unzips it. While the repo was private, every client's update check would have hit a 404 on `latest.yml`, so **auto-update could not have worked at all**, regardless of the publishing bug above. `IPC_VS_HTTP_FINDINGS.md` §6 Step 7 flags a private repo as exactly this class of permanent, actionable failure.

Public repo + working asset upload means the update path is now genuinely functional end to end, rather than a feature that would have failed on first use at a client site.

**Consequence to be aware of:** the source is now publicly readable. Nothing in the repository contains credentials (`.env`, the `.pfx`, and the base64 cert are all gitignored, and this was re-verified against the full git history before each push), but the code, the schema, and this decision log are all now public.

---

## 2026-08-14 — Pin a space-free `artifactName`; verify the update feed resolves, not just that assets exist

**Decision:** `Desktop_app/package.json` pins `"artifactName": "Starmans-Sole-House-Setup-${version}.${ext}"`, and the release workflow gained a final step that fetches `latest.yml` from the published release and confirms the filename it names actually returns HTTP 200.

**Why — v1.0.1 published successfully and auto-update was still broken.** All three assets uploaded, every existing check passed, the release page looked correct. But `productName` contains spaces, and the on-disk artifact was `Starmans Sole House Setup 1.0.1.exe`. Two tools then normalised that filename **differently**:

- electron-builder wrote `Starmans-Sole-House-Setup-1.0.1.exe` (hyphens) into `latest.yml`
- GitHub's asset upload stored it as `Starmans.Sole.House.Setup.1.0.1.exe` (dots)

Verified concretely rather than assumed — the URL `latest.yml` points at returns **404**, while the dotted URL returns **200**. Every client's update check would have failed on a file-not-found.

**The deeper lesson, which is why a second check was added rather than just the fix:** the previous entry's verification proved *assets were present*. Presence is not function. This bug lived entirely in the gap between "three files uploaded" and "the updater can actually fetch what the manifest names." The new step closes that gap by doing exactly what a client does — parse `path:` out of `latest.yml`, fetch it anonymously, assert 200.

Notably this class of bug was *introduced* by the previous fix: electron-builder's own publisher normalised both sides consistently, so it never mismatched. Moving uploads to `gh` was still correct (it fixed a silent race that shipped no installer at all), but it changed who names the asset — and that side effect wasn't obvious until tested end to end.

**Root-cause fix vs. workaround:** the filename is pinned at the source so the on-disk name, `latest.yml`'s reference, and the uploaded asset are all byte-identical and contain no spaces to normalise. Renaming during upload would have papered over the mismatch while leaving the underlying ambiguity in place.

**Left as-is deliberately:** `productName` keeps its spaces — it's the human-facing name in the Start Menu, installer UI, and window title. Only the *artifact filename* is constrained.

---

## 2026-08-14 — First real Windows test: four bugs fixed, and the logging that made them findable

**Context:** v1.0.3 was installed on a real Windows machine for the first time. The wizard's custom database-password page **worked** — mismatch and length validation both behaved — which closes one of the largest unknowns in this project: that page had only ever been *compiled*, never displayed. Database setup then failed, and produced **no log at all**, which made the failure undiagnosable.

**Bug 1 — the bundled SQL Server installer path was wrong.** `setup-sqlserver.ps1` defaulted `$InstallerPath` to `"$PSScriptRoot\..\sqlserver\SQLEXPR_x64_ENU.exe"`. Both the script and the installer land in `<INSTDIR>\resources\`, so they are siblings — the `..` resolved one level too high. On any machine without SQL Server already present this fails with "Bundled SQL Server installer not found." Verified against the real `win-unpacked` layout rather than reasoned about.

**Bug 2 — the log was written where the tester could not see it (my error, and the expensive one).** The script logged to `$env:TEMP`. The installer runs elevated, so that is the *administrator's* temp — commonly `C:\Windows\Temp` — not the `%TEMP%` the logged-in user opens in Explorer, which is exactly where the instructions sent them. Logs now go to `C:\ProgramData\Starmans\`, the same fixed, machine-wide location as `app-config.json`.

Additionally, NSIS now redirects PowerShell's stdout and stderr to `installer-powershell.log`. A script that dies before its own first log line — bad path, execution policy, parse error, missing .NET type — cannot log that itself; wrapping the interpreter catches what living inside it cannot.

**Bug 3 — `$args` is a PowerShell automatic variable.** `Install-SqlServerExpress` assigned to it. Legal but shadows built-in behaviour and misbehaves under StrictMode. Renamed to `$setupArgs`.

**Bug 4 — dynamic ports would have silently defeated the fixed port.** The script set `TcpPort` to 1433 but left `TcpDynamicPorts` untouched. SQL Server **Express defaults to dynamic ports, and while `TcpDynamicPorts` holds a value it wins over any static `TcpPort`.** The instance would have kept listening on a random high port while setup reported success and the app connected to 1433 and failed. This is the classic Express trap and would have presented as "setup worked, app can't connect" — the hardest kind of bug to attribute. Now cleared explicitly before pinning the port.

**Diagnostics added for the reported "SQL was already installed" theory.** Before changing anything, the script now logs the PowerShell version and bitness, whether the bundled installer exists at the resolved path, **every SQL Server instance already on the machine**, and whether port 1433 is already in use. It also warns explicitly when our instance is absent but others exist — because "SQL Server is installed" and "the instance this app needs exists" are different claims, and a pre-existing default `MSSQLSERVER` instance typically already owns 1433, which is a genuine conflict our named instance cannot resolve by itself.

**Verification performed, given no Windows or PowerShell available locally:** brace/paren balance and every called function resolving to a definition (parsed programmatically, since no interpreter exists here); both NSIS lint passes clean; a full `electron-builder --win` build; and — the meaningful one — **extracting `app-64.7z` out of the built installer and reading the shipped `setup-sqlserver.ps1` directly** to confirm all four fixes are present in the artifact rather than merely in the source tree. The only remaining `..\sqlserver` occurrence was checked and is inside an explanatory comment, not code.

**What this does not establish:** whether the install now succeeds on Windows. Every fix above is reasoned and statically verified, not observed working. The difference between those two matters and is not being glossed: the next Windows run is still the real test — but it will now produce logs regardless of how it fails.

---

## 2026-08-15 - Root cause of both failed Windows installs: file encoding, not logic

**What actually broke.** `setup-sqlserver.ps1` was UTF-8 **without a BOM** and contained 90 non-ASCII characters (66 box-drawing `-`, 23 em-dashes, one section sign) - all in comments and message strings I wrote for readability. Windows PowerShell 5.1 decodes a BOM-less file as **ANSI/Windows-1252, not UTF-8**. Each 3-byte em-dash therefore arrived as three garbage characters, one of which reads as a string terminator, so string literals closed early and every subsequent brace mismatched. The script failed to **parse**, which means it never executed a single line.

That explains what looked like two unrelated mysteries: the reported "SQL not defined"-style parser errors, and - the tell I should have caught sooner - **no log file, ever**. A script that fails to parse cannot write its own log, no matter where that log points.

**This was the real blocker in both the v1.0.3 and v1.0.4 installs.** The four bugs fixed in v1.0.4 (installer path, log location, `$args`, dynamic ports) were all genuine, but none of them were ever reached. Fixing them changed nothing observable, which is precisely why the second test failed the same way as the first.

**Why my verification missed it, which is the more useful lesson.** Everything used to check that script - Python's parser, `grep`, the editor - reads files as UTF-8 and saw a perfectly well-formed script. I even extracted the `.ps1` out of the built installer and re-read it to confirm the fixes shipped. Every one of those checks modelled *my* environment's encoding assumption, not the target runtime's. The bug lived entirely in the gap between them. Verifying that an artifact **contains** the right bytes is not the same as verifying the **target interpreter parses those bytes the same way**.

**Fixes, all three layers:**
1. Both `setup-sqlserver.ps1` and `installer.nsh` rewritten as **pure ASCII**. ASCII decodes identically under every encoding guess, so the failure mode cannot recur regardless of BOM handling.
2. `setup-sqlserver.ps1` additionally carries a **UTF-8 BOM**, so PowerShell never has to guess - protection for whoever reintroduces a non-ASCII character later.
3. A **guard in `lint-nsis.sh`** (therefore in the CI gate) that fails the build if either file contains non-ASCII, or if the `.ps1` loses its BOM. Verified to fire by deliberately injecting an em-dash.

**Verification that actually models the failure**, rather than repeating the mistake: decode the file as both UTF-8 and CP1252 and assert the results are byte-identical. Confirmed the new file passes and - importantly - confirmed the **old committed file fails** this same test, so it demonstrably would have caught the original bug. Also re-verified against the `.ps1` extracted from inside the built v1.0.5 installer, not just the source tree.

**Still not established:** whether the install now succeeds. What is established is that the script will parse, which it provably could not before - so any remaining failure will now produce logs and be diagnosable rather than silent.

---

## 2026-08-15 - Existing SQL Server: step aside onto a free port rather than reconfigure or compete

**Decision:** When port 1433 is already taken, setup installs its own `SQLEXPRESS` instance on the next free port (scanning 1433-1457) and records that port in `app-config.json`. Any SQL Server already on the machine is left **entirely untouched** - no password reset, no auth-mode change, no service restart, no port taken from it.

**Why this over the alternatives.** The user proposed reusing an existing instance instead of installing a second one, which is reasonable and would save ~714MB. But the two ways to do that both have real costs: resetting `sa` on an instance that belongs to other software can break that software, and creating a dedicated login still requires flipping the instance to mixed-mode auth and restarting it - a change to someone else's service. Choosing a different port achieves the actual goal (don't conflict, don't break anything) while touching nothing outside our own instance. It is strictly less invasive than either reuse strategy.

**This works only because the port was never hardcoded.** `main.js`'s `loadProductionConfig()` reads `mssqlPort` from `app-config.json` into `MSSQL_PORT`, and `mssqlDb.js` uses it. Verified before implementing, not assumed - had the port been fixed in the app, this approach would have required application changes rather than none.

**The subtle case, handled explicitly:** an already-configured machine reuses the port from its existing `app-config.json` instead of re-scanning. Re-scanning would find that port "in use" - by our own instance - and needlessly migrate to a new one, leaving the app pointed at a port with no database on it. Reinstalls and updates therefore keep their port; only genuinely fresh installs pick one.

**Verification:** the branch logic was modelled and exercised across five scenarios (clean machine; 1433 taken; 1433-1435 taken; reinstall over an existing install on 1434; update path) and behaves correctly in each, including keeping the port stable on reinstall. Confirmed present in the shipped script by extracting it from inside the built installer.

**What is still not addressed:** if the machine already has a `SQLEXPRESS` instance specifically, setup still reconfigures *that* instance (mixed-mode auth, `sa` password reset, restart). That path remains invasive. It is far less likely than the default-instance case, and the logs now identify which case a machine is in - so this is deliberately deferred until real evidence says it matters, rather than being designed for speculatively.

---

## 2026-08-15 - Two real Windows bugs, confirmed by real logs from both the fresh-install and repair paths

**Context:** v1.0.6 was tested twice on a clean Windows 11 machine - once for a fresh install, once to test the repair path (a machine with pre-existing `SQLEXPRESS`/`SQLEXPRESS01` instances already present). Both attempts got past the encoding fix from v1.0.5 (no parse errors) and failed on two different, previously-unreachable bugs.

**Bug A - fresh install: wrong SQL Server installer parameter name.** The bundled SQL Server 2025 setup exited immediately with `The setting 'SAPWORD' specified is not recognized.` (confirmed via its own Summary.txt log, pasted in full). The script has passed `/SAPWORD=` since the very first version of this file - the correct parameter, per Microsoft's documented unattended-install switches, is `SAPWD`. Every other parameter in that block (`INSTANCENAME`, `SECURITYMODE`, `SQLSYSADMINACCOUNTS`, `TCPENABLED`) was checked against the same documentation and is correctly named. This is the same shape of failure as the v1.0.5 encoding bug: a real defect that existed in every prior version, invisible until the *previous* blocking bug was fixed far enough for execution to reach it.

**Bug B - repair path: Integrated auth failing over TCP loopback.** On the machine with pre-existing instances, `Set-SaPassword` failed with `Login failed. The login is from an untrusted domain and cannot be used with Integrated authentication.` This is a known SQL Server/Windows interaction: Windows Integrated authentication negotiated over a TCP connection to `127.0.0.1`/`localhost` can fail SSPI/NTLM negotiation on machines with NTLM-restriction policies, even though the identical Windows identity is fully trusted for a local connection. Named pipes/shared memory (`Server=.\$InstanceName`) is the standard, documented workaround - it bypasses the network-auth negotiation path entirely.

**Fix for Bug B is layered, not a single swap:** `Set-SaPassword` now tries three connection strategies in order - named pipes first, then TCP loopback, then TCP `localhost` - and only fails if all three do. On failure it reports the actual Windows identity attempted (`WindowsIdentity]::GetCurrent().Name`) and names what to check (Mixed Mode auth, sysadmin membership), rather than surfacing the raw .NET exception. This was an explicit requirement, not an incidental improvement: a failure here needs to be actionable from the log alone, since re-running with more logging isn't a realistic option for a client-facing installer failure.

**Verification performed:** the same layered checks as every prior fix in this sequence - encoding guard still passes (both changes kept the file pure ASCII), brace balance and function resolution parsed programmatically, both NSIS lint passes clean, a full build, and - the check that actually matters - **extracting the shipped `.ps1` from inside the built `.exe`** and confirming both `SAPWD` and the multi-strategy auth logic are present in the artifact, not just the source tree.

**What remains genuinely unverified:** whether a fresh install now completes end-to-end (Bug A is fixed, but nothing downstream of it has been observed on real Windows), and whether the repair path succeeds via one of the three new strategies on a real machine with NTLM restrictions - the fix is reasoned from a well-documented pattern, not observed working. Also unaddressed: repairing a machine with a genuinely foreign `SQLEXPRESS` instance (one Starmans didn't install, where our identity may legitimately lack sysadmin rights) - flagged in `WINDOWS_INSTALLER_VERIFICATION.md` as the one repair scenario not yet exercised, deliberately deferred rather than built for speculatively.

**Updated `WINDOWS_INSTALLER_VERIFICATION.md`** per this fix: corrected a stale `%TEMP%` log-path reference left over from before the 1.0.4 fix, added a check for which auth strategy succeeded, and added the untested foreign-instance repair scenario as a known gap.

---

## 2026-08-15 - `ALTER LOGIN ... WITH PASSWORD` cannot be parameterized; and a PowerShell interpreter is available after all

**The bug (1.0.9), confirmed by real logs from both paths.** `Set-SaPassword` failed with `Incorrect syntax near '@pwd'` on the fresh-install run (12:52) *and* the repair run (13:25). The statement was:

```
ALTER LOGIN sa WITH PASSWORD = @pwd; ALTER LOGIN sa ENABLE;
```

sent with a real `SqlParameter`. T-SQL does not accept a bound parameter or a variable in `ALTER LOGIN ... WITH PASSWORD` - that position requires a **string literal**. The comment above the line claimed the password was "parameterized via sp_executesql"; it was not using `sp_executesql` at all, and - importantly - **wrapping that exact statement in `sp_executesql` would have failed identically**, because the restriction belongs to `ALTER LOGIN`, not to the batch. That misleading comment is why this looked correct on every prior read-through.

**Decision: build the literal server-side with `QUOTENAME`, never in PowerShell.** The obvious fix - interpolating `$SaPassword` into the command string - was rejected: it breaks on any password containing an apostrophe and reintroduces T-SQL injection into the one place in this codebase handling a credential. Instead the password still crosses the wire as a genuine `SqlParameter`, and the escaping happens inside SQL Server:

```
SET @sql = N'ALTER LOGIN sa WITH PASSWORD = ' + QUOTENAME(@pwd, '''') + N'; ALTER LOGIN sa ENABLE;';
EXEC sp_executesql @sql;
```

`QUOTENAME(@pwd, '''')` wraps the value in single quotes and doubles any embedded ones. The password never appears in the command text this script constructs. `QUOTENAME` returns `NULL` above 128 characters, which would silently produce a no-op batch, so the guard `THROW`s on empty or over-128 input rather than reporting success on a password that was never set - the exact failure shape (setup says OK, login still fails) this file's header warns about.

The here-string is single-quoted (`@'...'@`), not double-quoted. A double-quoted here-string interpolates `$`-prefixed names, and embedded T-SQL must reach the server byte-for-byte.

**Second fix in the same pass: stop the instance's own port from being treated as "taken".** The 13:25 log shows setup finding port 1433 busy and migrating its instance to 1434 - but the thing holding 1433 was **our own `SQLEXPRESS`**, pinned there by the 12:52 run that then died on the `@pwd` bug before writing `app-config.json`. `Get-FreePort` cannot distinguish "someone else owns 1433" from "we own 1433"; the existing config-reuse guard only covers machines that got as far as writing a config. New `Get-InstanceStaticPort` reads the port directly off our instance's `SuperSocketNetLib\Tcp\IPAll` registry key and reuses it, so a re-run after a mid-setup failure keeps the port instead of walking it upward each attempt.

**This narrows, but does not close, the gap flagged in the 1.0.6 entry** ("if the machine already has a `SQLEXPRESS` instance specifically, setup still reconfigures *that* instance"). Reconfiguring a genuinely foreign `SQLEXPRESS` is still invasive and still untested; what changed is only that our *own* half-configured instance is no longer misread as a foreign one.

**Process change, and the most reusable thing in this entry: PowerShell IS available in this dev environment.** Every prior entry in this sequence states that no PowerShell interpreter exists here and works around it with Python parsers, `grep`, and brace-counting - the very approach `DECISIONS.md` already identified as the root cause of the 1.0.5 encoding bug ("Verifying that an artifact **contains** the right bytes is not the same as verifying the **target interpreter parses those bytes the same way**"). That assumption was simply never retested. PowerShell 7.4.6 for linux-x64 installs from Microsoft's official GitHub release into a scratch directory **without root**, and the fix above was verified with the real thing:

- `[System.Management.Automation.Language.Parser]::ParseFile` over the whole script - **0 errors, 1782 tokens**
- the here-string's literal value dumped from the token stream and asserted to contain `DECLARE @sql`, `LEN(@pwd)`, `QUOTENAME(@pwd, '''')` and `EXEC sp_executesql @sql` verbatim - i.e. proof PowerShell did not interpolate anything

**What this still does not verify, stated plainly:** the real parser confirms the script *parses*; it does not execute it. Whether SQL Server accepts this batch, and whether `sa` ends up with the right password, remains unobserved - no SQL Server is reachable from this environment (Docker is installed but its daemon is not accessible). Running SQL Server in a container to execute the batch for real was offered and declined in favour of the parse check, so the T-SQL is reasoned-correct against documented `QUOTENAME`/`ALTER LOGIN` behaviour, not observed working. The pattern named in the 1.0.7 entry therefore still holds: this fix unblocks the next layer rather than proving the install succeeds.

---

## 1.0.10: the UTF-8 BOM that made a fully successful install look like a total failure

**The 1.0.9 fix worked.** The 14:05 log is the first end-to-end success this project has ever recorded on Windows: port kept at 1434 by the new `Get-InstanceStaticPort` (exactly the self-inflicted port walk the previous entry predicted), `sa password set and login enabled`, database created, config written, and the real sa connection verified. Both 1.0.9 fixes are now **observed working**, not reasoned-correct.

The app then died at launch:

```
SyntaxError: Unexpected token '', "{
  "m"... is not valid JSON
    at loadProductionConfig (resources\app.asar\main.js:24:23)
```

**Root cause: `Set-Content -Encoding UTF8` on Windows PowerShell 5.1 writes a UTF-8 BOM** (`EF BB BF`). `JSON.parse` rejects the leading `U+FEFF`. `app-config.json` was correct in every respect a human reading it would check - right port, right password, valid JSON to the eye - and unreadable by the only thing that consumes it. Reproduced byte-for-byte here, error text identical to the screenshot.

`-Encoding utf8NoBOM` would be the obvious fix but does not exist before PowerShell 6, and this script must run on the stock 5.1 that ships with Windows. Hence `[System.IO.File]::WriteAllText` with an explicit `UTF8Encoding($false)`.

**Fixed on both sides, deliberately.** The writer stops emitting a BOM; `main.js` also strips one before parsing. The strip is not redundant belt-and-braces - it is what lets a machine **already carrying a BOM'd config** (every 1.0.9 install, including the test machine) recover on update instead of crashing until setup is re-run. Being lenient in the reader is also simply correct.

**A consequence worth recording, because removing a BOM is not free.** PowerShell 5.1 infers file encoding *from the BOM* and falls back to ANSI (Windows-1252) when there is none. The three `Get-Content $ConfigPath` calls on the update path were unqualified, so dropping the BOM would have silently corrupted any non-ASCII character in the sa password - a fix introducing a subtler version of the same class of bug. All three now pass `-Encoding UTF8` explicitly.

**Verified by execution, not inspection.** PowerShell 7.4.6 was reinstalled per the previous entry's guidance (it lives in a scratch dir that does not survive between sessions - `which pwsh` failing does **not** mean it is unavailable). `Parser::ParseFile`: 0 errors, 1841 tokens. Then the real `Write-AppConfig`, extracted from the shipping script via its AST rather than retyped, was **executed**: output begins `7B` (`{`), not `EF BB BF`, and the resulting file round-trips through both `ConvertFrom-Json` and Node's `JSON.parse` with a non-ASCII password intact. Unlike the T-SQL in the previous entry, this fix needed no SQL Server to verify - so it is observed working, not reasoned-correct.

**Still unverified:** everything past `loadProductionConfig` - schema provisioning, `ensureDefaultAdmin`, and the login screen - has still never run on Windows. The established pattern holds: each fix unblocks the next never-reached layer.

---

## 1.0.11: switch bundled SQL Server 2025 -> 2022 Express Core (size + stability), and gate releases on a real install test

Three separate asks from the project owner in one message, after 1.0.10 shipped: (1) confirm an auto-update never reinstalls SQL Server and wipes client data, (2) shrink the installer, (3) stop using "sql is not defined" - bundle a more stable SQL Server release. Also asked to run the app on a Windows container or "over there" rather than only ever verifying statically.

**Point 1: already correct, verified by re-reading the code, not assumed.** `setup-sqlserver.ps1`'s main flow calls `Get-ExistingInstance` and only calls `Install-SqlServerExpress` when no `SQLEXPRESS` instance is found - this check is independent of whether NSIS thinks the run is a "fresh install" or an "update". `New-StarmansDatabase` is `IF DB_ID(...) IS NULL CREATE DATABASE`, never `DROP`. Traced the edge case where NSIS might misclassify an update as fresh: worst case is the sa password gets reset to whatever was re-typed in the wizard and `app-config.json` re-synced - SQL Server itself and its data are never touched. No code change needed for this point; what was missing was proof, which is what the new CI step below now provides on every release instead of relying on a read-through.

**Point 2 and 3, solved together by the same change.** Bundled package switched from SQL Server **2025** Express Core (`SQLEXPR_x64_ENU.exe`, 748,772,024 bytes, ~714MB) to SQL Server **2022** Express Core (same filename, same install parameters - `SAPWD`/`INSTANCENAME`/`SECURITYMODE`/`TCPENABLED` have been stable since SQL Server 2016, so `setup-sqlserver.ps1` needed zero changes) at 279,293,816 bytes (~266MB), confirmed via `curl -sIL` (HTTP 200, correct Content-Length) before switching, not assumed from a search result. 2022 is also the version this project's own reference pipeline doc (`release_pipeline.md`) was written against - "~266 MB, almost entirely the bundled SQL Server Express" matches this download exactly, which is corroborating evidence this is the same package family, not a smaller variant that only coincidentally matches. The size difference between the two versions is not a Core-vs-LocalDB difference (both are the same Express Core tier) - the 2025 package is simply larger for unrelated reasons (its own install summary shows Azure Arc/AI-related components 2022 does not have). LocalDB was evaluated and rejected as an option: real Content-Length ~60.5MB confirmed available, but its on-demand/per-user runtime model doesn't fit an always-on service that needs external TCP connections the way this app requires, and switching to it would have required non-trivial changes to `setup-sqlserver.ps1`'s install/config logic for no clear win once the 2022 Core option existed at a still-small 266MB. Changed: `Desktop_app/scripts/downloadSqlServer.js` (`SQL_EXPRESS_URL`, `MIN_SANE_BYTES` 600MB -> 250MB), `Desktop_app/build/verify-sqlserver-install.ps1`'s payload-size check (600MB -> 250MB). The stale cached 748MB file under `Desktop_app/build/sqlserver/` was deleted and the new one re-downloaded and verified locally (266.4MB, matches).

**Point 4: genuine Windows containers cannot run on this Linux host** - confirmed again (Docker daemon not even running here, and even if it were, a Windows container needs a Windows kernel, which a Linux host cannot provide regardless of Docker configuration). The already-existing `windows-latest` GitHub Actions runner is the real "run it over there" - it was only ever used to *compile* the installer, never to *execute* it. New file `Desktop_app/build/verify-sqlserver-install.ps1` runs on that runner, against the actual built `resources/` folder, and does what no prior verification method here has done: installs a real SQL Server Express instance, connects to it for real, and - directly answering point 1 with evidence instead of a read-through - runs the update path a second time and asserts a marker row written before the update still exists afterward, plus that the pinned port did not change (regression test for the 1.0.9 "self-inflicted port walk" bug). The test password deliberately contains an apostrophe, regression-testing the 1.0.9 `QUOTENAME` fix. Wired into `.github/workflows/release.yml` directly before "Create GitHub Release", so a broken SQL path now blocks publishing instead of shipping silently, closing the exact gap that let six releases in a row (1.0.3-1.0.9) ship real, undetected bugs in this path found only by manual testing after each was already public.

**Also upgraded `lint-nsis.sh`'s PowerShell check from an approximation to the real parser.** It previously counted braces/strings in Python as a stand-in for a PowerShell parser (documented in the 1.0.9 entry as a known-imperfect substitute). `pwsh` is confirmed installable in this dev environment and is preinstalled on `windows-latest`/`ubuntu-latest`; `nsis-lint.yml` now installs it explicitly as a fallback if that ever changes, so `[System.Management.Automation.Language.Parser]::ParseFile` runs against both `setup-sqlserver.ps1` and the new `verify-sqlserver-install.ps1` on every push, not just locally when a developer happens to have `pwsh`.

**Still unverified:** `verify-sqlserver-install.ps1` itself has only been parse-checked (`0 errors, 649 tokens`) - `System.Data.SqlClient` and `Get-WmiObject` are Windows-only APIs unavailable in this dev environment, so this script has never actually executed for real. The next tagged release is the first time it runs for real, on the real `windows-latest` runner - it is validating the pipeline's SQL logic at the same time the pipeline is validating it.

---

## 1.0.12: v1.0.11's release build hung for 6 hours - the bundled SQL Server installer itself stalled

**v1.0.11 (switch to SQL Server 2022 Express, 266MB vs 2025's 714MB) never actually shipped.** The build succeeded - `npm run release:win` and artifact verification both passed, so the smaller installer genuinely got produced and bundled correctly. It never got a GitHub Release: the new CI gate added in the same commit (`verify-sqlserver-install.ps1`, "run the real install on a real Windows runner before publishing") ran the bundled installer and **hung for the full 6-hour GitHub Actions job ceiling** before being auto-cancelled. `gh release view v1.0.11` returns "release not found" - nothing was ever published under that tag, and this is why testing after that push still showed the old ~714MB download: there was nothing newer to get.

**Root cause, from the raw job log:** the last line before six hours of silence is `[...] No existing SQL Server instance found - installing SQL Server Express from bundled package.` - the log line immediately before `Start-Process -FilePath $InstallerPath ... -Wait`. The Microsoft installer process itself hung; `-Wait` has no timeout, so nothing in this repo's code could have caught it, and it sat there until GitHub's hard 6-hour ceiling killed it. Most likely cause: SQL Server Setup's default behavior of checking Windows/Microsoft Update over the network for a newer cumulative update before installing, stalling indefinitely on a CI runner's network - a well-documented cause of "unattended SQL Server install hangs in CI." **This is the reasoned cause, not an observed one** - re-running to confirm would cost another 6 hours if wrong, so the fix addresses it plus the failure mode itself, rather than betting everything on one diagnosis.

**Fix has two independent layers, deliberately - because the exact cause is not 100% certain:**
1. `Install-SqlServerExpress` now passes `/UPDATEENABLED=0`, which removes the network-update-check path entirely regardless of whether it was truly the cause. Also makes the installed version deterministic (exactly what's bundled) rather than "whatever Microsoft Update had that day."
2. Independently of whether (1) works: `Start-Process -Wait` (no timeout, ever) replaced with `Start-Process -PassThru` + `$proc.WaitForExit(20 * 60 * 1000)`, killing the process and throwing a clear, actionable error if it doesn't finish in 20 minutes. A real successful install on real Windows took under 10 minutes (see the 1.0.9 entry's log timestamps); 20 minutes is headroom, not a hope. This is the layer that actually matters: **whatever hangs next** - this cause or a different one - now fails loudly in 20 minutes instead of silently burning a 6-hour CI slot with zero diagnostic output, which is what the 1.0.11 run's own design was supposed to prevent and instead fell victim to.
3. `.github/workflows/release.yml`'s `release` job also gets `timeout-minutes: 60` - defense in depth for a hang anywhere else in the job, not just this one installer call.

**Verified by execution.** PowerShell 7.4.6 (see the 1.0.9/1.0.10 entries for why `which pwsh` failing doesn't mean it's unavailable - the scratch dir doesn't persist between sessions). `ParseFile`: 0 errors. `Install-SqlServerExpress` was extracted from the shipping script via its AST - not retyped - with only `$setupArgs` and the 20-minute constant swapped for test-safe stand-ins (`/bin/sleep` in place of the real installer), and **actually run**: a fast-exiting process passes through with no exception; a process that would hang past the timeout is killed and throws within the timeout window (tested at a 2-second bound, not the real 20 minutes, to keep the test itself fast) with zero orphaned processes left behind. `lint-nsis.sh` clean.

**Still unverified, and cannot be verified without spending real Windows CI minutes:** whether `/UPDATEENABLED=0` actually stops the hang, i.e. whether the diagnosis is correct. What is now guaranteed regardless: if it hangs again, v1.0.12's release job fails in ~20 minutes with a clear message, not silently in 6 hours with none.

**`v1.0.11`'s tag is left in place, not moved.** It points at a real commit whose build succeeded but which never got a published release - force-moving a pushed tag wasn't judged worth the risk for a tag with no public assets attached to it. `v1.0.12` is the tag that actually ships the SQL 2022 switch plus this fix.

## 2026-08-18 — Auto-update: disable `verifyUpdateCodeSignature`, keep signing the installers

**Decision:** `Desktop_app/package.json`'s `build.win` sets `verifyUpdateCodeSignature: false`. Installers are still signed with the self-signed certificate exactly as before; only `electron-updater`'s *publisher-identity* check on a downloaded update is switched off.

**Why:** This is the cost that the 2026-08-13 auto-update entry above flagged as "a future cost to budget for", arriving. A real 1.0.17 install downloaded the update and refused it:

> `"Status": 1, "StatusMessage": "A certificate chain processed, but terminated in a root certificate which is not trusted by the trust provider"`

The signature itself is valid — signtool works, and `Issuer` equals `Subject` (`C=PK, O=Starmans, CN=Starmans Sole House`), which is what self-signed means. `electron-updater` requires a chain terminating in a root Windows trusts, and a self-signed root is not in the Trusted Root store, so no self-signed certificate can ever satisfy this check. Signing more correctly would not have helped; the check and the chosen certificate are fundamentally incompatible.

**What is and is not lost:** download integrity is still enforced — `electron-updater` verifies the downloaded installer's sha512 against `latest.yml`, over HTTPS from GitHub Releases, so a corrupted or substituted file is still rejected. What is given up is publisher-identity verification of the update binary. Given the certificate is self-signed and therefore attests to no externally-verified identity in the first place, that check was providing far less than its name suggests here.

**Alternatives considered:** Add the self-signed certificate to each client machine's Trusted Root store from the NSIS installer (`certutil -addstore Root`) — rejected: it makes anything signed with that key trusted machine-wide, a broader trust expansion than the problem warrants, and it cannot help a machine already running 1.0.17 without a reinstall. Buy an OV/EV code-signing certificate (~$200-400/yr, now requiring a hardware token or cloud HSM) — the real fix, and still the eventual one: it would restore this check *and* remove SmartScreen warnings. Deferred on cost and lead time, and per the code-signing entry above the swap remains two GitHub secrets, not a rewrite.

**Not covered by CI:** no automated gate exercises the updater's verification path — `verify-sqlserver-install.ps1` covers SQL Server setup only, and nothing in the pipeline performs an app-to-app update. This was found by a human clicking "Check for Updates" and can only be re-verified the same way.

---

## 2026-08-18 — Real database backups: native `BACKUP DATABASE`, staged locally before an external copy

**Decision:** Add actual backup functionality (the backup folder collected at install time had been sitting unused since 1.0.9 — see the entry above, "REVISED: adopt a proven bundled-SQL-Server release pipeline"). New `Backend/src/services/backup.js` runs T-SQL `BACKUP DATABASE ... TO DISK` (not a file copy of `.mdf`/`.ldf`, which would need the database briefly detached on every cycle). Two paths:
- **Automatic:** every hour (`main.js`'s `startBackupSchedule`), straight into the installer-configured `backupFolder` from `app-config.json`. Silent on success and failure — an hourly popup trains the user to dismiss it unread — but every attempt is appended to `C:\ProgramData\Starmans\backup.log`.
- **Manual, to an external drive:** a "Backup to External Drive..." button in Settings (`SettingsPage.tsx`) opens a folder picker (`dialog.showOpenDialog`), then runs a **fresh** backup into a fixed staging folder (`%ProgramData%\Starmans\backup-staging`) and copies it to the chosen destination with plain `fs.copyFile`, deleting the staging copy after.

**Why the staging indirection instead of backing up straight to the user's chosen folder:** `BACKUP DATABASE` executes inside the SQL Server service process, under its own Windows service account (`NT SERVICE\MSSQL$SQLEXPRESS`) — not the logged-in user, and not this app's process. That account has no write access to an arbitrary folder a user browses to at runtime (a USB drive, a network share) unless something grants it there first, and granting NTFS permissions requires admin elevation the app does not hold post-install. `setup-sqlserver.ps1`'s new `Grant-BackupFolderAccess` (via `icacls`) can only realistically do that once, at install time, elevated, against two known-stable paths: the installer-chosen `backupFolder` and the fixed staging folder. It cannot pre-grant access to a drive letter that doesn't exist yet. So: SQL Server writes where it already has permission (staging), and the app process — which, unlike the service account, already has normal access to whatever the user can browse to in Explorer — does the final copy with its own permissions. The result is still a backup taken at the moment of the click, just via one extra local copy.

**Why the primary backup folder now defaults to a non-system drive:** `installer.nsh`'s new `StarmansDefaultBackupPath` checks D:–H: and pre-fills the first one found (falling back to `Documents\Starmans Backup` on a single-drive machine), per explicit instruction — a C:-drive failure (the most common single point of failure on a small-business PC) shouldn't be able to take out the live database and every backup of it in the same event. The Browse button still lets the user override this to anything, including Documents or a network path.

**Alternatives considered:** Granting the SQL Server service account access to any folder at backup time via a UAC-elevated helper — rejected as unnecessary complexity and a worse user experience (a UAC prompt every hour, or every manual click) when the staging-then-copy approach avoids elevation entirely after install. Raw file copy of `.mdf`/`.ldf` instead of `BACKUP DATABASE` — rejected, needs the database stopped/detached each cycle, which an hourly automatic job cannot do without visible downtime.

**Not yet covered:** retention/rotation of old `.bak` files (none — every run, scheduled or manual, adds a new timestamped file, unbounded) and an in-app way to change the primary backup folder after install (the folder picker only exists for the external/manual path; the automatic path still uses whatever the installer collected). Both explicitly deferred per the requesting conversation ("currently — later we will change"). **Unverified on real Windows**, same as the rest of this pipeline (see prior entries) — no Windows/SQL Server environment in this dev sandbox; `Grant-BackupFolderAccess`'s `icacls` call in particular has only been read-reviewed, never executed.
