-- Media module schema for Supabase
-- Run in your Supabase SQL editor

-- 1) Storage bucket for media assets
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

-- 2) Table for media metadata
create table if not exists public.media (
  id uuid primary key default gen_random_uuid(),
  title text,
  tags text[],
  -- Allow either an uploaded object (storage_path) or an external URL (url)
  storage_path text,
  url text,
  -- Expanded set of media types to support richer content
  -- Note: if this table already exists in your project, see the ALTER TABLE block below
  type text check (type in ('image','video','pdf','html','url','slides','other')) not null,
  mime_type text,
  file_size bigint,
  duration integer,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

-- 3) Enable RLS and simple policies (adjust to your needs)
alter table public.media enable row level security;

-- Allow authenticated users to CRUD their media (demo-friendly). Tighten as needed.
create policy if not exists "media_select_all" on public.media
  for select using (true);

create policy if not exists "media_insert_auth" on public.media
  for insert to authenticated with check (true);

create policy if not exists "media_update_auth" on public.media
  for update to authenticated using (true);

create policy if not exists "media_delete_auth" on public.media
  for delete to authenticated using (true);

-- Allow anon players to read media that's in playlists assigned to screens
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'player_can_read_assigned_media'
      AND schemaname = 'public'
      AND tablename = 'media'
  ) THEN
    CREATE POLICY "player_can_read_assigned_media"
    ON public.media
    FOR SELECT
    TO anon
    USING (
      EXISTS (
        SELECT 1
        FROM public.playlist_items pi
        JOIN public.screens s ON s.assigned_playlist_id = pi.playlist_id
        WHERE pi.media_id = media.id
      )
    );
  END IF;
END $$;

-- 4) Storage policies for the 'media' bucket
create policy if not exists "Public read for media" on storage.objects
  for select
  using (bucket_id = 'media');

create policy if not exists "Authenticated upload media" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'media');

create policy if not exists "Authenticated delete media" on storage.objects
  for delete to authenticated
  using (bucket_id = 'media');

  -- Backfill-safe: relax NOT NULL on storage_path for existing deployments
do $$ begin
  alter table public.media alter column storage_path drop not null;
exception
  when undefined_table then null;
  when invalid_schema_name then null;
end $$;

-- Backfill-safe: replace legacy type check constraint with the expanded set
do $$
declare
  r record;
begin
  -- Drop any existing CHECK constraints on public.media (idempotent)
  for r in (
    select conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where c.contype = 'c'
      and n.nspname = 'public'
      and t.relname = 'media'
  ) loop
    execute format('alter table public.media drop constraint if exists %I', r.conname);
  end loop;

  -- Recreate the desired CHECK constraint (corrected syntax)
  execute 'alter table public.media add constraint media_type_check check (type in (''image'',''video'',''pdf'',''html'',''url'',''slides'',''other''))';
exception
  when undefined_table then null;
  when insufficient_privilege then null;
end $$;


-- ==============================
-- User & Role Management
-- ==============================

-- Enum for roles
do $$ begin
  create type public.user_role as enum ('admin','manager','viewer');
exception when duplicate_object then null; end $$;

-- Profiles table extending auth.users
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  display_name text,
   role public.user_role not null default 'viewer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now();
);

-- Auto-update updated_at
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Create a profile row when a new auth user is created
create or replace function public.handle_new_user()
returns trigger
security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'viewer')
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS
alter table public.profiles enable row level security;

-- Read own profile; admins can read all
create policy if not exists "profiles_read_own_or_admin" on public.profiles
  for select
  using (
    auth.uid() = id
  );

-- Update own profile fields (not role); admins can update any
create policy if not exists "profiles_update_self_or_admin" on public.profiles
  for update
  using (
    auth.uid() = id
  )
  with check (
    auth.uid() = id
  );

-- Prevent non-admins from changing role via RLS using a check constraint with trigger
create or replace function public.prevent_role_change_by_non_admin()
returns trigger as $$
begin
  if (old.role is distinct from new.role) then
    -- allow only if current user is admin
    if not public.is_admin() then
      raise exception 'Only admins can change roles';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists prevent_role_change on public.profiles;
create trigger prevent_role_change
  before update on public.profiles
  for each row execute function public.prevent_role_change_by_non_admin();

-- Helper: admin check without causing RLS recursion
create or replace function public.is_admin()
returns boolean
security definer
set search_path = public
language sql
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

-- ==============================
-- Playlists & Playlist Items
-- ==============================

-- Table: playlists
-- A user-owned collection of media. Can be public or private.
-- ==============================
-- Playlists & Playlist Items
-- ==============================

-- Table: playlists
create table if not exists public.playlists (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 160),
  description text,
  is_public boolean not null default false,
  thumbnail_media_id uuid references public.media(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint playlists_owner_name_unique unique (created_by, name)
);

-- Keep updated_at fresh on updates
drop trigger if exists set_playlists_updated_at on public.playlists;
create trigger set_playlists_updated_at
  before update on public.playlists
  for each row execute function public.set_updated_at();

-- Table: playlist_items
create table if not exists public.playlist_items (
  id uuid primary key default gen_random_uuid(),
  playlist_id uuid not null references public.playlists(id) on delete cascade,
  media_id uuid not null references public.media(id) on delete cascade,
  order_index integer,
  added_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  added_by uuid references auth.users(id),
  constraint playlist_items_media_unique unique (playlist_id, media_id),
  constraint playlist_items_order_unique unique (playlist_id, order_index)
);

-- Auto-assign order_index if not provided: next max+1 per playlist
create or replace function public.playlist_items_assign_order()
returns trigger as $$
begin
  if new.order_index is null then
    select coalesce(max(order_index) + 1, 1)
      into new.order_index
      from public.playlist_items
     where playlist_id = new.playlist_id;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists playlist_items_assign_order_trg on public.playlist_items;
create trigger playlist_items_assign_order_trg
  before insert on public.playlist_items
  for each row execute function public.playlist_items_assign_order();

-- Keep updated_at fresh on updates for playlist_items
drop trigger if exists set_playlist_items_updated_at on public.playlist_items;
create trigger set_playlist_items_updated_at
  before update on public.playlist_items
  for each row execute function public.set_updated_at();

-- Helpful indexes
create index if not exists idx_playlists_owner on public.playlists (created_by);
create index if not exists idx_playlists_public on public.playlists (is_public);
create index if not exists idx_playlist_items_playlist on public.playlist_items (playlist_id, order_index);
create index if not exists idx_playlist_items_media on public.playlist_items (media_id);

-- =====================================
-- RLS: Playlists
-- =====================================
alter table public.playlists enable row level security;

-- Select: Public playlists visible to everyone. Owners/admins see all.
do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'playlists_select_visibility' and tablename = 'playlists') then
    create policy "playlists_select_visibility" on public.playlists
      for select using (
        is_public
        or created_by = auth.uid()
        or public.is_admin()
      );
  end if;
end $$;

-- Allow anon players to read playlists assigned to their screen
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'player_can_read_assigned_playlist'
      AND schemaname = 'public'
      AND tablename = 'playlists'
  ) THEN
    CREATE POLICY "player_can_read_assigned_playlist"
    ON public.playlists
    FOR SELECT
    TO anon
    USING (
      EXISTS (
        SELECT 1
        FROM public.screens s
        WHERE s.assigned_playlist_id = playlists.id
      )
    );
  END IF;
END $$;

-- ==============================
-- Playlist-level Ticker Overrides
-- ==============================

-- Per-playlist optional overrides for ticker behavior.
-- Null values mean "inherit" from user-level config.
create table if not exists public.playlist_ticker_configs (
  id uuid primary key default gen_random_uuid(),
  playlist_id uuid not null references public.playlists(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  enabled boolean, -- null => inherit
  symbols text[],  -- null => inherit
  refresh_interval integer check (refresh_interval between 10 and 3600), -- null => inherit
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint playlist_ticker_configs_playlist_unique unique (playlist_id)
);

-- Ensure symbols array (when provided) is not empty
alter table public.playlist_ticker_configs
drop constraint if exists playlist_ticker_symbols_not_empty;

alter table public.playlist_ticker_configs
add constraint playlist_ticker_symbols_not_empty
check (
  symbols is null or array_length(symbols, 1) > 0
);

-- Keep updated_at fresh on updates
drop trigger if exists set_playlist_ticker_configs_updated_at on public.playlist_ticker_configs;
create trigger set_playlist_ticker_configs_updated_at
  before update on public.playlist_ticker_configs
  for each row execute function public.set_updated_at();

-- Sanitization trigger: preserve NULL (inherit), sanitize only when array provided
create or replace function public.playlist_ticker_configs_before_write()
returns trigger as $$
begin
  if new.symbols is not null then
    new.symbols := public.ticker_sanitize_symbols(new.symbols);
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists playlist_ticker_configs_before_write_trg on public.playlist_ticker_configs;
create trigger playlist_ticker_configs_before_write_trg
  before insert or update of symbols on public.playlist_ticker_configs
  for each row execute function public.playlist_ticker_configs_before_write();

-- Helpful indexes
create index if not exists idx_playlist_ticker_configs_playlist on public.playlist_ticker_configs (playlist_id);
create index if not exists idx_playlist_ticker_configs_owner on public.playlist_ticker_configs (created_by);
create index if not exists idx_playlist_ticker_configs_enabled 
  on public.playlist_ticker_configs (playlist_id) where enabled is true;

-- Enable Row-Level Security (RLS)
alter table public.playlist_ticker_configs enable row level security;

-- ==========================
-- RLS Policies
-- ==========================

-- Select visible if the parent playlist is visible
do $$
begin
  if not exists (
    select 1 from pg_policies 
    where policyname = 'playlist_ticker_select_by_playlist_visibility' 
    and tablename = 'playlist_ticker_configs'
  ) then
    create policy "playlist_ticker_select_by_playlist_visibility" 
      on public.playlist_ticker_configs
      for select using (
        exists (
          select 1 from public.playlists pl
          where pl.id = playlist_id
            and (pl.is_public or pl.created_by = auth.uid() or public.is_admin())
        )
      );
  end if;
end $$;

-- Insert/update/delete only by playlist owner or admin
do $$
begin
  if not exists (
    select 1 from pg_policies 
    where policyname = 'playlist_ticker_insert_owner_or_admin' 
    and tablename = 'playlist_ticker_configs'
  ) then
    create policy "playlist_ticker_insert_owner_or_admin" 
      on public.playlist_ticker_configs
      for insert to authenticated
      with check (
        exists (
          select 1 from public.playlists pl
          where pl.id = playlist_id 
            and (pl.created_by = auth.uid() or public.is_admin())
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies 
    where policyname = 'playlist_ticker_update_owner_or_admin' 
    and tablename = 'playlist_ticker_configs'
  ) then
    create policy "playlist_ticker_update_owner_or_admin" 
      on public.playlist_ticker_configs
      for update to authenticated
      using (
        exists (
          select 1 from public.playlists pl
          where pl.id = playlist_id 
            and (pl.created_by = auth.uid() or public.is_admin())
        )
      )
      with check (
        exists (
          select 1 from public.playlists pl
          where pl.id = playlist_id 
            and (pl.created_by = auth.uid() or public.is_admin())
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies 
    where policyname = 'playlist_ticker_delete_owner_or_admin' 
    and tablename = 'playlist_ticker_configs'
  ) then
    create policy "playlist_ticker_delete_owner_or_admin" 
      on public.playlist_ticker_configs
      for delete to authenticated
      using (
        exists (
          select 1 from public.playlists pl
          where pl.id = playlist_id 
            and (pl.created_by = auth.uid() or public.is_admin())
        )
      );
  end if;
end $$;


-- Insert: Auth users can create their own; admins for anyone.
do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'playlists_insert_owner_or_admin' and tablename = 'playlists') then
    create policy "playlists_insert_owner_or_admin" on public.playlists
      for insert to authenticated
      with check (
        created_by = auth.uid() or public.is_admin()
      );
  end if;
end $$;

-- Update: Only owner or admin
do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'playlists_update_owner_or_admin' and tablename = 'playlists') then
    create policy "playlists_update_owner_or_admin" on public.playlists
      for update to authenticated
      using (
        created_by = auth.uid() or public.is_admin()
      )
      with check (
        created_by = auth.uid() or public.is_admin()
      );
  end if;
end $$;

-- Delete: Only owner or admin
do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'playlists_delete_owner_or_admin' and tablename = 'playlists') then
    create policy "playlists_delete_owner_or_admin" on public.playlists
      for delete to authenticated
      using (
        created_by = auth.uid() or public.is_admin()
      );
  end if;
end $$;

-- =====================================
-- RLS: Playlist Items
-- =====================================
alter table public.playlist_items enable row level security;

-- Select: visible if parent playlist is visible
do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'playlist_items_select_by_playlist_visibility' and tablename = 'playlist_items') then
    create policy "playlist_items_select_by_playlist_visibility" on public.playlist_items
      for select using (
        exists (
          select 1 from public.playlists pl
          where pl.id = playlist_id
            and (
              pl.is_public
              or pl.created_by = auth.uid()
              or public.is_admin()
            )
        )
      );
  end if;
end $$;

-- Allow anon players to read playlist_items for playlists assigned to screens
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'player_can_read_assigned_playlist_items'
      AND schemaname = 'public'
      AND tablename = 'playlist_items'
  ) THEN
    CREATE POLICY "player_can_read_assigned_playlist_items"
    ON public.playlist_items
    FOR SELECT
    TO anon
    USING (
      EXISTS (
        SELECT 1
        FROM public.screens s
        WHERE s.assigned_playlist_id = playlist_items.playlist_id
      )
    );
  END IF;
END $$;

-- Insert: only playlist owner or admin
do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'playlist_items_insert_owner_or_admin' and tablename = 'playlist_items') then
    create policy "playlist_items_insert_owner_or_admin" on public.playlist_items
      for insert to authenticated
      with check (
        exists (
          select 1 from public.playlists pl
          where pl.id = playlist_id
            and (
              pl.created_by = auth.uid() or public.is_admin()
            )
        )
      );
  end if;
end $$;

-- Update: only playlist owner or admin
do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'playlist_items_update_owner_or_admin' and tablename = 'playlist_items') then
    create policy "playlist_items_update_owner_or_admin" on public.playlist_items
      for update to authenticated
      using (
        exists (
          select 1 from public.playlists pl
          where pl.id = playlist_id
            and (
              pl.created_by = auth.uid() or public.is_admin()
            )
        )
      )
      with check (
        exists (
          select 1 from public.playlists pl
          where pl.id = playlist_id
            and (
              pl.created_by = auth.uid() or public.is_admin()
            )
        )
      );
  end if;
end $$;

-- Delete: only playlist owner or admin
do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'playlist_items_delete_owner_or_admin' and tablename = 'playlist_items') then
    create policy "playlist_items_delete_owner_or_admin" on public.playlist_items
      for delete to authenticated
      using (
        exists (
          select 1 from public.playlists pl
          where pl.id = playlist_id
            and (
              pl.created_by = auth.uid() or public.is_admin()
            )
        )
      );
  end if;
end $$;

-- ==============================
-- Screen Resolutions (reference data)
-- ==============================

create table if not exists public.screen_resolutions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  aspect_ratio text,
  refresh_rate integer,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint screen_resolutions_name_unique unique (name),
  constraint screen_resolutions_dims_unique unique (width, height)
);

-- Keep updated_at fresh on updates
drop trigger if exists set_screen_resolutions_updated_at on public.screen_resolutions;
create trigger set_screen_resolutions_updated_at
  before update on public.screen_resolutions
  for each row execute function public.set_updated_at();

-- Auto-compute aspect_ratio as simplified W:H on insert/update
create or replace function public.screen_resolutions_set_aspect_ratio()
returns trigger as $$
declare
  w integer;
  h integer;
  a integer;
  b integer;
  g integer;
begin
  w := new.width;
  h := new.height;
  if w is null or h is null or w <= 0 or h <= 0 then
    new.aspect_ratio := null;
    return new;
  end if;

  a := w; b := h; g := 1;
  -- Euclidean algorithm for GCD
  while b <> 0 loop
    g := a % b;
    a := b;
    b := g;
  end loop;
  g := abs(a);
  if g <= 0 then g := 1; end if;
  new.aspect_ratio := (w / g)::text || ':' || (h / g)::text;
  return new;
end;
$$ language plpgsql;

drop trigger if exists screen_resolutions_compute_aspect on public.screen_resolutions;
create trigger screen_resolutions_compute_aspect
  before insert or update of width, height on public.screen_resolutions
  for each row execute function public.screen_resolutions_set_aspect_ratio();

-- RLS for screen_resolutions: everyone can read; only admins can write
alter table public.screen_resolutions enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'screen_resolutions_select_all' and tablename = 'screen_resolutions') then
    create policy "screen_resolutions_select_all" on public.screen_resolutions
      for select using (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'screen_resolutions_insert_admin' and tablename = 'screen_resolutions') then
    create policy "screen_resolutions_insert_admin" on public.screen_resolutions
      for insert to authenticated
      with check (public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where policyname = 'screen_resolutions_update_admin' and tablename = 'screen_resolutions') then
    create policy "screen_resolutions_update_admin" on public.screen_resolutions
      for update to authenticated
      using (public.is_admin())
      with check (public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where policyname = 'screen_resolutions_delete_admin' and tablename = 'screen_resolutions') then
    create policy "screen_resolutions_delete_admin" on public.screen_resolutions
      for delete to authenticated
      using (public.is_admin());
  end if;
end $$;

-- ==============================
-- Screens
-- ==============================

-- Screen status enum
do $$ begin
  create type public.screen_status as enum ('online','offline');
exception when duplicate_object then null; end $$;

-- A registered display device that can be assigned a playlist
create table if not exists public.screens (
  id uuid primary key default gen_random_uuid(),
  screen_code text not null,
  name text not null check (char_length(name) between 1 and 160),
  location text,
  status public.screen_status not null default 'offline',
  last_seen_at timestamptz,
  resolution_id uuid references public.screen_resolutions(id) on delete set null,
  assigned_playlist_id uuid references public.playlists(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint screens_owner_code_unique unique (created_by, screen_code)
);

-- Backfill-safe: ensure resolution_id exists; drop old resolution text if present
do $$ begin
  alter table public.screens add column if not exists resolution_id uuid references public.screen_resolutions(id) on delete set null;
exception when undefined_table then null; end $$;
do $$ begin
  alter table public.screens drop column if exists resolution;
exception when undefined_column then null; end $$;

-- Backfill-safe: convert status to enum if needed
do $$ begin
  alter table public.screens
    alter column status type public.screen_status using status::public.screen_status,
    alter column status set default 'offline',
    alter column status set not null;
exception when undefined_table then null; when invalid_text_representation then null; end $$;

-- Keep updated_at fresh on updates
drop trigger if exists set_screens_updated_at on public.screens;
create trigger set_screens_updated_at
  before update on public.screens
  for each row execute function public.set_updated_at();

-- Helpful indexes
create index if not exists idx_screens_owner on public.screens (created_by);
create index if not exists idx_screens_status on public.screens (status);
create index if not exists idx_screens_playlist on public.screens (assigned_playlist_id);
create index if not exists idx_screens_resolution on public.screens (resolution_id);

-- RLS: Screens
alter table public.screens enable row level security;

-- Select: screen visible to owner or admin
do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'screens_select_owner_or_admin' and tablename = 'screens') then
    create policy "screens_select_owner_or_admin" on public.screens
      for select using (
        created_by = auth.uid() or public.is_admin()
      );
  end if;
end $$;

-- Insert: only as self owner or admin
do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'screens_insert_owner_or_admin' and tablename = 'screens') then
    create policy "screens_insert_owner_or_admin" on public.screens
      for insert to authenticated
      with check (
        created_by = auth.uid() or public.is_admin()
      );
  end if;
end $$;

-- Update: only owner or admin
do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'screens_update_owner_or_admin' and tablename = 'screens') then
    create policy "screens_update_owner_or_admin" on public.screens
      for update to authenticated
      using (
        created_by = auth.uid() or public.is_admin()
      )
      with check (
        created_by = auth.uid() or public.is_admin()
      );
  end if;
end $$;

-- Delete: only owner or admin
do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'screens_delete_owner_or_admin' and tablename = 'screens') then
    create policy "screens_delete_owner_or_admin" on public.screens
      for delete to authenticated
      using (
        created_by = auth.uid() or public.is_admin()
      );
  end if;
end $$;

-- ==============================
-- Devices (for player pairing)
-- ==============================

-- Table: devices
create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  name text,
  code text unique not null,  -- pairing code shown on player
  last_seen timestamptz default now(),
  paired boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Helpful index to enforce/ensure code uniqueness idempotently
create unique index if not exists idx_devices_code_unique on public.devices (code);

-- Enforce 6-char alphanumeric CODE format (uppercase A-Z0-9)
do $$ begin
  alter table public.devices drop constraint if exists devices_code_format_check;
  exception when undefined_table then null; end $$;

alter table public.devices
  add constraint devices_code_format_check
  check (code ~ '^[A-Z0-9]{6}$');

-- Keep updated_at fresh on updates
drop trigger if exists set_devices_updated_at on public.devices;
create trigger set_devices_updated_at
  before update on public.devices
  for each row execute function public.set_updated_at();

-- Normalize devices.code to uppercase/trim before write
create or replace function public.devices_code_uppercase_before_write()
returns trigger
language plpgsql
as $$
begin
  if new.code is not null then
    new.code := upper(trim(new.code));
  end if;
  return new;
end;
$$;

drop trigger if exists devices_code_uppercase_before_write_trg on public.devices;
create trigger devices_code_uppercase_before_write_trg
  before insert or update of code on public.devices
  for each row execute function public.devices_code_uppercase_before_write();

-- RLS for devices: authenticated can read; only admins can write
alter table public.devices enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'devices_select_auth' and tablename = 'devices') then
    create policy "devices_select_auth" on public.devices
      for select to authenticated using (true);
  end if;

  if not exists (select 1 from pg_policies where policyname = 'devices_insert_admin' and tablename = 'devices') then
    create policy "devices_insert_admin" on public.devices
      for insert to authenticated
      with check (public.is_admin());
  end if;

  if not exists (select 1 from pg_policies where policyname = 'devices_update_admin' and tablename = 'devices') then
    create policy "devices_update_admin" on public.devices
      for update to authenticated
      using (public.is_admin())
      with check (public.is_admin());
  end if;

  if not exists (select 1 from pg_policies where policyname = 'devices_delete_admin' and tablename = 'devices') then
    create policy "devices_delete_admin" on public.devices
      for delete to authenticated
      using (public.is_admin());
  end if;
end $$;

-- ==============================
-- Screens: pairing columns and FK to devices
-- ==============================

-- Add columns (idempotent)
do $$ begin
  alter table public.screens add column if not exists pairing_code text;
exception when undefined_table then null; end $$;

do $$ begin
  alter table public.screens add column if not exists paired_at timestamptz;
exception when undefined_table then null; end $$;

do $$ begin
  alter table public.screens add column if not exists device_id uuid;
exception when undefined_table then null; end $$;

-- Unique pairing_code when present (allow multiple NULLs)
create unique index if not exists idx_screens_pairing_code_unique
  on public.screens (pairing_code)
  where pairing_code is not null;

-- Enforce pairing_code format when present (6-char alphanumeric, uppercase)
do $$ begin
  alter table public.screens drop constraint if exists screens_pairing_code_format_check;
  exception when undefined_table then null; end $$;

alter table public.screens
  add constraint screens_pairing_code_format_check
  check (pairing_code is null or pairing_code ~ '^[A-Z0-9]{6}$');

-- Add/ensure FK to devices
do $$
begin
  -- Drop and recreate to be idempotent/safe
  begin
    alter table public.screens drop constraint if exists screens_device_id_fkey;
  exception when undefined_table then null; end;

  begin
    alter table public.screens
      add constraint screens_device_id_fkey
      foreign key (device_id) references public.devices(id) on delete set null;
  exception when duplicate_object then null; when undefined_table then null; end;
end $$;

-- Helpful index for lookups by device
create index if not exists idx_screens_device_id on public.screens (device_id);

-- ==============================
-- Pairing helpers (optional, used by CMS)
-- ==============================

-- Pair a device (by code) to an existing screen the caller owns (or is admin)
create or replace function public.pair_device_by_code(p_code text, p_screen_id uuid)
returns uuid
security definer
set search_path = public
language plpgsql
as $$
declare
  v_code text;
  v_device_id uuid;
  v_paired boolean;
  v_owner uuid;
begin
  v_code := upper(trim(p_code));
  if v_code is null or length(v_code) < 1 then
    raise exception 'Pairing code is required';
  end if;

  select d.id, coalesce(d.paired, false)
  into v_device_id, v_paired
  from public.devices d
  where d.code = v_code;

  if v_device_id is null then
    raise exception 'Device with code % not found', v_code;
  end if;
  if v_paired then
    raise exception 'Device with code % is already paired', v_code;
  end if;

  -- Ensure screen exists and is owned by caller or caller is admin
  select s.created_by into v_owner from public.screens s where s.id = p_screen_id;
  if v_owner is null then
    raise exception 'Screen % not found', p_screen_id;
  end if;
  if not (v_owner = auth.uid() or public.is_admin()) then
    raise exception 'Not authorized to pair to this screen';
  end if;

  -- Ensure screen not already paired
  if exists (select 1 from public.screens s where s.id = p_screen_id and s.device_id is not null) then
    raise exception 'Screen is already paired to a device';
  end if;

  -- Perform updates
  update public.screens
     set device_id = v_device_id,
         pairing_code = v_code,
         paired_at = now()
   where id = p_screen_id;

  update public.devices
     set paired = true
   where id = v_device_id;

  return v_device_id;
end;
$$;

-- Unpair a device from a screen the caller owns (or is admin)
create or replace function public.unpair_device_from_screen(p_screen_id uuid)
returns uuid
security definer
set search_path = public
language plpgsql
as $$
declare
  v_owner uuid;
  v_device_id uuid;
begin
  select s.created_by, s.device_id into v_owner, v_device_id
  from public.screens s where s.id = p_screen_id;

  if v_owner is null then
    raise exception 'Screen % not found', p_screen_id;
  end if;
  if not (v_owner = auth.uid() or public.is_admin()) then
    raise exception 'Not authorized to unpair this screen';
  end if;

  -- If no device, just clear fields
  if v_device_id is not null then
    update public.devices set paired = false where id = v_device_id;
  end if;

  update public.screens
     set device_id = null,
         pairing_code = null,
         paired_at = null
   where id = p_screen_id;

  return v_device_id;
end;
$$;

-- ==============================
-- Ticker (Financial Data Overlay)
-- ==============================

-- Stores per-user ticker configuration
create table if not exists public.ticker_configs (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  symbols text[] not null default '{}',
  refresh_interval integer not null default 60 check (refresh_interval between 10 and 3600),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ticker_configs_owner_unique unique (created_by)
);

-- Latest per-symbol quotes for each user
create table if not exists public.ticker_quotes (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  price numeric(12,4) not null,
  change numeric(12,4) not null default 0,
  change_percent numeric(6,2) not null default 0,
  currency text,
  updated_at timestamptz not null default now(),
  constraint ticker_quotes_owner_symbol_unique unique (created_by, symbol)
);

-- Optional history of quotes (keep lightweight for demo)
create table if not exists public.ticker_history (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  price numeric(12,4) not null,
  change numeric(12,4) not null default 0,
  change_percent numeric(6,2) not null default 0,
  currency text,
  captured_at timestamptz not null default now()
);

-- Keep updated_at fresh on updates
drop trigger if exists set_ticker_configs_updated_at on public.ticker_configs;
create trigger set_ticker_configs_updated_at
  before update on public.ticker_configs
  for each row execute function public.set_updated_at();

drop trigger if exists set_ticker_quotes_updated_at on public.ticker_quotes;
create trigger set_ticker_quotes_updated_at
  before update on public.ticker_quotes
  for each row execute function public.set_updated_at();

-- Helpful indexes
create index if not exists idx_ticker_configs_owner on public.ticker_configs (created_by);
create index if not exists idx_ticker_quotes_owner_symbol on public.ticker_quotes (created_by, symbol);
create index if not exists idx_ticker_history_owner_symbol_time on public.ticker_history (created_by, symbol, captured_at desc);

-- Data integrity constraints and improved indexes
-- Ensure no empty symbols in ticker_configs.symbols
alter table public.ticker_configs
drop constraint if exists ticker_symbols_not_empty;

alter table public.ticker_configs
add constraint ticker_symbols_not_empty
check (
  symbols is null
  or (array_position(symbols, '') is null and array_position(symbols, null) is null)
);

-- Reinforce ON DELETE CASCADE on created_by FKs
alter table public.ticker_configs
drop constraint if exists ticker_configs_created_by_fkey,
add constraint ticker_configs_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete cascade;
alter table public.ticker_quotes
drop constraint if exists ticker_quotes_created_by_fkey,
add constraint ticker_quotes_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete cascade;
alter table public.ticker_history
drop constraint if exists ticker_history_created_by_fkey,
add constraint ticker_history_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete cascade;

-- Partial indexes for common queries
create index if not exists idx_ticker_configs_enabled
  on public.ticker_configs (created_by)
  where enabled = true;
create index if not exists idx_ticker_history_recent
  on public.ticker_history (created_by, symbol, captured_at desc);

-- RLS policies
alter table public.ticker_configs enable row level security;
alter table public.ticker_quotes enable row level security;
alter table public.ticker_history enable row level security;

-- ticker_configs: owner can select/insert/update/delete; admins can read all
-- (Policies are created conditionally to be idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'ticker_configs_select_owner_or_admin' AND tablename = 'ticker_configs'
  ) THEN
    CREATE POLICY "ticker_configs_select_owner_or_admin" ON public.ticker_configs
      FOR SELECT USING (
        created_by = auth.uid() OR public.is_admin()
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'ticker_configs_insert_owner' AND tablename = 'ticker_configs'
  ) THEN
    CREATE POLICY "ticker_configs_insert_owner" ON public.ticker_configs
      FOR INSERT TO authenticated
      WITH CHECK (created_by = auth.uid() OR public.is_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'ticker_configs_update_owner' AND tablename = 'ticker_configs'
  ) THEN
    CREATE POLICY "ticker_configs_update_owner" ON public.ticker_configs
      FOR UPDATE TO authenticated
      USING (created_by = auth.uid() OR public.is_admin())
      WITH CHECK (created_by = auth.uid() OR public.is_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'ticker_configs_delete_owner' AND tablename = 'ticker_configs'
  ) THEN
    CREATE POLICY "ticker_configs_delete_owner" ON public.ticker_configs
      FOR DELETE TO authenticated
      USING (created_by = auth.uid() OR public.is_admin());
  END IF;
END $$;

-- ticker_quotes: owner or admin
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'ticker_quotes_select_owner_or_admin' AND tablename = 'ticker_quotes'
  ) THEN
    CREATE POLICY "ticker_quotes_select_owner_or_admin" ON public.ticker_quotes
      FOR SELECT USING (
        created_by = auth.uid() OR public.is_admin()
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'ticker_quotes_upsert_owner' AND tablename = 'ticker_quotes'
  ) THEN
    CREATE POLICY "ticker_quotes_upsert_owner" ON public.ticker_quotes
      FOR INSERT TO authenticated
      WITH CHECK (created_by = auth.uid() OR public.is_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'ticker_quotes_update_owner' AND tablename = 'ticker_quotes'
  ) THEN
    CREATE POLICY "ticker_quotes_update_owner" ON public.ticker_quotes
      FOR UPDATE TO authenticated
      USING (created_by = auth.uid() OR public.is_admin())
      WITH CHECK (created_by = auth.uid() OR public.is_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'ticker_quotes_delete_owner' AND tablename = 'ticker_quotes'
  ) THEN
    CREATE POLICY "ticker_quotes_delete_owner" ON public.ticker_quotes
      FOR DELETE TO authenticated
      USING (created_by = auth.uid() OR public.is_admin());
  END IF;
END $$;

-- ticker_history: owner or admin read; owner insert
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'ticker_history_select_owner_or_admin' AND tablename = 'ticker_history'
  ) THEN
    CREATE POLICY "ticker_history_select_owner_or_admin" ON public.ticker_history
      FOR SELECT USING (
        created_by = auth.uid() OR public.is_admin()
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'ticker_history_insert_owner' AND tablename = 'ticker_history'
  ) THEN
    CREATE POLICY "ticker_history_insert_owner" ON public.ticker_history
      FOR INSERT TO authenticated
      WITH CHECK (created_by = auth.uid() OR public.is_admin());
  END IF;
END $$;

-- =====================================
-- Ticker: sanitization helpers and triggers
-- =====================================

-- Function: sanitize an array of symbols (trim, uppercase, drop empties/nulls, dedupe)
create or replace function public.ticker_sanitize_symbols(arr text[])
returns text[]
language sql
immutable
as $$
  with cleaned as (
    select upper(trim(x)) as sym
    from unnest(coalesce(arr, '{}')) as x
    where x is not null and length(trim(x)) > 0
  )
  select coalesce(array_agg(distinct sym order by sym), '{}') from cleaned;
$$;

-- Trigger fn: normalize ticker_configs.symbols before write
create or replace function public.ticker_configs_before_write()
returns trigger
language plpgsql
as $$
begin
  new.symbols := public.ticker_sanitize_symbols(new.symbols);
  return new;
end;
$$;

drop trigger if exists ticker_configs_before_write_trg on public.ticker_configs;
create trigger ticker_configs_before_write_trg
  before insert or update of symbols on public.ticker_configs
  for each row execute function public.ticker_configs_before_write();

-- Trigger fn: normalize single symbol fields on quotes/history
create or replace function public.ticker_symbol_uppercase_before_write()
returns trigger
language plpgsql
as $$
begin
  if new.symbol is not null then
    new.symbol := upper(trim(new.symbol));
  end if;
  return new;
end;
$$;

drop trigger if exists ticker_quotes_before_write_trg on public.ticker_quotes;
create trigger ticker_quotes_before_write_trg
  before insert or update of symbol on public.ticker_quotes
  for each row execute function public.ticker_symbol_uppercase_before_write();

drop trigger if exists ticker_history_before_write_trg on public.ticker_history;
create trigger ticker_history_before_write_trg
  before insert or update of symbol on public.ticker_history
  for each row execute function public.ticker_symbol_uppercase_before_write();

-- ==============================
-- Screen-level Ticker Overrides (enable/disable per screen)
-- ==============================
create table if not exists public.screen_ticker_overrides (
  id uuid primary key default gen_random_uuid(),
  screen_id uuid not null references public.screens(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  -- null = inherit from playlist/user; true/false = override
  enabled boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint screen_ticker_overrides_unique unique (screen_id)
);

drop trigger if exists set_screen_ticker_overrides_updated_at on public.screen_ticker_overrides;
create trigger set_screen_ticker_overrides_updated_at
  before update on public.screen_ticker_overrides
  for each row execute function public.set_updated_at();

create index if not exists idx_screen_ticker_overrides_screen on public.screen_ticker_overrides (screen_id);
create index if not exists idx_screen_ticker_overrides_owner on public.screen_ticker_overrides (created_by);

alter table public.screen_ticker_overrides enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where policyname = 'screen_ticker_overrides_select_owner_or_admin' and tablename = 'screen_ticker_overrides'
  ) then
    create policy "screen_ticker_overrides_select_owner_or_admin" on public.screen_ticker_overrides
      for select using (
        exists (
          select 1 from public.screens s
          where s.id = screen_id and (s.created_by = auth.uid() or public.is_admin())
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies where policyname = 'screen_ticker_overrides_upsert_owner_or_admin' and tablename = 'screen_ticker_overrides'
  ) then
    create policy "screen_ticker_overrides_upsert_owner_or_admin" on public.screen_ticker_overrides
      for insert to authenticated
      with check (
        exists (
          select 1 from public.screens s
          where s.id = screen_id and (s.created_by = auth.uid() or public.is_admin())
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies where policyname = 'screen_ticker_overrides_update_owner_or_admin' and tablename = 'screen_ticker_overrides'
  ) then
    create policy "screen_ticker_overrides_update_owner_or_admin" on public.screen_ticker_overrides
      for update to authenticated
      using (
        exists (
          select 1 from public.screens s
          where s.id = screen_id and (s.created_by = auth.uid() or public.is_admin())
        )
      )
      with check (
        exists (
          select 1 from public.screens s
          where s.id = screen_id and (s.created_by = auth.uid() or public.is_admin())
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies where policyname = 'screen_ticker_overrides_delete_owner_or_admin' and tablename = 'screen_ticker_overrides'
  ) then
    create policy "screen_ticker_overrides_delete_owner_or_admin" on public.screen_ticker_overrides
      for delete to authenticated
      using (
        exists (
          select 1 from public.screens s
          where s.id = screen_id and (s.created_by = auth.uid() or public.is_admin())
        )
      );
  end if;
end $$;