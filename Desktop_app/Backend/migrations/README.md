# Migrations

Plain, hand-written, numbered `.sql` files — no ORM migration tooling (see `DECISIONS.md`, "MSSQL data-access approach"). Run in order, once, against the target database.

## Running a migration

```bash
sqlcmd -C -S <server> -U <user> -P <password> -i migrations/001_initial_schema.sql
```

On the dev machine (per `DECISIONS.md`, "Development environment"), that's typically:

```bash
sqlcmd -C -S localhost -U sa -P '<sa-password>' -i migrations/001_initial_schema.sql
```

## Adding a new migration

- Next file is `002_<short_description>.sql`, then `003_...`, and so on — always the next unused number, sequential.
- Guard `CREATE TABLE`/`CREATE INDEX` statements with `IF OBJECT_ID(...) IS NULL` / `IF NOT EXISTS (...)` so migrations are safe to re-run (see `001_initial_schema.sql` for the pattern).
- If two agents are working in parallel (per `TASKS.md`) and might add a migration around the same time, check the folder for the current highest number immediately before naming your file to avoid a numbering collision.
- Every migration that changes the schema should be reflected in the relevant task's notes in `TASKS.md` and, if it represents a real design choice (not just a mechanical table add), logged in `DECISIONS.md`.

## Files

| File | What it does |
|---|---|
| `001_initial_schema.sql` | Creates all 14 tables (see `ANALYSIS.md` / `EFFORT_ANALYSIS.md` §1 for the full model list and the reasoning behind each parent/child split) |
