-- MVP Club, step 1: clubs, staff roles, a verified member registry, tables with
-- an opening chip count, an append-only chip ledger and an audit log.
-- Everything here is separate from the game-night tables. Rake is never set in
-- advance: staff record the chips they collect (a "rake drop") while the table
-- runs. Chips only move between the tray, players and the rake, so closing a
-- table must reconcile to the opening count.

create table if not exists clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists club_staff (
  club_id uuid not null references clubs(id) on delete cascade,
  user_id uuid not null,
  display_name text not null,
  role text not null check (role in ('owner', 'manager', 'cashier')),
  created_at timestamptz not null default now(),
  primary key (club_id, user_id)
);

create table if not exists club_members (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id) on delete cascade,
  full_name text not null,
  phone text,
  kyc_status text not null default 'pending' check (kyc_status in ('pending', 'verified', 'blocked')),
  id_type text,
  id_last4 text check (id_last4 is null or id_last4 ~ '^[0-9A-Za-z]{1,4}$'),
  verified_by uuid,
  verified_at timestamptz,
  share_consent boolean not null default false,
  block_reason text,
  created_at timestamptz not null default now()
);
create index if not exists club_members_club_idx on club_members (club_id);

create table if not exists club_tables (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id) on delete cascade,
  name text not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'open', 'closed')),
  scheduled_for timestamptz,
  opening_chips bigint check (opening_chips is null or opening_chips > 0),
  closing_chips bigint check (closing_chips is null or closing_chips >= 0),
  variance bigint,
  opened_by uuid,
  opened_at timestamptz,
  closed_by uuid,
  closed_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists club_tables_club_idx on club_tables (club_id);

create table if not exists club_seats (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references club_tables(id) on delete cascade,
  member_id uuid not null references club_members(id),
  seated_at timestamptz not null default now(),
  unique (table_id, member_id)
);

-- Entries are never deleted: a mistake is voided with a reason.
create table if not exists club_entries (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references club_tables(id) on delete cascade,
  seat_id uuid references club_seats(id) on delete cascade, -- null for a rake drop
  kind text not null check (kind in ('buyin', 'cashout', 'rake')),
  chips bigint not null check (chips > 0),
  voided_at timestamptz,
  voided_by uuid,
  void_reason text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists club_entries_table_idx on club_entries (table_id);

create table if not exists club_audit (
  id bigserial primary key,
  club_id uuid not null references clubs(id) on delete cascade,
  actor uuid,
  actor_name text,
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists club_audit_club_idx on club_audit (club_id, created_at desc);

-- Helpers (security definer so policies never recurse).
create or replace function club_role(p_club uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from club_staff where club_id = p_club and user_id = auth.uid()
$$;

create or replace function club_of_table(p_table uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select club_id from club_tables where id = p_table
$$;

create or replace function _club_log(p_club uuid, p_action text, p_detail jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into club_audit (club_id, actor, actor_name, action, detail)
  values (
    p_club, auth.uid(),
    (select display_name from club_staff where club_id = p_club and user_id = auth.uid()),
    p_action, p_detail
  );
end;
$$;

-- Reads: staff of the club only. Writes: none directly, only the functions below.
alter table clubs enable row level security;
alter table club_staff enable row level security;
alter table club_members enable row level security;
alter table club_tables enable row level security;
alter table club_seats enable row level security;
alter table club_entries enable row level security;
alter table club_audit enable row level security;

drop policy if exists "staff read clubs" on clubs;
create policy "staff read clubs" on clubs for select using (club_role(id) is not null);
drop policy if exists "staff read staff" on club_staff;
create policy "staff read staff" on club_staff for select using (club_role(club_id) is not null);
drop policy if exists "staff read members" on club_members;
create policy "staff read members" on club_members for select using (club_role(club_id) is not null);
drop policy if exists "staff read tables" on club_tables;
create policy "staff read tables" on club_tables for select using (club_role(club_id) is not null);
drop policy if exists "staff read seats" on club_seats;
create policy "staff read seats" on club_seats for select using (club_role(club_of_table(table_id)) is not null);
drop policy if exists "staff read entries" on club_entries;
create policy "staff read entries" on club_entries for select using (club_role(club_of_table(table_id)) is not null);
drop policy if exists "managers read audit" on club_audit;
create policy "managers read audit" on club_audit for select
  using (club_role(club_id) in ('owner', 'manager'));

-- Prototype only: join a demo club in a chosen role, seeding members on first use.
create or replace function club_claim_demo(p_slot text, p_role text, p_name text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_name text := case when upper(p_slot) = 'B' then 'Demo Club B' else 'Demo Club A' end;
  v_club uuid;
  n text;
  i int := 0;
  names text[] := array['Aarav Mehta','Diya Kapoor','Rohan Iyer','Meera Nair','Kabir Shah','Ananya Rao',
                        'Vikram Singh','Ishita Bose','Arjun Patel','Sana Khan','Neel Joshi','Tara Menon'];
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  if p_role not in ('owner', 'manager', 'cashier') then raise exception 'bad role'; end if;

  select id into v_club from clubs where is_demo and name = v_name limit 1;
  if v_club is null then
    insert into clubs (name, is_demo) values (v_name, true) returning id into v_club;
    foreach n in array names loop
      i := i + 1;
      exit when upper(p_slot) = 'B' and i > 6;
      insert into club_members (club_id, full_name, kyc_status, id_type, id_last4, verified_at, share_consent, block_reason)
      values (
        v_club, n,
        case when i in (11, 12) then 'pending' when i = 9 then 'blocked' else 'verified' end,
        case when i in (11, 12) then null else 'Government ID' end,
        case when i in (11, 12) then null else lpad((1000 + i * 137)::text, 4, '0') end,
        case when i in (11, 12) then null else now() end,
        i not in (11, 12),
        case when i = 9 then 'Unsettled dispute' else null end
      );
    end loop;
  end if;

  insert into club_staff (club_id, user_id, display_name, role)
  values (v_club, auth.uid(), coalesce(nullif(btrim(p_name), ''), initcap(p_role)), p_role)
  on conflict (club_id, user_id) do update set role = excluded.role, display_name = excluded.display_name;

  perform _club_log(v_club, 'joined_demo', jsonb_build_object('role', p_role));
  return v_club;
end;
$$;

create or replace function club_add_member(p_club uuid, p_name text, p_phone text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if club_role(p_club) is null then raise exception 'not allowed'; end if;
  if btrim(coalesce(p_name, '')) = '' then raise exception 'name required'; end if;
  insert into club_members (club_id, full_name, phone)
  values (p_club, btrim(p_name), nullif(btrim(p_phone), '')) returning id into v_id;
  perform _club_log(p_club, 'member_added', jsonb_build_object('member', v_id, 'name', btrim(p_name)));
  return v_id;
end;
$$;

create or replace function club_set_kyc(
  p_member uuid, p_status text, p_id_type text default null, p_id_last4 text default null,
  p_reason text default null, p_consent boolean default false
) returns void
language plpgsql security definer set search_path = public as $$
declare v_club uuid;
begin
  select club_id into v_club from club_members where id = p_member;
  if v_club is null or club_role(v_club) not in ('owner', 'manager') then raise exception 'not allowed'; end if;
  if p_status not in ('pending', 'verified', 'blocked') then raise exception 'bad status'; end if;
  if p_status = 'blocked' and btrim(coalesce(p_reason, '')) = '' then raise exception 'a reason is required to block'; end if;
  if p_status = 'verified' and (btrim(coalesce(p_id_type, '')) = '' or btrim(coalesce(p_id_last4, '')) = '') then
    raise exception 'ID type and last four digits are required to verify';
  end if;

  update club_members set
    kyc_status = p_status,
    id_type = case when p_status = 'verified' then btrim(p_id_type) else id_type end,
    id_last4 = case when p_status = 'verified' then btrim(p_id_last4) else id_last4 end,
    verified_by = case when p_status = 'verified' then auth.uid() else verified_by end,
    verified_at = case when p_status = 'verified' then now() else verified_at end,
    share_consent = case when p_status = 'verified' then p_consent else share_consent end,
    block_reason = case when p_status = 'blocked' then btrim(p_reason) else null end
  where id = p_member;
  perform _club_log(v_club, 'kyc_' || p_status, jsonb_build_object('member', p_member, 'reason', p_reason));
end;
$$;

create or replace function club_create_table(p_club uuid, p_name text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if club_role(p_club) not in ('owner', 'manager') then raise exception 'not allowed'; end if;
  insert into club_tables (club_id, name, created_by)
  values (p_club, coalesce(nullif(btrim(p_name), ''), 'Table'), auth.uid()) returning id into v_id;
  perform _club_log(p_club, 'table_created', jsonb_build_object('table', v_id));
  return v_id;
end;
$$;

-- A table cannot open without its total chip count.
create or replace function club_open_table(p_table uuid, p_opening_chips bigint)
returns void
language plpgsql security definer set search_path = public as $$
declare v_club uuid := club_of_table(p_table);
begin
  if v_club is null or club_role(v_club) not in ('owner', 'manager') then raise exception 'not allowed'; end if;
  if p_opening_chips is null or p_opening_chips <= 0 then raise exception 'enter the total chip count before opening'; end if;
  if not exists (select 1 from club_tables where id = p_table and status = 'scheduled') then
    raise exception 'table is not waiting to open';
  end if;
  update club_tables set status = 'open', opening_chips = p_opening_chips,
    opened_by = auth.uid(), opened_at = now() where id = p_table;
  perform _club_log(v_club, 'table_opened', jsonb_build_object('table', p_table, 'opening_chips', p_opening_chips));
end;
$$;

create or replace function club_seat_member(p_table uuid, p_member uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_club uuid := club_of_table(p_table);
  v_status text;
  v_id uuid;
begin
  if v_club is null or club_role(v_club) is null then raise exception 'not allowed'; end if;
  if not exists (select 1 from club_tables where id = p_table and status = 'open') then
    raise exception 'table is not open';
  end if;
  select kyc_status into v_status from club_members where id = p_member and club_id = v_club;
  if v_status is null then raise exception 'unknown member'; end if;
  if v_status <> 'verified' then raise exception 'only verified members can be seated'; end if;
  insert into club_seats (table_id, member_id) values (p_table, p_member)
  on conflict (table_id, member_id) do update set table_id = excluded.table_id
  returning id into v_id;
  perform _club_log(v_club, 'seated', jsonb_build_object('table', p_table, 'member', p_member));
  return v_id;
end;
$$;

create or replace function club_post_entry(p_seat uuid, p_kind text, p_chips bigint)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_table uuid;
  v_club uuid;
  v_id uuid;
begin
  select table_id into v_table from club_seats where id = p_seat;
  v_club := club_of_table(v_table);
  if v_club is null or club_role(v_club) is null then raise exception 'not allowed'; end if;
  if p_kind not in ('buyin', 'cashout') then raise exception 'bad entry'; end if;
  if p_chips is null or p_chips <= 0 then raise exception 'enter a chip count'; end if;
  if not exists (select 1 from club_tables where id = v_table and status = 'open') then
    raise exception 'table is not open';
  end if;
  if p_kind = 'cashout' then
    if not exists (select 1 from club_entries where seat_id = p_seat and kind = 'buyin' and voided_at is null) then
      raise exception 'no buy-in to cash out';
    end if;
    if exists (select 1 from club_entries where seat_id = p_seat and kind = 'cashout' and voided_at is null) then
      raise exception 'already cashed out. Void it first to change it';
    end if;
  end if;
  insert into club_entries (table_id, seat_id, kind, chips, created_by)
  values (v_table, p_seat, p_kind, p_chips, auth.uid()) returning id into v_id;
  perform _club_log(v_club, 'entry_' || p_kind, jsonb_build_object('entry', v_id, 'seat', p_seat, 'chips', p_chips));
  return v_id;
end;
$$;

create or replace function club_void_entry(p_entry uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_table uuid;
  v_club uuid;
begin
  select table_id into v_table from club_entries where id = p_entry and voided_at is null;
  v_club := club_of_table(v_table);
  if v_club is null or club_role(v_club) not in ('owner', 'manager') then raise exception 'a manager must void entries'; end if;
  if btrim(coalesce(p_reason, '')) = '' then raise exception 'a reason is required'; end if;
  if not exists (select 1 from club_tables where id = v_table and status = 'open') then
    raise exception 'table is closed';
  end if;
  update club_entries set voided_at = now(), voided_by = auth.uid(), void_reason = btrim(p_reason) where id = p_entry;
  perform _club_log(v_club, 'entry_voided', jsonb_build_object('entry', p_entry, 'reason', btrim(p_reason)));
end;
$$;

-- Rake is whatever staff collect at the table; nothing is configured beforehand.
create or replace function club_post_rake(p_table uuid, p_chips bigint)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_club uuid := club_of_table(p_table);
  v_id uuid;
begin
  if v_club is null or club_role(v_club) is null then raise exception 'not allowed'; end if;
  if p_chips is null or p_chips <= 0 then raise exception 'enter the chips collected'; end if;
  if not exists (select 1 from club_tables where id = p_table and status = 'open') then
    raise exception 'table is not open';
  end if;
  insert into club_entries (table_id, kind, chips, created_by)
  values (p_table, 'rake', p_chips, auth.uid()) returning id into v_id;
  perform _club_log(v_club, 'entry_rake', jsonb_build_object('entry', v_id, 'chips', p_chips));
  return v_id;
end;
$$;

-- Closing: every player with a buy-in has cashed out, the tray is counted, and
-- the variance against (opening - buy-ins + cash-outs + rake) is stored.
create or replace function club_close_table(p_table uuid, p_closing_chips bigint)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_club uuid := club_of_table(p_table);
  v_open bigint;
  v_in bigint;
  v_out bigint;
  v_rake bigint;
  v_expected bigint;
  v_var bigint;
  v_waiting int;
begin
  if v_club is null or club_role(v_club) not in ('owner', 'manager') then raise exception 'not allowed'; end if;
  if p_closing_chips is null or p_closing_chips < 0 then raise exception 'enter the tray chip count'; end if;
  select opening_chips into v_open from club_tables where id = p_table and status = 'open';
  if v_open is null then raise exception 'table is not open'; end if;

  select count(*) into v_waiting from club_seats s
  where s.table_id = p_table
    and exists (select 1 from club_entries e where e.seat_id = s.id and e.kind = 'buyin' and e.voided_at is null)
    and not exists (select 1 from club_entries e where e.seat_id = s.id and e.kind = 'cashout' and e.voided_at is null);
  if v_waiting > 0 then raise exception '% player(s) still in play', v_waiting; end if;

  select coalesce(sum(chips) filter (where kind = 'buyin'), 0),
         coalesce(sum(chips) filter (where kind = 'cashout'), 0),
         coalesce(sum(chips) filter (where kind = 'rake'), 0)
    into v_in, v_out, v_rake from club_entries where table_id = p_table and voided_at is null;
  v_expected := v_open - v_in + v_out + v_rake;
  v_var := p_closing_chips - v_expected;

  update club_tables set status = 'closed', closing_chips = p_closing_chips, variance = v_var,
    closed_by = auth.uid(), closed_at = now() where id = p_table;
  perform _club_log(v_club, 'table_closed', jsonb_build_object(
    'table', p_table, 'opening', v_open, 'buyins', v_in, 'cashouts', v_out, 'rake', v_rake,
    'expected', v_expected, 'counted', p_closing_chips, 'variance', v_var));
  return jsonb_build_object('opening', v_open, 'buyins', v_in, 'cashouts', v_out, 'rake', v_rake,
    'expected', v_expected, 'counted', p_closing_chips, 'variance', v_var);
end;
$$;

revoke execute on function club_claim_demo(text, text, text) from public, anon;
revoke execute on function club_add_member(uuid, text, text) from public, anon;
revoke execute on function club_set_kyc(uuid, text, text, text, text, boolean) from public, anon;
revoke execute on function club_create_table(uuid, text) from public, anon;
revoke execute on function club_open_table(uuid, bigint) from public, anon;
revoke execute on function club_seat_member(uuid, uuid) from public, anon;
revoke execute on function club_post_entry(uuid, text, bigint) from public, anon;
revoke execute on function club_post_rake(uuid, bigint) from public, anon;
revoke execute on function club_void_entry(uuid, text) from public, anon;
revoke execute on function club_close_table(uuid, bigint) from public, anon;
grant execute on function club_claim_demo(text, text, text) to authenticated;
grant execute on function club_add_member(uuid, text, text) to authenticated;
grant execute on function club_set_kyc(uuid, text, text, text, text, boolean) to authenticated;
grant execute on function club_create_table(uuid, text) to authenticated;
grant execute on function club_open_table(uuid, bigint) to authenticated;
grant execute on function club_seat_member(uuid, uuid) to authenticated;
grant execute on function club_post_entry(uuid, text, bigint) to authenticated;
grant execute on function club_post_rake(uuid, bigint) to authenticated;
grant execute on function club_void_entry(uuid, text) to authenticated;
grant execute on function club_close_table(uuid, bigint) to authenticated;

notify pgrst, 'reload schema';
