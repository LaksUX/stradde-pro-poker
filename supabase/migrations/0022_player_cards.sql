-- MVP 2.0: permanent per-player "card" links.
--
-- One stable, unguessable link per (host, player). Opening it shows that
-- player's own nights with this host and nothing else. No table is exposed
-- to anon: the card table has RLS on and no policies, and everything goes
-- through two SECURITY DEFINER functions.

create table player_cards (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references profiles(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  token text not null unique,
  created_at timestamptz not null default now(),
  unique (host_id, profile_id)
);

alter table player_cards enable row level security;
-- Intentionally no policies.

-- Host (or co-host) gets the card token for a player in one of their games,
-- creating it on first use. p_regenerate = true replaces the token, which
-- kills the old link immediately.
create or replace function ensure_player_card(
  p_game_id uuid,
  p_profile_id uuid,
  p_regenerate boolean default false
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_host uuid;
  v_token text;
begin
  if not is_game_host(p_game_id) then
    raise exception 'not allowed';
  end if;
  select host_id into v_host from games where id = p_game_id;
  if not exists (
    select 1 from game_players where game_id = p_game_id and profile_id = p_profile_id
  ) then
    raise exception 'player is not in this game';
  end if;

  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

  insert into player_cards (host_id, profile_id, token)
  values (v_host, p_profile_id, v_token)
  on conflict (host_id, profile_id) do update
    set token = case when p_regenerate then excluded.token else player_cards.token end
  returning token into v_token;

  return v_token;
end;
$$;

-- Public read: everything a card page needs, for that one player only.
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
    'group', (select full_name from profiles where id = c.host_id),
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

revoke execute on function ensure_player_card(uuid, uuid, boolean) from public;
grant execute on function ensure_player_card(uuid, uuid, boolean) to authenticated;

revoke execute on function get_player_card(text) from public;
grant execute on function get_player_card(text) to anon, authenticated;
