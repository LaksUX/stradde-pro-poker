-- Root cause of "LPAAX lost their host/admin option": continueWithPhone's
-- sign-in upsert in useAuth.ts unconditionally sent
-- { role: 'player', approved: false } on every single call — including for
-- an EXISTING profile signing back in. Supabase upsert(..., { onConflict:
-- 'id' }) turns that into a plain UPDATE on conflict, which overwrote the
-- role/approved of whoever it ran for, back down to a plain unapproved
-- player, every time. This wasn't limited to the identity-corruption case
-- 0014 already covers (a different phone reusing an existing session) — it
-- fired just as easily for someone re-entering their OWN correct phone
-- while their own session happened to still be valid (e.g. opening a game's
-- join link with their own number, a stale Continue.tsx render before
-- useAuth's profile finished loading). 0014's prevent_self_role_change
-- trigger didn't stop this either: the actor IS the row being updated, and
-- at the moment this fires their role in the database is still whatever it
-- was BEFORE this write (e.g. 'admin') — is_admin() reads true, so the
-- trigger — correctly, by its own design of "an admin may change roles" —
-- let an admin's own accidental self-demotion straight through.
--
-- Fix: role/approved should only ever be set by this path on a genuinely
-- NEW row (a real signup) — never touched again by a sign-in that's just
-- confirming an existing identity. This function makes that the only way
-- continueWithPhone can write a profile at all, by only ever setting
-- full_name/phone in the ON CONFLICT branch.

create or replace function upsert_own_profile(p_full_name text, p_phone text)
returns profiles as $$
  insert into profiles (id, full_name, phone, role, approved)
  values (auth.uid(), p_full_name, p_phone, 'player', false)
  on conflict (id) do update
    set full_name = excluded.full_name,
        phone = excluded.phone
  returning *;
$$ language sql;

-- *** If LPAAX (or any other host/admin) already got silently demoted to
-- role: 'player' by the bug this migration fixes, this alone does NOT
-- restore them — it only stops it from happening again. Restore anyone
-- affected with:
--   update profiles set role = 'admin', approved = true where phone = '<their E.164 phone>';
