-- Admin starts a game inside any host's group. The game belongs to that host
-- (and shows in their games), and the host gets their usual player row.

create or replace function admin_create_game(p_host uuid, p_name text, p_chip_ratio text default '1:1')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not is_admin() then
    raise exception 'not allowed';
  end if;
  if not exists (select 1 from profiles where id = p_host and role = 'host') then
    raise exception 'That is not a host';
  end if;
  if btrim(coalesce(p_name, '')) = '' then
    raise exception 'Game name is required';
  end if;
  if p_chip_ratio not in ('1:1', '1:2') then
    raise exception 'Ratio must be 1:1 or 1:2';
  end if;

  insert into games (host_id, hosting_entity_id, name, stake, rake, chip_ratio, status, scheduled_for)
  values (
    p_host,
    (select id from hosting_entities where owner_profile_id = p_host order by created_at limit 1),
    btrim(p_name),
    1,
    0,
    p_chip_ratio,
    'live',
    now()
  )
  returning id into v_id;

  insert into game_players (game_id, profile_id, is_host) values (v_id, p_host, true);
  return v_id;
end;
$$;

revoke execute on function admin_create_game(uuid, text, text) from public;
grant execute on function admin_create_game(uuid, text, text) to authenticated;
