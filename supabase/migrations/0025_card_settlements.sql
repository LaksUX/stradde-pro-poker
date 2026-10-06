-- MVP 2.0: a player's card also shows who settles with whom for each night.
-- Only the player's own transfers are returned (counterpart first name and
-- amount in banks), never anyone else's result.

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
          ), 0) as buyins,
          coalesce((
            select jsonb_agg(jsonb_build_object(
              'direction', case when st.from_player_id = gp.id then 'pay' else 'receive' end,
              'other_name', p2.full_name,
              'amount', st.amount,
              'status', st.status
            ))
            from settlement_transfers st
            join game_players gp2
              on gp2.id = case when st.from_player_id = gp.id then st.to_player_id else st.from_player_id end
            join profiles p2 on p2.id = gp2.profile_id
            where st.game_id = g.id
              and (st.from_player_id = gp.id or st.to_player_id = gp.id)
          ), '[]'::jsonb) as settlements
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

revoke execute on function get_player_card(text) from public;
grant execute on function get_player_card(text) to anon, authenticated;
