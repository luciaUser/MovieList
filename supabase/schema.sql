-- MovieByLucia, Teil 2 (A14–A16).
-- Im SQL-Editor eines leeren Projekts in einem Durchgang ausführen.
-- Mehrfach ausführbar: vorhandene Objekte werden ersetzt, nicht gedoppelt.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  display_name text,
  is_private boolean not null default false,
  top_films text[] not null default '{}',
  pinned_people jsonb not null default '{"actors":[],"directors":[]}'::jsonb,
  avatar jsonb,
  taste jsonb,
  taste_hidden boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.follows (
  follower uuid not null references public.profiles (id) on delete cascade,
  followee uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  primary key (follower, followee)
);

create table if not exists public.films (
  id text primary key,
  imdb_id text,
  title text not null,
  original_title text,
  year text,
  kind text,
  poster text,
  tmdb_rating numeric,
  tmdb_votes integer,
  facets jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.entries (
  user_id uuid not null references public.profiles (id) on delete cascade,
  film_id text not null references public.films (id) on delete cascade,
  rating numeric,
  watched boolean not null default false,
  favorite boolean not null default false,
  next boolean not null default false,
  in_archive boolean not null default true,
  hidden boolean not null default false,
  facet_overrides jsonb,
  pos_x double precision,
  pos_y double precision,
  updated_at timestamptz not null default now(),
  primary key (user_id, film_id)
);

create table if not exists public.notes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  film_id text not null,
  memo text not null default '',
  updated_at timestamptz not null default now(),
  primary key (user_id, film_id)
);

create table if not exists public.wishlists (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.wishlist_members (
  wishlist_id uuid not null references public.wishlists (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'editor',
  added_at timestamptz not null default now(),
  primary key (wishlist_id, user_id)
);

create table if not exists public.wishlist_items (
  id uuid primary key default gen_random_uuid(),
  wishlist_id uuid not null references public.wishlists (id) on delete cascade,
  film_id text not null references public.films (id) on delete cascade,
  added_by uuid references public.profiles (id) on delete set null,
  note text,
  status text not null default 'offen',
  created_at timestamptz not null default now()
);

create table if not exists public.wishlist_votes (
  item_id uuid not null references public.wishlist_items (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (item_id, user_id)
);

create table if not exists public.recovery_emails (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  verified boolean not null default false,
  token_hash text,
  token_expires timestamptz,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Constraints (beim zweiten Lauf erst entfernen, dann neu anlegen)
-- ---------------------------------------------------------------------------

alter table public.films add column if not exists release_date date;
alter table public.films add column if not exists status text;
alter table public.films add column if not exists checked_at timestamptz;

alter table public.profiles add column if not exists avatar jsonb;
alter table public.profiles add column if not exists taste jsonb;
alter table public.profiles add column if not exists taste_hidden boolean not null default false;
alter table public.profiles add column if not exists language text not null default 'en';

alter table public.wishlists add column if not exists color text;
alter table public.wishlists drop constraint if exists wishlists_color_hex;
alter table public.wishlists add constraint wishlists_color_hex
  check (color is null or color ~ '^#[0-9A-Fa-f]{6}$');

alter table public.profiles drop constraint if exists profiles_username_shape;
alter table public.profiles add constraint profiles_username_shape
  check (username ~ '^[a-z0-9_]{3,20}$');

alter table public.profiles drop constraint if exists profiles_username_key;
alter table public.profiles add constraint profiles_username_key unique (username);

alter table public.profiles drop constraint if exists profiles_top_films_limit;
alter table public.profiles add constraint profiles_top_films_limit
  check (cardinality(top_films) <= 5);

alter table public.profiles drop constraint if exists profiles_pinned_people_shape;
alter table public.profiles add constraint profiles_pinned_people_shape
  check (
    jsonb_typeof(coalesce(pinned_people -> 'actors', '[]'::jsonb)) = 'array'
    and jsonb_typeof(coalesce(pinned_people -> 'directors', '[]'::jsonb)) = 'array'
    and jsonb_array_length(coalesce(pinned_people -> 'actors', '[]'::jsonb)) <= 5
    and jsonb_array_length(coalesce(pinned_people -> 'directors', '[]'::jsonb)) <= 5
  );

alter table public.follows drop constraint if exists follows_not_self;
alter table public.follows add constraint follows_not_self check (follower <> followee);

alter table public.follows drop constraint if exists follows_status;
alter table public.follows add constraint follows_status check (status in ('pending', 'accepted'));

alter table public.entries drop constraint if exists entries_rating_range;
alter table public.entries add constraint entries_rating_range
  check (rating is null or (rating >= 0 and rating <= 10));

alter table public.wishlist_members add column if not exists status text;
update public.wishlist_members set status = 'accepted' where status is null;
alter table public.wishlist_members alter column status set default 'accepted';
alter table public.wishlist_members alter column status set not null;

alter table public.wishlist_members drop constraint if exists wishlist_members_role;
alter table public.wishlist_members add constraint wishlist_members_role
  check (role in ('owner', 'editor'));

alter table public.wishlist_members drop constraint if exists wishlist_members_status;
alter table public.wishlist_members add constraint wishlist_members_status
  check (status in ('invited', 'accepted'));

alter table public.wishlist_items drop constraint if exists wishlist_items_status;
alter table public.wishlist_items add constraint wishlist_items_status
  check (status in ('offen', 'geschaut'));

alter table public.wishlist_items drop constraint if exists wishlist_items_film_key;
alter table public.wishlist_items add constraint wishlist_items_film_key
  unique (wishlist_id, film_id);

create index if not exists follows_followee_status_idx on public.follows (followee, status);
create index if not exists follows_follower_status_idx on public.follows (follower, status);
create index if not exists entries_user_idx on public.entries (user_id);
create index if not exists entries_film_idx on public.entries (film_id);
create index if not exists notes_user_idx on public.notes (user_id);
create index if not exists films_imdb_idx on public.films (imdb_id);
create index if not exists wishlist_members_user_idx on public.wishlist_members (user_id);
create index if not exists wishlist_items_list_idx on public.wishlist_items (wishlist_id);
create index if not exists wishlist_votes_user_idx on public.wishlist_votes (user_id);
create index if not exists recovery_emails_token_idx on public.recovery_emails (token_hash);

-- ---------------------------------------------------------------------------
-- Hilfsfunktionen
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.can_view(viewer uuid, owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select viewer is not null and (
    viewer = owner
    or exists (
      select 1 from public.follows
      where follower = viewer and followee = owner and status = 'accepted'
    )
  );
$$;

create or replace function public.mutual(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select a is not null and b is not null and a <> b
    and public.can_view(a, b)
    and public.can_view(b, a);
$$;

create or replace function public.is_wishlist_member(wl uuid, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.wishlist_members
    where wishlist_id = wl and user_id = uid and status = 'accepted'
  );
$$;

create or replace function public.is_wishlist_invited(wl uuid, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.wishlist_members
    where wishlist_id = wl and user_id = uid and status = 'invited'
  );
$$;

create or replace function public.is_wishlist_owner(wl uuid, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.wishlist_members
    where wishlist_id = wl and user_id = uid and role = 'owner' and status = 'accepted'
  );
$$;

create or replace function public.wishlist_film_counts(ids uuid[])
returns table (wishlist_id uuid, films integer)
language sql
stable
security definer
set search_path = public
as $$
  select w.id, count(i.id)::integer
  from public.wishlists w
  left join public.wishlist_items i on i.wishlist_id = w.id
  where w.id = any(coalesce(ids, array[]::uuid[]))
    and (
      public.is_wishlist_member(w.id, auth.uid())
      or public.is_wishlist_invited(w.id, auth.uid())
    )
  group by w.id;
$$;

create or replace function public.accept_wishlist(list uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  update public.wishlist_members
  set status = 'accepted'
  where wishlist_id = list
    and user_id = auth.uid()
    and status = 'invited';
  if not found then
    raise exception 'no invitation';
  end if;
end;
$$;

create or replace function public.leave_or_delete_wishlist(list uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  accepted_count integer;
  my_role text;
  next_owner uuid;
begin
  if me is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_wishlist_member(list, me) then
    raise exception 'not a member';
  end if;
  select count(*) into accepted_count
  from public.wishlist_members
  where wishlist_id = list and status = 'accepted';
  if accepted_count <= 1 then
    delete from public.wishlists where id = list;
    return;
  end if;
  select role into my_role
  from public.wishlist_members
  where wishlist_id = list and user_id = me;
  if my_role = 'owner' then
    select user_id into next_owner
    from public.wishlist_members
    where wishlist_id = list
      and status = 'accepted'
      and user_id <> me
    order by added_at asc, user_id asc
    limit 1;
    if next_owner is not null then
      update public.wishlist_members
      set role = 'owner'
      where wishlist_id = list and user_id = next_owner;
      update public.wishlists
      set created_by = next_owner
      where id = list;
    end if;
  end if;
  delete from public.wishlist_members
  where wishlist_id = list and user_id = me;
end;
$$;

drop function if exists public.profile_stats(uuid);
create function public.profile_stats(target uuid)
returns table (films integer, friends integer)
language sql
stable
security definer
set search_path = public
as $$
  select
    (
      select count(*)::integer from public.entries
      where user_id = target and in_archive and not hidden
    ),
    (
      select count(*)::integer
      from public.follows f
      where f.follower = target
        and f.status = 'accepted'
        and exists (
          select 1 from public.follows b
          where b.follower = f.followee
            and b.followee = f.follower
            and b.status = 'accepted'
        )
    );
$$;

-- top_films und pinned_people sind über die Tabelle nicht lesbar.
-- Diese Funktion gibt sie nur zurück, wenn can_view gilt (auch für einen selbst).
create or replace function public.profile_sensitive(target uuid)
returns table (top_films text[], pinned_people jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select p.top_films, p.pinned_people
  from public.profiles p
  where p.id = target and public.can_view(auth.uid(), p.id);
$$;

-- Kopf eines fremden Profils: Top 5 aus den Wertungen, nur für Freunde.
-- Gibt keine Wertungsliste und keine Notizen zurück.
create or replace function public.profile_head(target uuid)
returns table (top_films text[], pinned_people jsonb)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  pins jsonb;
begin
  select p.pinned_people
  into pins
  from public.profiles p
  where p.id = target
    and auth.uid() is not null
    and public.can_view(auth.uid(), p.id);
  if not found then
    return;
  end if;
  select coalesce(array_agg(s.film_id order by s.rating desc, s.updated_at desc), '{}')
  into top_films
  from (
    select e.film_id, e.rating, e.updated_at
    from public.entries e
    where e.user_id = target
      and e.in_archive
      and not e.hidden
      and e.rating is not null
      and e.rating > 0
    order by e.rating desc, e.updated_at desc
    limit 5
  ) s;
  pinned_people := coalesce(pins, '{"actors":[],"directors":[]}'::jsonb);
  return next;
end;
$$;

create or replace function public.accept_friend(requester uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null or requester is null or requester = me then
    raise exception 'ungueltig';
  end if;
  if not exists (
    select 1 from public.follows
    where follower = requester and followee = me and status = 'pending'
  ) then
    raise exception 'keine anfrage';
  end if;
  update public.follows
  set status = 'accepted'
  where follower = requester and followee = me;
  insert into public.follows (follower, followee, status)
  values (me, requester, 'pending')
  on conflict (follower, followee) do nothing;
  update public.follows
  set status = 'accepted'
  where follower = me and followee = requester;
end;
$$;

create or replace function public.remove_friend(other uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null or other is null or other = me then
    raise exception 'ungueltig';
  end if;
  delete from public.follows
  where (follower = me and followee = other)
     or (follower = other and followee = me);
end;
$$;

-- Sucht öffentliche Profilfelder. Schließt einen selbst aus, höchstens 10 Treffer.
drop function if exists public.search_profiles(text);
create function public.search_profiles(query text)
returns table (
  id uuid,
  username text,
  display_name text,
  is_private boolean,
  avatar jsonb,
  taste_hidden boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.username,
    p.display_name,
    p.is_private,
    p.avatar,
    p.taste_hidden
  from public.profiles p
  where auth.uid() is not null
    and p.id <> auth.uid()
    and char_length(btrim(coalesce(query, ''))) >= 2
    and (
      position(lower(btrim(query)) in p.username) > 0
      or position(lower(btrim(query)) in lower(coalesce(p.display_name, ''))) > 0
    )
  order by (p.username = lower(btrim(query))) desc, p.username
  limit 10;
$$;

create or replace function public.clear_taste()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'nicht angemeldet';
  end if;
  update public.profiles
  set taste = null
  where id = auth.uid();
end;
$$;

create or replace function public.profile_taste(uid uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is null then null
    when uid = auth.uid() then p.taste
    when coalesce(p.taste_hidden, false) then null
    when public.can_view(auth.uid(), uid) then p.taste
    else null
  end
  from public.profiles p
  where p.id = uid;
$$;

create or replace function public.username_available(name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select name ~ '^[a-z0-9_]{3,20}$'
    and not exists (select 1 from public.profiles where username = name);
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uname text;
begin
  uname := lower(btrim(coalesce(
    new.raw_user_meta_data ->> 'username',
    split_part(new.email, '@', 1)
  )));
  insert into public.profiles (id, username, display_name)
  values (new.id, uname, uname)
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.set_follow_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.status := 'pending';
  return new;
end;
$$;

create or replace function public.add_wishlist_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.wishlist_members (wishlist_id, user_id, role, status)
  values (new.id, new.created_by, 'owner', 'accepted')
  on conflict (wishlist_id, user_id) do nothing;
  return new;
end;
$$;

create or replace function public.wishlist_member_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'owner' then
    new.status := 'accepted';
  else
    new.status := 'invited';
  end if;
  return new;
end;
$$;

drop trigger if exists wishlist_members_status on public.wishlist_members;
create trigger wishlist_members_status
  before insert on public.wishlist_members
  for each row execute function public.wishlist_member_status();

create or replace function public.protect_recovery_email()
returns trigger
language plpgsql
as $$
begin
  if current_user = 'authenticated' then
    new.verified := false;
    new.token_hash := null;
    new.token_expires := null;
  end if;
  return new;
end;
$$;

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'nicht angemeldet';
  end if;
  delete from public.wishlist_votes where user_id = uid;
  delete from public.wishlist_members where user_id = uid;
  delete from public.wishlists where created_by = uid;
  delete from public.notes where user_id = uid;
  delete from public.entries where user_id = uid;
  delete from public.follows where follower = uid or followee = uid;
  delete from public.recovery_emails where user_id = uid;
  delete from public.profiles where id = uid;
  delete from auth.users where id = uid;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

drop trigger if exists follows_set_status on public.follows;
create trigger follows_set_status
  before insert on public.follows
  for each row execute function public.set_follow_status();

-- Einseitige akzeptierte Folgen werden zu Freundschaften. Offene Anfragen bleiben.
insert into public.follows (follower, followee, status)
select f.followee, f.follower, 'pending'
from public.follows f
where f.status = 'accepted'
  and not exists (
    select 1 from public.follows b
    where b.follower = f.followee and b.followee = f.follower
  );

update public.follows as back
set status = 'accepted'
from public.follows as forward
where forward.status = 'accepted'
  and back.follower = forward.followee
  and back.followee = forward.follower
  and back.status is distinct from 'accepted';

drop trigger if exists wishlists_add_owner on public.wishlists;
create trigger wishlists_add_owner
  after insert on public.wishlists
  for each row execute function public.add_wishlist_owner();

drop trigger if exists films_touch on public.films;
create trigger films_touch
  before update on public.films
  for each row execute function public.touch_updated_at();

drop trigger if exists entries_touch on public.entries;
create trigger entries_touch
  before update on public.entries
  for each row execute function public.touch_updated_at();

drop trigger if exists notes_touch on public.notes;
create trigger notes_touch
  before update on public.notes
  for each row execute function public.touch_updated_at();

drop trigger if exists recovery_emails_touch on public.recovery_emails;
create trigger recovery_emails_touch
  before update on public.recovery_emails
  for each row execute function public.touch_updated_at();

drop trigger if exists recovery_emails_protect on public.recovery_emails;
create trigger recovery_emails_protect
  before insert or update on public.recovery_emails
  for each row execute function public.protect_recovery_email();

-- ---------------------------------------------------------------------------
-- Rechte
-- ---------------------------------------------------------------------------

revoke all on public.profiles from public, anon, authenticated;
revoke all on public.follows from public, anon, authenticated;
revoke all on public.films from public, anon, authenticated;
revoke all on public.entries from public, anon, authenticated;
revoke all on public.notes from public, anon, authenticated;
revoke all on public.wishlists from public, anon, authenticated;
revoke all on public.wishlist_members from public, anon, authenticated;
revoke all on public.wishlist_items from public, anon, authenticated;
revoke all on public.wishlist_votes from public, anon, authenticated;
revoke all on public.recovery_emails from public, anon, authenticated;

grant usage on schema public to anon, authenticated;

-- Der Server (api/*.js) arbeitet mit dem Service-Role-Key. Neue Supabase-Projekte
-- vergeben dieser Rolle nicht mehr automatisch Rechte auf neue Tabellen.
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

grant select (id, username, display_name, is_private, created_at, avatar, taste_hidden, language) on public.profiles to authenticated;
revoke select (taste) on public.profiles from authenticated;
grant update (display_name, is_private, top_films, pinned_people, avatar, taste_hidden, language) on public.profiles to authenticated;

grant select, insert, update, delete on public.follows to authenticated;
grant select, insert, update on public.films to authenticated;
grant delete on public.films to authenticated;
grant select, insert, update, delete on public.entries to authenticated;
grant select, insert, update, delete on public.notes to authenticated;
grant select, insert, update, delete on public.wishlists to authenticated;
revoke update on public.wishlists from authenticated;
grant update (title, color) on public.wishlists to authenticated;
grant select, insert, update, delete on public.wishlist_members to authenticated;
grant select, insert, update, delete on public.wishlist_items to authenticated;
grant select, insert, delete on public.wishlist_votes to authenticated;
grant select, insert, update, delete on public.recovery_emails to authenticated;

revoke all on function public.can_view(uuid, uuid) from public;
revoke all on function public.mutual(uuid, uuid) from public;
revoke all on function public.is_wishlist_member(uuid, uuid) from public;
revoke all on function public.is_wishlist_owner(uuid, uuid) from public;
revoke all on function public.profile_stats(uuid) from public;
revoke all on function public.profile_sensitive(uuid) from public;
revoke all on function public.profile_head(uuid) from public;
revoke all on function public.search_profiles(text) from public;
revoke all on function public.clear_taste() from public;
revoke all on function public.profile_taste(uuid) from public;
revoke all on function public.username_available(text) from public;
revoke all on function public.delete_my_account() from public;
revoke all on function public.accept_friend(uuid) from public;
revoke all on function public.remove_friend(uuid) from public;
revoke all on function public.is_wishlist_invited(uuid, uuid) from public;
revoke all on function public.wishlist_film_counts(uuid[]) from public;
revoke all on function public.accept_wishlist(uuid) from public;
revoke all on function public.leave_or_delete_wishlist(uuid) from public;

grant execute on function public.can_view(uuid, uuid) to authenticated;
grant execute on function public.mutual(uuid, uuid) to authenticated;
grant execute on function public.is_wishlist_member(uuid, uuid) to authenticated;
grant execute on function public.is_wishlist_owner(uuid, uuid) to authenticated;
grant execute on function public.profile_stats(uuid) to authenticated;
grant execute on function public.profile_sensitive(uuid) to authenticated;
grant execute on function public.profile_head(uuid) to authenticated;
grant execute on function public.search_profiles(text) to authenticated;
grant execute on function public.clear_taste() to authenticated;
grant execute on function public.profile_taste(uuid) to authenticated;
grant execute on function public.username_available(text) to anon, authenticated;
grant execute on function public.delete_my_account() to authenticated;
grant execute on function public.accept_friend(uuid) to authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;
grant execute on function public.is_wishlist_invited(uuid, uuid) to authenticated;
grant execute on function public.wishlist_film_counts(uuid[]) to authenticated;
grant execute on function public.accept_wishlist(uuid) to authenticated;
grant execute on function public.leave_or_delete_wishlist(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.follows enable row level security;
alter table public.films enable row level security;
alter table public.entries enable row level security;
alter table public.notes enable row level security;
alter table public.wishlists enable row level security;
alter table public.wishlist_members enable row level security;
alter table public.wishlist_items enable row level security;
alter table public.wishlist_votes enable row level security;
alter table public.recovery_emails enable row level security;

alter table public.profiles force row level security;
alter table public.follows force row level security;
alter table public.films force row level security;
alter table public.entries force row level security;
alter table public.notes force row level security;
alter table public.wishlists force row level security;
alter table public.wishlist_members force row level security;
alter table public.wishlist_items force row level security;
alter table public.wishlist_votes force row level security;
alter table public.recovery_emails force row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (true);

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists follows_select on public.follows;
create policy follows_select on public.follows
  for select to authenticated
  using (
    auth.uid() is not null
    and (
      status = 'accepted'
      or auth.uid() = follower
      or auth.uid() = followee
    )
  );

drop policy if exists follows_insert on public.follows;
create policy follows_insert on public.follows
  for insert to authenticated
  with check (auth.uid() = follower);

drop policy if exists follows_update on public.follows;
create policy follows_update on public.follows
  for update to authenticated
  using (auth.uid() = followee)
  with check (auth.uid() = followee);

drop policy if exists follows_delete on public.follows;
create policy follows_delete on public.follows
  for delete to authenticated
  using (auth.uid() = follower or auth.uid() = followee);

drop policy if exists entries_select on public.entries;
create policy entries_select on public.entries
  for select to authenticated
  using (public.can_view(auth.uid(), user_id));

drop policy if exists entries_insert on public.entries;
create policy entries_insert on public.entries
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists entries_update on public.entries;
create policy entries_update on public.entries
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists entries_delete on public.entries;
create policy entries_delete on public.entries
  for delete to authenticated
  using (auth.uid() = user_id);

drop policy if exists notes_all on public.notes;
create policy notes_all on public.notes
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists films_select on public.films;
create policy films_select on public.films
  for select to authenticated
  using (auth.uid() is not null);

drop policy if exists films_write on public.films;
create policy films_write on public.films
  for insert to authenticated
  with check (auth.uid() is not null);

drop policy if exists films_update on public.films;
create policy films_update on public.films
  for update to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

drop policy if exists films_delete on public.films;
create policy films_delete on public.films
  for delete to authenticated
  using (auth.uid() is not null and id like 'custom:%');

drop policy if exists wishlists_select on public.wishlists;
create policy wishlists_select on public.wishlists
  for select to authenticated
  using (
    public.is_wishlist_member(id, auth.uid())
    or public.is_wishlist_invited(id, auth.uid())
  );

drop policy if exists wishlists_insert on public.wishlists;
create policy wishlists_insert on public.wishlists
  for insert to authenticated
  with check (auth.uid() = created_by);

drop policy if exists wishlists_update on public.wishlists;
create policy wishlists_update on public.wishlists
  for update to authenticated
  using (public.is_wishlist_member(id, auth.uid()))
  with check (public.is_wishlist_member(id, auth.uid()));

drop policy if exists wishlists_delete on public.wishlists;
create policy wishlists_delete on public.wishlists
  for delete to authenticated
  using (public.is_wishlist_owner(id, auth.uid()));

drop policy if exists wishlist_members_select on public.wishlist_members;
create policy wishlist_members_select on public.wishlist_members
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_wishlist_member(wishlist_id, auth.uid())
  );

drop policy if exists wishlist_members_insert on public.wishlist_members;
create policy wishlist_members_insert on public.wishlist_members
  for insert to authenticated
  with check (
    public.is_wishlist_owner(wishlist_id, auth.uid())
    and public.mutual(auth.uid(), user_id)
  );

drop policy if exists wishlist_members_delete on public.wishlist_members;
create policy wishlist_members_delete on public.wishlist_members
  for delete to authenticated
  using (
    auth.uid() = user_id
    or public.is_wishlist_owner(wishlist_id, auth.uid())
  );

drop policy if exists wishlist_items_select on public.wishlist_items;
create policy wishlist_items_select on public.wishlist_items
  for select to authenticated
  using (public.is_wishlist_member(wishlist_id, auth.uid()));

drop policy if exists wishlist_items_insert on public.wishlist_items;
create policy wishlist_items_insert on public.wishlist_items
  for insert to authenticated
  with check (
    added_by = auth.uid()
    and public.is_wishlist_member(wishlist_id, auth.uid())
  );

drop policy if exists wishlist_items_update on public.wishlist_items;
create policy wishlist_items_update on public.wishlist_items
  for update to authenticated
  using (public.is_wishlist_member(wishlist_id, auth.uid()))
  with check (public.is_wishlist_member(wishlist_id, auth.uid()));

drop policy if exists wishlist_items_delete on public.wishlist_items;
create policy wishlist_items_delete on public.wishlist_items
  for delete to authenticated
  using (
    public.is_wishlist_owner(wishlist_id, auth.uid())
    or added_by = auth.uid()
  );

drop policy if exists wishlist_votes_select on public.wishlist_votes;
create policy wishlist_votes_select on public.wishlist_votes
  for select to authenticated
  using (
    exists (
      select 1 from public.wishlist_items i
      where i.id = wishlist_votes.item_id
        and public.is_wishlist_member(i.wishlist_id, auth.uid())
    )
  );

drop policy if exists wishlist_votes_insert on public.wishlist_votes;
create policy wishlist_votes_insert on public.wishlist_votes
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.wishlist_items i
      where i.id = item_id
        and public.is_wishlist_member(i.wishlist_id, auth.uid())
    )
  );

drop policy if exists wishlist_votes_delete on public.wishlist_votes;
create policy wishlist_votes_delete on public.wishlist_votes
  for delete to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.wishlist_items i
      where i.id = wishlist_votes.item_id
        and public.is_wishlist_member(i.wishlist_id, auth.uid())
    )
  );

drop policy if exists recovery_emails_select on public.recovery_emails;
create policy recovery_emails_select on public.recovery_emails
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists recovery_emails_insert on public.recovery_emails;
create policy recovery_emails_insert on public.recovery_emails
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists recovery_emails_update on public.recovery_emails;
create policy recovery_emails_update on public.recovery_emails
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists recovery_emails_delete on public.recovery_emails;
create policy recovery_emails_delete on public.recovery_emails
  for delete to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

do $$
declare
  name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach name in array array['wishlists', 'wishlist_items', 'wishlist_votes', 'wishlist_members', 'follows']
    loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = name
      ) then
        execute format('alter publication supabase_realtime add table public.%I', name);
      end if;
    end loop;
  end if;
end $$;
