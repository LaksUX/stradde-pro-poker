-- Host invites: one reusable link per host. A friend who opens it starts their
-- own group (own players, own cards), and shows up in the inviter's
-- "Hosts you invited" list, where the inviter can pause or resume them.

create table host_invites (
  token text primary key,
  inviter_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
alter table host_invites enable row level security;

create table invited_hosts (
  host_id uuid primary key references profiles(id) on delete cascade,
  inviter_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  paused_at timestamptz
);
alter table invited_hosts enable row level security;
-- No policies on either table: only the functions below touch them.

-- The inviter's current link, created on first use. p_regenerate replaces it.
create or replace function ensure_host_invite(p_regenerate boolean default false)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_token text;
begin
  if v_uid is null or not exists (
    select 1 from profiles where id = v_uid and role in ('host', 'admin')
  ) then
    raise exception 'not allowed';
  end if;

  select token into v_token from host_invites
    where inviter_id = v_uid and revoked_at is null;

  if v_token is null or p_regenerate then
    update host_invites set revoked_at = now() where inviter_id = v_uid and revoked_at is null;
    v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
    insert into host_invites (token, inviter_id) values (v_token, v_uid);
  end if;
  return v_token;
end;
$$;

-- Public: who is inviting. Null when the link is not valid.
create or replace function get_host_invite(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'inviter', coalesce(
      (select name from host_groups where profile_id = i.inviter_id),
      (select full_name from profiles where id = i.inviter_id)
    )
  )
  from host_invites i
  where i.token = p_token and i.revoked_at is null;
$$;

-- Called by the new host once their group exists.
create or replace function claim_host_invite(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  i host_invites;
begin
  select * into i from host_invites where token = p_token and revoked_at is null;
  if not found then
    raise exception 'This invite link is no longer valid';
  end if;
  if v_uid is null or not exists (select 1 from profiles where id = v_uid and role in ('host', 'admin')) then
    raise exception 'Start your group first';
  end if;
  if i.inviter_id = v_uid then
    return;
  end if;
  insert into invited_hosts (host_id, inviter_id) values (v_uid, i.inviter_id)
  on conflict (host_id) do nothing;
end;
$$;

-- The inviter's overview of the hosts they brought in.
create or replace function my_invited_hosts()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'host_id', ih.host_id,
    'name', p.full_name,
    'group', hg.name,
    'joined_at', ih.created_at,
    'paused', ih.paused_at is not null,
    'games', (select count(*) from games g where g.host_id = ih.host_id and g.status = 'closed'),
    'players', (
      select count(distinct gp.profile_id)
      from game_players gp join games g on g.id = gp.game_id
      where g.host_id = ih.host_id and gp.is_host = false
    ),
    'last_game_at', (select max(coalesce(g.closed_at, g.scheduled_for)) from games g where g.host_id = ih.host_id)
  ) order by ih.created_at desc), '[]'::jsonb)
  from invited_hosts ih
  join profiles p on p.id = ih.host_id
  left join host_groups hg on hg.profile_id = ih.host_id
  where ih.inviter_id = auth.uid();
$$;

-- Pause or resume a host you invited. Paused hosts cannot start new games.
create or replace function set_invited_host_paused(p_host_id uuid, p_paused boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from invited_hosts where host_id = p_host_id and inviter_id = auth.uid()) then
    raise exception 'not allowed';
  end if;
  update invited_hosts
    set paused_at = case when p_paused then now() else null end
    where host_id = p_host_id;
  update profiles set approved = not p_paused where id = p_host_id and role = 'host';
end;
$$;

-- A paused host cannot un-pause themselves by starting their group again.
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
        approved = not exists (
          select 1 from invited_hosts where host_id = v_uid and paused_at is not null
        )
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

revoke execute on function ensure_host_invite(boolean) from public;
grant execute on function ensure_host_invite(boolean) to authenticated;
revoke execute on function get_host_invite(text) from public;
grant execute on function get_host_invite(text) to anon, authenticated;
revoke execute on function claim_host_invite(text) from public;
grant execute on function claim_host_invite(text) to authenticated;
revoke execute on function my_invited_hosts() from public;
grant execute on function my_invited_hosts() to authenticated;
revoke execute on function set_invited_host_paused(uuid, boolean) from public;
grant execute on function set_invited_host_paused(uuid, boolean) to authenticated;
