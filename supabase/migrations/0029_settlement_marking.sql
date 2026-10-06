-- Players mark their own settlement lines. Both sides must agree:
--   pending  -> nobody has marked it
--   marked   -> one side marked it, waiting for the other
--   settled  -> both sides marked it
--   disputed -> someone flagged it ("something's off")
-- Marking goes through mark_settlement() using the player's card link. The host
-- cannot mark a line (a trigger refuses it); editing a line resets its marks.

alter table settlement_transfers
  add column payer_marked_at timestamptz,
  add column payer_method text check (payer_method in ('in_person', 'transferred')),
  add column payee_marked_at timestamptz,
  add column payee_method text check (payee_method in ('in_person', 'transferred')),
  add column disputed_at timestamptz,
  add column disputed_by text check (disputed_by in ('payer', 'payee'));

create or replace function settlement_state(st settlement_transfers)
returns text
language sql
immutable
as $$
  select case
    when st.disputed_at is not null then 'disputed'
    when st.payer_marked_at is not null and st.payee_marked_at is not null then 'settled'
    when st.payer_marked_at is not null or st.payee_marked_at is not null then 'marked'
    else 'pending'
  end;
$$;

-- Keeps marks honest. Only mark_settlement() (which sets straddle.marking) may
-- set a mark; any direct write, including the host's, can only clear them. A
-- change to who pays whom or how much wipes the marks, and status follows them.
create or replace function guard_settlement_marks()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if current_setting('straddle.marking', true) is distinct from '1' then
      new.payer_marked_at := null; new.payer_method := null;
      new.payee_marked_at := null; new.payee_method := null;
      new.disputed_at := null; new.disputed_by := null;
    end if;
  else
    if current_setting('straddle.marking', true) is distinct from '1' then
      if new.payer_marked_at is distinct from old.payer_marked_at and new.payer_marked_at is not null then
        new.payer_marked_at := old.payer_marked_at; new.payer_method := old.payer_method;
      end if;
      if new.payee_marked_at is distinct from old.payee_marked_at and new.payee_marked_at is not null then
        new.payee_marked_at := old.payee_marked_at; new.payee_method := old.payee_method;
      end if;
      if new.disputed_at is distinct from old.disputed_at and new.disputed_at is not null then
        new.disputed_at := old.disputed_at; new.disputed_by := old.disputed_by;
      end if;
    end if;
    if (new.from_player_id, new.to_player_id, new.amount)
       is distinct from (old.from_player_id, old.to_player_id, old.amount) then
      new.payer_marked_at := null; new.payer_method := null;
      new.payee_marked_at := null; new.payee_method := null;
      new.disputed_at := null; new.disputed_by := null;
    end if;
  end if;

  new.status := case settlement_state(new)
    when 'settled' then 'confirmed'
    when 'disputed' then 'disputed'
    else 'pending'
  end;
  return new;
end;
$$;

create trigger settlement_marks_guard
  before insert or update on settlement_transfers
  for each row execute function guard_settlement_marks();

-- A player (identified by their card link) marks, un-marks or disputes a line
-- that involves them.
create or replace function mark_settlement(
  p_token text,
  p_transfer_id uuid,
  p_action text,
  p_method text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c player_cards;
  st settlement_transfers;
  v_gp uuid;
  v_role text;
begin
  select * into c from player_cards where token = p_token;
  if not found then
    raise exception 'This card link is no longer valid';
  end if;

  select * into st from settlement_transfers where id = p_transfer_id;
  if not found then
    raise exception 'That settlement line no longer exists';
  end if;

  select gp.id into v_gp
  from game_players gp
  join games g on g.id = gp.game_id
  where gp.game_id = st.game_id
    and gp.profile_id = c.profile_id
    and g.host_id = c.host_id;

  if v_gp is null then
    raise exception 'This is not your settlement';
  elsif st.from_player_id = v_gp then
    v_role := 'payer';
  elsif st.to_player_id = v_gp then
    v_role := 'payee';
  else
    raise exception 'This is not your settlement';
  end if;

  perform set_config('straddle.marking', '1', true);

  if p_action = 'mark' then
    if p_method is null or p_method not in ('in_person', 'transferred') then
      raise exception 'Choose how it was settled';
    end if;
    if v_role = 'payer' then
      update settlement_transfers
        set payer_marked_at = now(), payer_method = p_method, disputed_at = null, disputed_by = null
        where id = st.id;
    else
      update settlement_transfers
        set payee_marked_at = now(), payee_method = p_method, disputed_at = null, disputed_by = null
        where id = st.id;
    end if;
  elsif p_action = 'unmark' then
    if settlement_state(st) = 'settled' then
      raise exception 'This is already settled';
    end if;
    if v_role = 'payer' then
      update settlement_transfers set payer_marked_at = null, payer_method = null where id = st.id;
    else
      update settlement_transfers set payee_marked_at = null, payee_method = null where id = st.id;
    end if;
  elsif p_action = 'dispute' then
    update settlement_transfers set disputed_at = now(), disputed_by = v_role where id = st.id;
  else
    raise exception 'Unknown action';
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function mark_settlement(text, uuid, text, text) from public;
grant execute on function mark_settlement(text, uuid, text, text) to anon, authenticated;

-- The card now carries each line's id, state and method.
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
    'kind', coalesce((
      select he.type from hosting_entities he
      where he.owner_profile_id = c.host_id
      order by he.created_at
      limit 1
    ), 'house'),
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
              'id', st.id,
              'direction', case when st.from_player_id = gp.id then 'pay' else 'receive' end,
              'other_name', p2.full_name,
              'amount', st.amount,
              'status', st.status,
              'state', case
                when st.disputed_at is not null then 'disputed'
                when st.payer_marked_at is not null and st.payee_marked_at is not null then 'settled'
                when (st.from_player_id = gp.id and st.payer_marked_at is not null)
                  or (st.to_player_id = gp.id and st.payee_marked_at is not null) then 'marked_by_me'
                when st.payer_marked_at is not null or st.payee_marked_at is not null then 'marked_by_other'
                else 'pending'
              end,
              'method', case when st.from_player_id = gp.id
                then coalesce(st.payee_method, st.payer_method)
                else coalesce(st.payer_method, st.payee_method) end
            ) order by st.created_at)
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
