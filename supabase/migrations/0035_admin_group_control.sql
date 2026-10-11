-- Admin control over groups: rename or reset the PIN of any host's group, and
-- merge one group into another. admin_hosts() now also returns the group ID.

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
        hg.group_id as group_id,
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

create or replace function admin_update_group(p_host uuid, p_name text, p_pin text default null)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not is_admin() then
    raise exception 'not allowed';
  end if;
  if not exists (select 1 from host_groups where profile_id = p_host) then
    raise exception 'That host has no group';
  end if;
  update host_groups set name = nullif(btrim(p_name), '') where profile_id = p_host;
  if p_pin is not null and p_pin <> '' then
    if p_pin !~ '^[0-9]{4}$' then
      raise exception 'PIN must be 4 digits';
    end if;
    update host_groups
      set pin_hash = crypt(p_pin, gen_salt('bf')), failed_attempts = 0, locked_until = null
      where profile_id = p_host;
  end if;
end;
$$;

-- Moves everything of group p_from into group p_into, then retires p_from.
-- Players who already have a card with p_into keep that one; their duplicate
-- card with p_from is dropped.
create or replace function admin_merge_groups(p_from uuid, p_into uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'not allowed';
  end if;
  if p_from = p_into then
    raise exception 'Pick two different groups';
  end if;
  if not exists (select 1 from profiles where id = p_from and role = 'host')
     or not exists (select 1 from profiles where id = p_into and role = 'host') then
    raise exception 'Both must be hosts';
  end if;

  update games set host_id = p_into where host_id = p_from;

  delete from player_cards pc
  where pc.host_id = p_from
    and exists (select 1 from player_cards t where t.host_id = p_into and t.profile_id = pc.profile_id);
  update player_cards set host_id = p_into where host_id = p_from;

  update invited_hosts set inviter_id = p_into where inviter_id = p_from and host_id <> p_into;
  delete from invited_hosts where inviter_id = p_from or host_id = p_from;
  update host_invites set revoked_at = now() where inviter_id = p_from and revoked_at is null;

  delete from host_groups where profile_id = p_from;
  update profiles set role = 'player', approved = false where id = p_from and role = 'host';
end;
$$;

revoke execute on function admin_hosts() from public;
grant execute on function admin_hosts() to authenticated;
revoke execute on function admin_update_group(uuid, text, text) from public;
grant execute on function admin_update_group(uuid, text, text) to authenticated;
revoke execute on function admin_merge_groups(uuid, uuid) from public;
grant execute on function admin_merge_groups(uuid, uuid) to authenticated;
