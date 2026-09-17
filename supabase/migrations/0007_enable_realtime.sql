-- Every screen that subscribes to postgres_changes (LiveGame, ShareTable,
-- MyGame, GameDetail's realtime cousins) has been correct all along — the
-- writes land, RLS is right, the channel/filter code is right. What's been
-- missing is that these tables were never added to the `supabase_realtime`
-- publication, so Postgres never emits change events for them in the first
-- place. Without this, every update needs a manual reload to show up; with
-- it, the UI updates live as buy-ins are requested/confirmed, cash-outs are
-- entered, and settlement changes.
--
-- Default REPLICA IDENTITY (primary key) is enough here — every listener in
-- this app just re-fetches on ANY change to the row rather than reading the
-- old/new payload, so there's no need for REPLICA IDENTITY FULL.

alter publication supabase_realtime add table games;
alter publication supabase_realtime add table game_players;
alter publication supabase_realtime add table buyin_requests;
alter publication supabase_realtime add table settlement_transfers;
