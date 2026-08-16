# Salon → Supabase + Vercel migration — status & checklist

_Last updated: 2026-08-16 (DB cutover session)_

## TL;DR
**The bot is on Postgres.** Workflow `ValuwlCKXRdDokCC` was published at
2026-08-16 12:52 UTC with the five Google Sheets nodes replaced by Postgres
nodes on the `Salon Postgres` credential (`HKc8Pa59yM0Qv6r3`). The database holds
243 bookings, 2 barbers, 8 services, and was re-synced against the live sheet
immediately before and after the flip (2 rows differed: one cancellation, one
edited phone).

The Google Sheet is now **read-only history** — nothing writes to it any more.
Do not add or edit bookings there; use the dashboard.

---

## Target database

| | |
|---|---|
| Supabase project | **a-3isa's Project** — ref `mdwutpkrimtiwmfazpoi` (eu-central-1) |
| Status | ACTIVE_HEALTHY (was paused; restored this session) |
| Tables | `barbers` (2), `services` (8), `reservations` (243) |
| Dashboard | https://salon-dashboard-lemon.vercel.app — project `prj_aJH8Pn7tQwNryvye77afMba8ENGA` (team `a-3isas-projects`) |
| Bot workflow | n8n `ValuwlCKXRdDokCC` — still on Google Sheets until step 3 |

The project also holds six **empty, unrelated** tables from an abandoned app
(`workspaces`, `workspace_memberships`, `workspace_settings`, `workspace_invites`,
`bookings`, `expenses`). They do not collide with the salon tables; delete them
whenever you like.

## ✅ Done

1. **Backup** → `backup/2026-08-16/` (sheet dump JSON + one CSV per tab, plus source copies).
2. **Schema applied** — `barbers`, `services`, `reservations` + indexes + `updated_at` trigger.
   - **RLS is ON with no policies** on all three tables. Supabase publishes every
     public-schema table through PostgREST with the public anon key, so RLS-off would
     make customer phone numbers world-readable. The bot and dashboard connect as
     `postgres` over the pooler and bypass RLS, so nothing else changes.
   - `set_updated_at()` pinned with `set search_path = ''`.
3. **Data loaded** — all 243 bookings, idempotent on `booking_ref`.
   Verified: 12 legacy rows with no date, 39 with no phone, 84 `done`, 159 active,
   0 cancelled, latest booking_date 2026-08-16, 2 non-Egyptian phones (Saudi `966…`, expected).
4. **Migration SQL files** in `migration/` updated to match what was actually applied.
5. **n8n reference file** `n8n_workflow.js` — the five Google Sheets nodes are rewritten
   as Postgres `executeQuery` nodes (see "How the bot changes" below). Not yet applied
   to the live workflow.

6. **Bot flipped to Postgres** (2026-08-16 12:52 UTC) — five nodes swapped, workflow
   published, connections and canvas positions preserved. `alwaysOutputData` is on for
   all five so an empty result still lets the branch continue.
7. **Delta sync** — the live sheet was diffed against the backup snapshot that seeded
   Postgres, before and after publishing. Scripts: `scratchpad/delta.py`.

8. **Dashboard live on Postgres** (2026-08-16 13:23 UTC) — `GET /api/board` returns 200.
   The Vercel project is now git-linked to `a-3isa/salon-bot` with Root Directory
   `vercel-dashboard`, so every push to `main` deploys production automatically.

### Two traps worth remembering
- **Root Directory.** Without it the git build runs at the repo root and dies with
  "Couldn't find any `pages` or `app` directory".
- **`sslmode` in the connection string.** The Supabase↔Vercel integration supplies
  `POSTGRES_URL=…?sslmode=require`. node-postgres parses `sslmode` out of the URL and
  lets it override the `ssl` option, and treats `require` as `verify-full` — so
  `rejectUnauthorized:false` was silently ignored and every query failed with
  "self-signed certificate in certificate chain". `lib/db.js` now strips the parameter
  and sets the TLS policy explicitly.

## ⏳ Left to do

Nothing blocking. Optional follow-ups:
- Retire the sheet + Apps Script webview once a full day has passed on Postgres.
- Move the reminder dedupe from n8n static data to `reservations.reminded_at`.

## Old checklist (done)

### 1. Get the connection string
Supabase → project `mdwutpkrimtiwmfazpoi` → **Connect** → **Transaction pooler** (port 6543).
It looks like `postgresql://postgres.mdwutpkrimtiwmfazpoi:[PASSWORD]@aws-N-eu-central-1.pooler.supabase.com:6543/postgres`.
If you don't know the DB password: Settings → Database → **Reset database password**.

### 2. Vercel env vars → then Redeploy
Project `salon-dashboard` → Settings → Environment Variables (Production):
- `DATABASE_URL` = the pooler URI from step 1
- `DASHBOARD_PASSWORD` = the PIN the barbers type at `/login`
- `AUTH_SECRET` = any long random string

Then Deployments → ⋯ → **Redeploy**. The dashboard is read/write against Postgres from
that moment — safe, because the sheet is still the bot's source of truth until step 3.

### 3. n8n credential → then tell me
n8n → Credentials → **New** → *Postgres*, named exactly **`Salon Postgres`**:
- Host `aws-N-eu-central-1.pooler.supabase.com` (the same host as step 1)
- Database `postgres` · User `postgres.mdwutpkrimtiwmfazpoi` · Port `6543`
- Password: the DB password · SSL: **require**

Do **not** reuse the existing `Postgres account` credential — it belongs to the other
(apartment) bot and points at a different database.

Ping me once it exists and I will:
- re-dump the sheet and upsert any bookings taken since this morning's backup,
- swap the five nodes on workflow `ValuwlCKXRdDokCC`, validate, and publish,
- watch the first executions.

### 4. After the flip
Retire the sheet + Apps Script webview only once the bot and dashboard are both
confirmed on Postgres for a full day.

## How the bot changes

| Node | Was | Becomes |
|---|---|---|
| Read Reservations | Sheets read (all rows) | `select … from reservations order by id` |
| Lookup Booking | Sheets read + filter | `select … where booking_ref = $1 limit 1` |
| Append Reservation | Sheets append | `insert … on conflict (booking_ref) do nothing` |
| Update Booking | Sheets update by `booking_ref` | `update reservations set … where booking_ref = $1` |
| Read Res (Reminder) | Sheets read (all rows) | same select, narrowed to today's live rows (Cairo) |

Two details that keep the existing JS working unchanged:
- `booking_date` is returned via `to_char(booking_date,'YYYY-MM-DD')`; a raw `date`
  column would arrive as an ISO timestamp and break the string comparisons.
- Query parameters are passed as an **array** expression, not n8n's comma-separated
  string — Arabic service lists contain separators that would split.

Also fixed for free by the move: `phone` is a real `text` column, so the
leading-zero-stripping the Sheet used to do can't happen again.

## Notes
- No data-loss risk so far: the sheet is untouched and every migration script is
  re-runnable (`on conflict … do update`).
- The bot's sessions still live in n8n static data with
  `N8N_CONCURRENCY_PRODUCTION_LIMIT=1` — unchanged by this cutover.
- `reservations.reminded_at` exists for the 1h-reminder dedupe, but Pick Due Reminders
  still dedupes via static data. Moving it to the column is a follow-up, not a blocker.
