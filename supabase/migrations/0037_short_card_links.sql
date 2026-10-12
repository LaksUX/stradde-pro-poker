-- Friendly card links: a new or regenerated card gets a short token like
-- "mo-k7x2q9m4" (first name + 8 random characters) instead of 64 hex digits.
-- Cards that already exist keep their current link, so nothing already sent
-- stops working.

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
  v_existing text;
  v_slug text;
  v_alphabet constant text := 'abcdefghjkmnpqrstuvwxyz23456789';
  v_suffix text;
  i int;
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

  select token into v_existing from player_cards where host_id = v_host and profile_id = p_profile_id;
  if v_existing is not null and not p_regenerate then
    return v_existing;
  end if;

  select lower(regexp_replace(split_part(btrim(full_name), ' ', 1), '[^a-zA-Z0-9]', '', 'g'))
    into v_slug from profiles where id = p_profile_id;
  v_slug := left(coalesce(nullif(v_slug, ''), 'card'), 12);

  loop
    v_suffix := '';
    for i in 1..8 loop
      v_suffix := v_suffix || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    v_token := v_slug || '-' || v_suffix;
    exit when not exists (select 1 from player_cards where token = v_token);
  end loop;

  insert into player_cards (host_id, profile_id, token)
  values (v_host, p_profile_id, v_token)
  on conflict (host_id, profile_id) do update
    set token = case when p_regenerate then excluded.token else player_cards.token end
  returning token into v_token;

  return v_token;
end;
$$;

revoke execute on function ensure_player_card(uuid, uuid, boolean) from public;
grant execute on function ensure_player_card(uuid, uuid, boolean) to authenticated;
