-- ============================================================================
-- Salon booking — Postgres / Supabase schema
-- Replaces the Google Sheet ("Reservations" / "Barbers" / "Services" tabs).
--
-- Design note: the WhatsApp bot writes Arabic DISPLAY names into
-- reservations.barber_name / service_name / slot (e.g. 'عمر', 'قص الشعر',
-- 'من 1 إلى 3 مساءً'). We mirror the sheet columns 1:1 as text so the bot and
-- dashboard keep working unchanged. barbers/services are lookup tables the
-- dashboard uses for the barber list, day-off and ordering.
-- Run this ONCE in the Supabase SQL editor (or: psql "$DATABASE_URL" -f 001_schema.sql)
-- ============================================================================

create table if not exists barbers (
  barber_id     text primary key,          -- BR001
  name          text,                      -- Omar   (english)
  name_ar       text not null,             -- عمر    (matches reservations.barber_name)
  is_available  boolean not null default true,
  day_off       int,                       -- JS getDay(): Sun=0 .. Sat=6 ; عمر=1(Mon), محمد=2(Tue)
  sort_order    int not null default 0
);

create table if not exists services (
  service_id    text primary key,          -- SV001
  name          text,                      -- Haircut (english)
  name_ar       text,                      -- قص الشعر
  is_available  boolean not null default true
);

create table if not exists reservations (
  id              bigint generated always as identity primary key,
  booking_ref     text not null unique,    -- BK-123456 / WyymmddHHMMnn (walk-in)
  service_name    text,                    -- arabic display, as the bot writes it
  barber_name     text,                    -- arabic display, matches barbers.name_ar
  time_preference text,
  customer_name   text,
  phone           text default '',         -- canonical 20XXXXXXXXXX ('' when unknown)
  created_at      text,                    -- original string from the bot, e.g. '2026-06-20 19:34'
  booking_date    date,                    -- NULL for legacy rows with no date
  slot            text default '',         -- arabic slot label ('' for legacy rows)
  status          text not null default '',-- '' active | 'done' served | 'cancelled'
  reminded_at     text default '',         -- 'YYYY-MM-DD' the 1h reminder last fired (dedupe)
  inserted_at     timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_res_date        on reservations (booking_date);
create index if not exists idx_res_barber_slot on reservations (barber_name, booking_date, slot);
create index if not exists idx_res_phone        on reservations (phone);
create index if not exists idx_res_status       on reservations (status);

-- keep updated_at fresh on any change (used by the dashboard / debugging)
-- `set search_path = ''` keeps the trigger immune to search_path hijacking
-- (Supabase linter 0011).
create or replace function set_updated_at() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_res_updated_at on reservations;
create trigger trg_res_updated_at
  before update on reservations
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security: ON with NO policies. Supabase exposes every public-schema
-- table through PostgREST using the (publicly shipped) anon key, so leaving RLS
-- off would make customer phone numbers world-readable. With RLS enabled and no
-- policy, anon/authenticated get nothing, while the only real clients — the n8n
-- bot and the Vercel dashboard — connect as the `postgres` role over the direct
-- /pooler connection and bypass RLS entirely.
-- ---------------------------------------------------------------------------
alter table barbers      enable row level security;
alter table services     enable row level security;
alter table reservations enable row level security;
