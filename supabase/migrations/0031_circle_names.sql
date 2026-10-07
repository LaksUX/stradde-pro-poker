-- Names-only suggestions across a host's circle. The circle is the hosts linked
-- by invites (the inviter, the hosts they invited, and so on). A host adding
-- players sees matching NAMES from the circle's games, and picking one attaches
-- the same person to their game instead of creating a duplicate. No results,
-- cards or host names are exposed, and a host outside any circle only ever sees
-- their own list.

create or replace function circle_hosts(p_host uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  with recursive circle(id) as (
    select p_host
    union
    select case when ih.host_id = c.id then ih.inviter_id else ih.host_id end
    from circle c
    join invited_hosts ih on ih.host_id = c.id or ih.inviter_id = c.id
  )
  select id from circle;
$$;

-- Matching names for the host of p_game_id (callable by the host or a co-host).
-- One row per distinct name: the person who has played the most.
drop function if exists circle_names(uuid, text);
create or replace function circle_names(p_game_id uuid, p_query text)
returns table (profile_id uuid, full_name text, games bigint, last_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_host uuid;
  q text := btrim(coalesce(p_query, ''));
begin
  if not is_game_host(p_game_id) then
    raise exception 'not allowed';
  end if;
  if length(q) < 2 then
    return;
  end if;
  select host_id into v_host from games where id = p_game_id;

  return query
  select d.profile_id, d.full_name, d.games, d.last_at
  from (
    select distinct on (lower(btrim(a.full_name))) a.profile_id, a.full_name, a.games, a.last_at
    from (
      select p.id as profile_id, p.full_name, count(distinct g.id) as games,
             max(coalesce(g.closed_at, g.scheduled_for)) as last_at
      from games g
      join game_players gp on gp.game_id = g.id
      join profiles p on p.id = gp.profile_id
      where g.host_id in (select circle_hosts(v_host))
        and gp.is_host = false
        and g.status in ('live', 'closed')
        and p.id <> v_host
      group by p.id, p.full_name
    ) a
    order by lower(btrim(a.full_name)), a.games desc
  ) d
  where d.full_name ilike '%' || q || '%'
  order by d.games desc, d.full_name
  limit 8;
end;
$$;

-- Seat a person from the circle in this host's game.
create or replace function add_circle_player(p_game_id uuid, p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_host uuid;
begin
  if not is_game_host(p_game_id) then
    raise exception 'not allowed';
  end if;
  select host_id into v_host from games where id = p_game_id;

  if not exists (
    select 1
    from game_players gp
    join games g on g.id = gp.game_id
    where gp.profile_id = p_profile_id
      and gp.is_host = false
      and g.host_id in (select circle_hosts(v_host))
  ) then
    raise exception 'That person is not in your circle';
  end if;

  if not exists (select 1 from game_players where game_id = p_game_id and profile_id = p_profile_id) then
    insert into game_players (game_id, profile_id) values (p_game_id, p_profile_id);
  end if;
end;
$$;

revoke execute on function circle_hosts(uuid) from public, anon, authenticated;
revoke execute on function circle_names(uuid, text) from public;
grant execute on function circle_names(uuid, text) to authenticated;
revoke execute on function add_circle_player(uuid, uuid) from public;
grant execute on function add_circle_player(uuid, uuid) to authenticated;
