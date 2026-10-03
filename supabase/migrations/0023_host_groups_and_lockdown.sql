-- MVP 2.0, part 2.
--   1. Lock down public_live_roster: no per-player buy-in counts for anyone.
--   2. Host groups: a random group ID + 4-digit PIN (server-checked, locks
--      after repeated misses) so a host can get back in on a new phone.
--   3. start_hosting(): a new host no longer waits for admin approval.
--   4. Guest players: a host can add a player by name alone (no phone, no
--      account). Needs profiles.id to stop requiring an auth.users row.

-- ---------------------------------------------------------------------------
-- 1. Roster lockdown. Names only, ordered by when they sat down. Same view
--    name and anon grant, so existing screens keep working.
-- ---------------------------------------------------------------------------
drop view if exists public_live_roster;

create view public_live_roster as
  select gp.game_id, gp.profile_id, p.full_name
  from game_players gp
  join profiles p on p.id = gp.profile_id
  join games g on g.id = gp.game_id and g.status = 'live';

grant select on public_live_roster to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4 (first, since later functions insert guest profiles). Let a profile exist
-- without an auth user. Looked up by definition, not by constraint name.
-- ---------------------------------------------------------------------------
do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'f'
      and confrelid = 'auth.users'::regclass
  loop
    execute format('alter table public.profiles drop constraint %I', c.conname);
  end loop;
end $$;

alter table profiles alter column id set default gen_random_uuid();

-- Host adds a player by name alone. Returns the new profile id.
create or replace function add_guest_player(p_game_id uuid, p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := gen_random_uuid();
  v_name text := btrim(coalesce(p_name, ''));
begin
  if not is_game_host(p_game_id) then
    raise exception 'not allowed';
  end if;
  if v_name = '' or length(v_name) > 40 then
    raise exception 'name required (max 40 characters)';
  end if;
  insert into profiles (id, full_name, role, approved) values (v_id, v_name, 'player', false);
  insert into game_players (game_id, profile_id) values (p_game_id, v_id);
  return v_id;
end;
$$;

revoke execute on function add_guest_player(uuid, text) from public;
grant execute on function add_guest_player(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Host groups + PIN.
-- ---------------------------------------------------------------------------
create table host_groups (
  profile_id uuid primary key references profiles(id) on delete cascade,
  group_id text not null unique,
  name text,
  pin_hash text not null,
  failed_attempts int not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now()
);

alter table host_groups enable row level security;
-- No policies: only the functions below touch it.

create or replace function generate_group_id() returns text
language plpgsql
as $$
declare
  -- no 0/O/1/I so it is easy to read out loud
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v text;
  i int;
begin
  loop
    v := '';
    for i in 1..7 loop
      v := v || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    v := left(v, 3) || '-' || right(v, 4);
    exit when not exists (select 1 from host_groups where group_id = v);
  end loop;
  return v;
end;
$$;

-- Become a host and set up the group in one step. Safe to call again: if the
-- caller already has a group, only the name and PIN are updated.
create or replace function start_hosting(p_group_name text, p_pin text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_gid text;
begin
  if v_uid is null then
    raise exception 'not signed in';
  end if;
  if p_pin !~ '^[0-9]{4}$' then
    raise exception 'PIN must be 4 digits';
  end if;
  if not exists (select 1 from profiles where id = v_uid) then
    raise exception 'profile missing';
  end if;

  update profiles
    set role = case when role = 'admin' then role else 'host' end,
        approved = true
    where id = v_uid;

  select group_id into v_gid from host_groups where profile_id = v_uid;
  if v_gid is null then
    v_gid := generate_group_id();
    insert into host_groups (profile_id, group_id, name, pin_hash)
    values (v_uid, v_gid, nullif(btrim(p_group_name), ''), crypt(p_pin, gen_salt('bf')));
  else
    update host_groups
      set name = coalesce(nullif(btrim(p_group_name), ''), name),
          pin_hash = crypt(p_pin, gen_salt('bf')),
          failed_attempts = 0,
          locked_until = null
      where profile_id = v_uid;
  end if;
  return v_gid;
end;
$$;

-- The caller's own group ID and name (for Settings).
create or replace function get_my_group()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('group_id', group_id, 'name', name)
  from host_groups
  where profile_id = auth.uid();
$$;

-- Change the PIN while signed in.
create or replace function change_group_pin(p_pin text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_pin !~ '^[0-9]{4}$' then
    raise exception 'PIN must be 4 digits';
  end if;
  update host_groups
    set pin_hash = crypt(p_pin, gen_salt('bf')), failed_attempts = 0, locked_until = null
    where profile_id = auth.uid();
  if not found then
    raise exception 'no group';
  end if;
end;
$$;

-- Service role only (called by the group-login Edge Function). Never exposed
-- to the browser: the function does the lockout, so a wrong PIN can only be
-- tried 5 times, then the group is locked for 15 minutes.
create or replace function check_group_pin(p_group_id text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  g host_groups;
begin
  select * into g from host_groups where group_id = upper(btrim(p_group_id));
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  if g.locked_until is not null and g.locked_until > now() then
    return jsonb_build_object('ok', false, 'reason', 'locked');
  end if;
  if g.pin_hash = crypt(p_pin, g.pin_hash) then
    update host_groups set failed_attempts = 0, locked_until = null where profile_id = g.profile_id;
    return jsonb_build_object('ok', true, 'profile_id', g.profile_id);
  end if;
  update host_groups
    set failed_attempts = failed_attempts + 1,
        locked_until = case when failed_attempts + 1 >= 5 then now() + interval '15 minutes' else null end
    where profile_id = g.profile_id;
  return jsonb_build_object('ok', false, 'reason', 'invalid');
end;
$$;

revoke execute on function start_hosting(text, text) from public;
grant execute on function start_hosting(text, text) to authenticated;
revoke execute on function get_my_group() from public;
grant execute on function get_my_group() to authenticated;
revoke execute on function change_group_pin(text) from public;
grant execute on function change_group_pin(text) to authenticated;
revoke execute on function check_group_pin(text, text) from public, anon, authenticated;
grant execute on function check_group_pin(text, text) to service_role;
revoke execute on function generate_group_id() from public, anon, authenticated;

-- Player cards: label the group by its name when one is set.
create or replace function get_player_card(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c player_cards;
  result jsonb;
begin
  select * into c from player_cards where token = p_token;
  if not found then
    return null;
  end if;

  select jsonb_build_object(
    'name', (select full_name from profiles where id = c.profile_id),
    'group', coalesce(
      (select name from host_groups where profile_id = c.host_id),
      (select full_name from profiles where id = c.host_id)
    ),
    'nights', coalesce((
      select jsonb_agg(n order by n.at desc)
      from (
        select
          g.id as game_id,
          coalesce(g.closed_at, g.scheduled_for) as at,
          g.status,
          g.stake,
          g.chip_ratio,
          gp.cashout,
          coalesce((
            select sum(br.count)
            from buyin_requests br
            where br.game_player_id = gp.id and br.status = 'confirmed'
          ), 0) as buyins
        from game_players gp
        join games g on g.id = gp.game_id
        where gp.profile_id = c.profile_id
          and g.host_id = c.host_id
          and g.status in ('live', 'closed')
      ) n
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;
