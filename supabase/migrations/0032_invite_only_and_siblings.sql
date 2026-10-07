-- 1. Hosting is by invitation. start_hosting now needs a valid host invite
--    unless the caller is already a host or admin. The invite is claimed in the
--    same step, so the inviter sees the new host straight away.
-- 2. A card can list the same person's cards at other hosts, so a player who
--    plays at several places can add them all to their book.

drop function if exists start_hosting(text, text);

create or replace function start_hosting(p_group_name text, p_pin text, p_invite text default null)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_inviter uuid;
  v_gid text;
begin
  if v_uid is null then
    raise exception 'not signed in';
  end if;
  if p_pin !~ '^[0-9]{4}$' then
    raise exception 'PIN must be 4 digits';
  end if;
  select role into v_role from profiles where id = v_uid;
  if not found then
    raise exception 'profile missing';
  end if;

  if p_invite is not null then
    select inviter_id into v_inviter from host_invites where token = p_invite and revoked_at is null;
  end if;
  if v_role not in ('host', 'admin') and v_inviter is null then
    raise exception 'Hosting is by invitation. Ask a host for an invite link.';
  end if;

  update profiles
    set role = case when role = 'admin' then role else 'host' end,
        approved = not exists (
          select 1 from invited_hosts where host_id = v_uid and paused_at is not null
        )
    where id = v_uid;

  if v_inviter is not null and v_inviter <> v_uid then
    insert into invited_hosts (host_id, inviter_id) values (v_uid, v_inviter)
    on conflict (host_id) do nothing;
  end if;

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

revoke execute on function start_hosting(text, text, text) from public;
grant execute on function start_hosting(text, text, text) to authenticated;

-- The same person's other cards (never this one), by card token.
create or replace function get_card_siblings(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'token', o.token,
    'group', coalesce(hg.name, hp.full_name, 'Game night'),
    'kind', coalesce((
      select he.type from hosting_entities he
      where he.owner_profile_id = o.host_id
      order by he.created_at
      limit 1
    ), 'house')
  ) order by o.created_at), '[]'::jsonb)
  from player_cards c
  join player_cards o on o.profile_id = c.profile_id and o.id <> c.id
  left join host_groups hg on hg.profile_id = o.host_id
  left join profiles hp on hp.id = o.host_id
  where c.token = p_token;
$$;

revoke execute on function get_card_siblings(text) from public;
grant execute on function get_card_siblings(text) to anon, authenticated;
