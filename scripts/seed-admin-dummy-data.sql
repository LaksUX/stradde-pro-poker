-- Dummy data for the admin/super-host account, so every screen has
-- something real to render. Run this once in the Supabase SQL editor.
--
-- Uses only the already-existing junk test profiles as fake players
-- (asfdfasd, Go Live Host, both Lpaax's, Nav Test, Test Host) — never
-- "Laks", which looks like a real account. Assumes exactly one
-- profiles.role = 'admin' row exists (the account set up via
-- 0009_admin_can_host.sql's instructions).
--
-- Safe to re-run: each run adds a fresh new set of games rather than
-- erroring on duplicates, since nothing here has a uniqueness constraint
-- except the venue name (guarded with a find-or-create).

do $$
declare
  v_admin uuid;
  v_entity uuid;
  v_entity_name text;
  v_venue uuid;

  v_testhost uuid := '96389848-5334-4668-8872-52fe4a958b6b';
  v_navtest  uuid := 'c8e919a6-2023-4b82-a83b-8e3a13012d71';
  v_asfdfasd uuid := 'ac71442a-89fb-4002-aef4-ebaf2a889c1c';
  v_lpaax1   uuid := '50cd481a-cf17-4d3f-b172-ac1f3031b91e';
  v_lpaax2   uuid := 'db0fc09e-774d-46c1-8163-2c80ee79f703';
  v_golive   uuid := '5f162f92-b50e-4789-8842-b79a3203cbd2';

  v_game uuid;
  v_gp_admin uuid;
  v_gp_a uuid;
  v_gp_b uuid;
  v_gp_c uuid;
begin
  select id into v_admin from profiles where role = 'admin' limit 1;
  if v_admin is null then
    raise exception 'No profiles.role = admin row found — set one up first (see 0009_admin_can_host.sql).';
  end if;

  -- Every dummy player must actually exist — if the earlier test-account
  -- cleanup was ever run, this stops with a clear message instead of
  -- silently seeding broken rows.
  if not exists (select 1 from profiles where id in (v_testhost, v_navtest, v_asfdfasd, v_lpaax1, v_lpaax2, v_golive)
                 having count(*) = 6) then
    raise exception 'One or more of the junk test profiles this script reuses no longer exist.';
  end if;

  -- Find-or-create the admin's hosting entity, same shape the app itself
  -- would create lazily on first game creation (getOrCreateOwnEntity).
  select id into v_entity from hosting_entities where owner_profile_id = v_admin;
  if v_entity is null then
    select coalesce(full_name, 'Home') || '''s games' into v_entity_name from profiles where id = v_admin;
    insert into hosting_entities (type, name, slug, owner_profile_id)
    values ('house', v_entity_name,
      lower(regexp_replace(v_entity_name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(v_admin::text, 1, 6),
      v_admin)
    returning id into v_entity;
  end if;

  -- Find-or-create the shared test venue.
  select id into v_venue from venues where lower(name) = lower('Claude Test Venue');
  if v_venue is null then
    insert into venues (name, created_by) values ('Claude Test Venue', v_admin) returning id into v_venue;
  end if;

  -- ==========================================================================
  -- G1 — closed, published settlement, all three transfer statuses represented
  -- ==========================================================================
  insert into games (host_id, hosting_entity_id, venue_id, venue_freetext, name, status, stake, chip_ratio,
                      table_size, rake, scheduled_for, closed_at, settlement_published_at)
  values (v_admin, v_entity, v_venue, 'Claude Test Venue', 'Friday Night — Test 1', 'closed', 5, '1:1', 6, 5,
          now() - interval '3 days', now() - interval '3 days' + interval '4 hours', now() - interval '3 days' + interval '4 hours')
  returning id into v_game;

  insert into game_players (game_id, profile_id, is_host, cashout) values (v_game, v_admin, true, 15) returning id into v_gp_admin;
  insert into game_players (game_id, profile_id, cashout) values (v_game, v_testhost, 5) returning id into v_gp_a;
  insert into game_players (game_id, profile_id, cashout) values (v_game, v_navtest, 8) returning id into v_gp_b;
  insert into game_players (game_id, profile_id, cashout) values (v_game, v_asfdfasd, 7) returning id into v_gp_c;

  insert into buyin_requests (game_id, profile_id, requester_name, game_player_id, request_type, count, status, confirmed_at)
  values
    (v_game, v_admin, 'Admin', v_gp_admin, 'join', 2, 'confirmed', now() - interval '3 days'),
    (v_game, v_testhost, 'Test Host', v_gp_a, 'join', 3, 'confirmed', now() - interval '3 days'),
    (v_game, v_navtest, 'Nav Test', v_gp_b, 'join', 2, 'confirmed', now() - interval '3 days'),
    (v_game, v_asfdfasd, 'asfdfasd', v_gp_c, 'join', 1, 'confirmed', now() - interval '3 days');

  insert into settlement_transfers (game_id, from_player_id, to_player_id, amount, status, request_note)
  values
    (v_game, v_gp_a, v_gp_admin, 5, 'confirmed', null),
    (v_game, v_gp_b, v_gp_c, 2, 'disputed', 'I only bought in once, not twice'),
    (v_game, v_gp_c, v_gp_b, 1, 'pending', null);

  -- ==========================================================================
  -- G2 — closed, 1:2 ratio (exercises the chip-ratio display path), published
  -- ==========================================================================
  insert into games (host_id, hosting_entity_id, venue_id, venue_freetext, name, status, stake, chip_ratio,
                      table_size, rake, scheduled_for, closed_at, settlement_published_at)
  values (v_admin, v_entity, v_venue, 'Claude Test Venue', 'Wednesday — Test 2', 'closed', 10, '1:2', 8, 8,
          now() - interval '8 days', now() - interval '8 days' + interval '3 hours', now() - interval '8 days' + interval '3 hours')
  returning id into v_game;

  insert into game_players (game_id, profile_id, is_host, cashout) values (v_game, v_admin, true, 20) returning id into v_gp_admin;
  insert into game_players (game_id, profile_id, cashout) values (v_game, v_lpaax1, 32) returning id into v_gp_a;
  insert into game_players (game_id, profile_id, cashout) values (v_game, v_golive, 0) returning id into v_gp_b;

  insert into buyin_requests (game_id, profile_id, requester_name, game_player_id, request_type, count, status, confirmed_at)
  values
    (v_game, v_admin, 'Admin', v_gp_admin, 'join', 3, 'confirmed', now() - interval '8 days'),
    (v_game, v_lpaax1, 'Lpaax', v_gp_a, 'join', 2, 'confirmed', now() - interval '8 days'),
    (v_game, v_golive, 'Go Live Host', v_gp_b, 'join', 1, 'confirmed', now() - interval '8 days');

  insert into settlement_transfers (game_id, from_player_id, to_player_id, amount, status)
  values
    (v_game, v_gp_admin, v_gp_a, 10, 'confirmed'),
    (v_game, v_gp_b, v_gp_a, 2, 'confirmed');

  -- ==========================================================================
  -- G3 — closed, no rake, settlement NOT yet published (different state)
  -- ==========================================================================
  insert into games (host_id, hosting_entity_id, venue_id, venue_freetext, name, status, stake, chip_ratio,
                      table_size, rake, scheduled_for, closed_at, settlement_published_at)
  values (v_admin, v_entity, v_venue, 'Claude Test Venue', 'Sunday — Test 3', 'closed', 5, '1:1', 6, 0,
          now() - interval '15 days', now() - interval '15 days' + interval '5 hours', null)
  returning id into v_game;

  insert into game_players (game_id, profile_id, is_host, cashout) values (v_game, v_admin, true, 10) returning id into v_gp_admin;
  insert into game_players (game_id, profile_id, cashout) values (v_game, v_lpaax2, 5) returning id into v_gp_a;
  insert into game_players (game_id, profile_id, cashout) values (v_game, v_navtest, 5) returning id into v_gp_b;

  insert into buyin_requests (game_id, profile_id, requester_name, game_player_id, request_type, count, status, confirmed_at)
  values
    (v_game, v_admin, 'Admin', v_gp_admin, 'join', 1, 'confirmed', now() - interval '15 days'),
    (v_game, v_lpaax2, 'Lpaax', v_gp_a, 'join', 2, 'confirmed', now() - interval '15 days'),
    (v_game, v_navtest, 'Nav Test', v_gp_b, 'join', 1, 'confirmed', now() - interval '15 days');

  insert into settlement_transfers (game_id, from_player_id, to_player_id, amount, status)
  values (v_game, v_gp_a, v_gp_admin, 5, 'confirmed');

  -- ==========================================================================
  -- G4 — LIVE, with two real pending requests (join + more_buyins) so the
  -- new Pending Requests card on Live Game has something to show.
  -- ==========================================================================
  insert into games (host_id, hosting_entity_id, venue_id, venue_freetext, name, status, stake, chip_ratio,
                      table_size, rake, scheduled_for)
  values (v_admin, v_entity, v_venue, 'Claude Test Venue', 'Live Test Table', 'live', 5, '1:1', 9, 0, now())
  returning id into v_game;

  insert into game_players (game_id, profile_id, is_host) values (v_game, v_admin, true) returning id into v_gp_admin;
  insert into game_players (game_id, profile_id) values (v_game, v_asfdfasd) returning id into v_gp_a;
  insert into game_players (game_id, profile_id) values (v_game, v_navtest) returning id into v_gp_b;

  insert into buyin_requests (game_id, profile_id, requester_name, game_player_id, request_type, count, status, confirmed_at)
  values
    (v_game, v_admin, 'Admin', v_gp_admin, 'join', 2, 'confirmed', now()),
    (v_game, v_asfdfasd, 'asfdfasd', v_gp_a, 'join', 1, 'confirmed', now()),
    (v_game, v_navtest, 'Nav Test', v_gp_b, 'join', 1, 'confirmed', now());

  -- The two PENDING ones — a fresh join request (no game_players row yet)
  -- and a more-buyins request from an already-seated player.
  insert into buyin_requests (game_id, profile_id, requester_name, request_type, count, status)
  values (v_game, v_testhost, 'Test Host', 'join', 2, 'pending');

  insert into buyin_requests (game_id, profile_id, requester_name, game_player_id, request_type, count, status)
  values (v_game, v_navtest, 'Nav Test', v_gp_b, 'more_buyins', 2, 'pending');

  -- ==========================================================================
  -- G5 — scheduled, for the Scheduled Game screen
  -- ==========================================================================
  insert into games (host_id, hosting_entity_id, venue_freetext, name, status, stake, chip_ratio,
                      table_size, rake, scheduled_for)
  values (v_admin, v_entity, 'Claude Test Venue', 'Saturday — Test 4', 'scheduled', 5, '1:1', 9, 0, now() + interval '3 days')
  returning id into v_game;

  insert into game_players (game_id, profile_id, is_host) values (v_game, v_admin, true);

  raise notice 'Seed complete. Live game id: %', v_game;
end $$;
