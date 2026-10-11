-- Admin sees the game data at HOST level: one row per host with their totals,
-- and one row per game with its totals. No player names or per-player numbers.

create or replace function admin_hosts()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'not allowed';
  end if;
  return coalesce((
    select jsonb_agg(h order by h.last_game_at desc nulls last, h.name)
    from (
      select
        p.id as host_id,
        p.full_name as name,
        hg.name as group_name,
        p.approved,
        (ih.paused_at is not null) as paused,
        ip.full_name as invited_by,
        (select count(*) from games g where g.host_id = p.id) as games,
        (select count(*) from games g where g.host_id = p.id and g.status = 'live') as live,
        (select count(distinct gp.profile_id)
           from game_players gp join games g on g.id = gp.game_id
           where g.host_id = p.id and gp.is_host = false) as players,
        (select coalesce(sum(br.count * g.stake), 0)
           from buyin_requests br join games g on g.id = br.game_id
           where g.host_id = p.id and br.status = 'confirmed') as buyins,
        (select coalesce(sum(g.rake), 0) from games g where g.host_id = p.id and g.status = 'closed') as rake,
        (select max(coalesce(g.closed_at, g.scheduled_for)) from games g where g.host_id = p.id) as last_game_at
      from profiles p
      left join host_groups hg on hg.profile_id = p.id
      left join invited_hosts ih on ih.host_id = p.id
      left join profiles ip on ip.id = ih.inviter_id
      where p.role = 'host'
    ) h
  ), '[]'::jsonb);
end;
$$;

create or replace function admin_games()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'not allowed';
  end if;
  return coalesce((
    select jsonb_agg(x order by x.at desc)
    from (
      select
        g.id,
        g.name,
        g.status,
        g.chip_ratio,
        coalesce(g.closed_at, g.scheduled_for) as at,
        hp.full_name as host_name,
        hg.name as group_name,
        (select count(*) from game_players gp where gp.game_id = g.id and gp.is_host = false) as players,
        (select coalesce(sum(br.count * g.stake), 0)
           from buyin_requests br where br.game_id = g.id and br.status = 'confirmed') as buyins,
        (select coalesce(sum(gp.cashout), 0) from game_players gp where gp.game_id = g.id) as cashed_out,
        g.rake
      from games g
      join profiles hp on hp.id = g.host_id
      left join host_groups hg on hg.profile_id = g.host_id
    ) x
  ), '[]'::jsonb);
end;
$$;

revoke execute on function admin_hosts() from public;
grant execute on function admin_hosts() to authenticated;
revoke execute on function admin_games() from public;
grant execute on function admin_games() to authenticated;
