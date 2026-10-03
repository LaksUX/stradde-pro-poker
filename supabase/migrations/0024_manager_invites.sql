-- MVP 2.0: co-host links. The host taps "Invite a co-host" on a live game and
-- shares a link; whoever opens it types a name and becomes a manager of that
-- one game (no phone number, PIN or account). Managers keep using the existing
-- game_managers rules from 0021: same powers as the host for that game, minus
-- deleting it or changing its settings. The host can remove a manager or
-- replace the link at any time, and a link stops working once the game closes.

create table manager_invites (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  token text not null unique,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

alter table manager_invites enable row level security;
-- No policies: only the functions below touch it.

-- The original host gets the current invite token for a game, creating one if
-- there is none. p_replace = true revokes the current link and makes a new one.
create or replace function get_manager_invite(p_game_id uuid, p_replace boolean default false)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
begin
  if not exists (select 1 from games where id = p_game_id and host_id = auth.uid()) then
    raise exception 'only the host can invite a co-host';
  end if;

  if p_replace then
    update manager_invites set revoked_at = now()
      where game_id = p_game_id and revoked_at is null;
  end if;

  select token into v_token
    from manager_invites
    where game_id = p_game_id and revoked_at is null
    order by created_at desc
    limit 1;

  if v_token is null then
    v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
    insert into manager_invites (game_id, token) values (p_game_id, v_token);
  end if;

  return v_token;
end;
$$;

-- Whoever opens the link (signed in anonymously) becomes a manager of the game.
-- Creates a bare profile with the name they typed if they have none yet.
create or replace function claim_manager_invite(p_token text, p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_game uuid;
  v_status text;
  v_host uuid;
  v_name text := btrim(coalesce(p_name, ''));
begin
  if v_uid is null then
    raise exception 'not signed in';
  end if;

  select mi.game_id, g.status, g.host_id into v_game, v_status, v_host
    from manager_invites mi
    join games g on g.id = mi.game_id
    where mi.token = p_token and mi.revoked_at is null;

  if v_game is null then
    raise exception 'This co-host link is no longer valid';
  end if;
  if v_status = 'closed' then
    raise exception 'This game has already closed';
  end if;

  if not exists (select 1 from profiles where id = v_uid) then
    if v_name = '' or length(v_name) > 40 then
      raise exception 'name required';
    end if;
    insert into profiles (id, full_name, role, approved) values (v_uid, v_name, 'player', false);
  end if;

  if v_uid <> v_host then
    insert into game_managers (game_id, profile_id) values (v_game, v_uid)
      on conflict (game_id, profile_id) do nothing;
  end if;

  return v_game;
end;
$$;

-- Names of a game's managers (a manager may not share a game_players row with
-- the host, so profiles RLS would hide them otherwise).
create or replace function get_game_managers(p_game_id uuid)
returns table (profile_id uuid, full_name text)
language sql
stable
security definer
set search_path = public
as $$
  select gm.profile_id, p.full_name
  from game_managers gm
  join profiles p on p.id = gm.profile_id
  where gm.game_id = p_game_id
    and is_game_host(p_game_id);
$$;

revoke execute on function get_manager_invite(uuid, boolean) from public;
grant execute on function get_manager_invite(uuid, boolean) to authenticated;
revoke execute on function claim_manager_invite(text, text) from public;
grant execute on function claim_manager_invite(text, text) to authenticated;
revoke execute on function get_game_managers(uuid) from public;
grant execute on function get_game_managers(uuid) to authenticated;

-- A co-host who is not seated at the table has no game_players row, so the
-- existing "confirmed player reads their game" policy does not cover them.
-- is_game_host() already includes managers (0021), so reuse it for reads.
create policy "manager reads game" on games
  for select using (is_game_host(id));
