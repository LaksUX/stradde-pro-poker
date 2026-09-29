-- Web push notification plumbing for two events (per this round's scope):
-- 1. Host gets pushed the moment a player submits a join/buy-in request.
-- 2. Every player in a game gets pushed once the host publishes settlement.
--
-- *** MANUAL SETUP REQUIRED before this does anything ***
-- pg_net lets Postgres itself make an HTTP call from a trigger — that's how
-- a plain INSERT/UPDATE ends up calling the send-push Edge Function with no
-- app code in the loop. Two placeholders below need real values from your
-- own project before running this:
--   1. <YOUR-PROJECT-REF> — from your Supabase project URL
--      (https://<YOUR-PROJECT-REF>.supabase.co).
--   2. <PUSH_TRIGGER_SECRET> — any random string YOU pick. Set the exact
--      same value as a secret on the send-push Edge Function itself
--      (`supabase secrets set PUSH_TRIGGER_SECRET=<same value>`) — it's how
--      that function tells "a real trigger called me" apart from "someone
--      found the URL and is spamming it." Do not reuse an existing secret.
-- Find-and-replace both placeholders (including the angle brackets) before
-- running this in the SQL editor.

create extension if not exists pg_net with schema extensions;

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index push_subscriptions_profile_idx on push_subscriptions (profile_id);

alter table push_subscriptions enable row level security;

create policy "read own push subscriptions" on push_subscriptions
  for select using (profile_id = auth.uid());

create policy "insert own push subscription" on push_subscriptions
  for insert with check (profile_id = auth.uid());

create policy "delete own push subscription" on push_subscriptions
  for delete using (profile_id = auth.uid());

-- Shared by both triggers below — fires the HTTP call and swallows any
-- error rather than letting it fail the write that triggered it. A push
-- notification that doesn't go out is a degraded experience; a buy-in
-- request or a published settlement that silently fails to save because
-- pg_net hiccupped would be a real money-tracking bug. Logs via `raise
-- warning` (visible in the Supabase dashboard's Postgres logs) instead of
-- failing loud.
create or replace function notify_push(payload jsonb)
returns void as $$
begin
  perform net.http_post(
    url := 'https://<YOUR-PROJECT-REF>.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Trigger-Secret', '<PUSH_TRIGGER_SECRET>'
    ),
    body := payload
  );
exception when others then
  raise warning 'notify_push failed: %', sqlerrm;
end;
$$ language plpgsql security definer;

-- 1. New join/buy-in request → push the host.
create or replace function notify_new_request()
returns trigger as $$
declare
  v_host_id uuid;
begin
  if new.status <> 'pending' then
    return new;
  end if;
  select host_id into v_host_id from games where id = new.game_id;
  if v_host_id is null then
    return new;
  end if;
  perform notify_push(jsonb_build_object(
    'profile_ids', jsonb_build_array(v_host_id),
    'title', case when new.request_type = 'join' then 'New join request' else 'New buy-in request' end,
    'body', coalesce(new.requester_name, 'A player') || ' requested ' || new.count ||
            ' buy-in' || case when new.count = 1 then '' else 's' end,
    'url', '/games/' || new.game_id || '/live'
  ));
  return new;
end;
$$ language plpgsql security definer;

create trigger buyin_requests_notify_host
  after insert on buyin_requests
  for each row execute function notify_new_request();

-- 2. Settlement published → push every player in that game.
create or replace function notify_settlement_published()
returns trigger as $$
declare
  v_profile_ids jsonb;
begin
  if new.settlement_published_at is null
     or new.settlement_published_at is not distinct from old.settlement_published_at then
    return new;
  end if;
  select jsonb_agg(profile_id) into v_profile_ids
  from game_players where game_id = new.id;
  if v_profile_ids is null then
    return new;
  end if;
  perform notify_push(jsonb_build_object(
    'profile_ids', v_profile_ids,
    'title', 'Settlement ready',
    'body', new.name || ' — settlement has been published.',
    'url', '/games/' || new.id
  ));
  return new;
end;
$$ language plpgsql security definer;

create trigger games_notify_settlement_published
  after update of settlement_published_at on games
  for each row execute function notify_settlement_published();
