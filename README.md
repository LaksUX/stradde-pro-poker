# Poker Night

Live buy-in and settlement tracking for home poker games. Full product spec lives in
`REQUIREMENTS.md` (the what/why) and `PAGE_PROMPTS.md` (the how, screen by screen) —
read both before extending this. `DESIGN-airbnb.md` is the visual token source.

## What's actually built in this pass

**Real, wired to Supabase:** Continue, Apply to Host, Join, Create Game, Share
Table, Live Game (the Pending requests queue + confirm/decline + player list
specifically — the full bottom sheet with rake editing, the cash-out keypad, and
the Replace-this-seat shortcut are stubbed with a plain `prompt()` for cash-out,
not the real UI).

**Stubbed, spec'd, not built:** Pending Approval, Admin, Home, Scheduled Game, My
Game, My Settlements, Settlement, Game Detail, Venue Detail. Each has a complete
behavioral spec in `PAGE_PROMPTS.md`. Follow the pattern in `ShareTable.tsx` /
`LiveGame.tsx` (realtime + RLS) or `Continue.tsx` / `Join.tsx` (the one auth
mechanism, in its two entry contexts — no email track anymore, see the twelfth
revision).

**Deliberately incomplete, flagged in code, read before relying on it:**

- `src/hooks/useAuth.ts`'s `joinAsPlayer` — cross-device "same phone, same
  identity" needs a server-side Edge Function (stubbed at
  `supabase/functions/join-as-player/`) that the client-only version in this pass
  cannot safely do. First-time-on-a-new-phone joining works; rejoining the same
  phone from a second device will currently throw rather than silently break.
- `public_live_roster`'s host/player distinction — the database view can't
  tell "the viewer" from "everyone else," so it exposes a narrower column set
  than the full app UI needs. Revisit before this leaves prototype status.
- `settlement_transfers`' public post-close read (mentioned, not implemented) —
  needs to be gated by which phone is asking, which means an Edge Function or
  RPC, not a bare view grant.

None of these are silent gaps — each is commented in place. Don't build further on
top of them without addressing the comment first.

## Local setup

1. **Supabase project.** Create one at supabase.com, or run the CLI locally:
   ```
   npx supabase init
   npx supabase start   # requires Docker
   ```
2. **Run the migrations** against whichever project you're using:
   ```
   npx supabase db push   # hosted project
   # or, for local dev:
   npx supabase migration up
   ```
   `supabase/migrations/0001_core_schema.sql` and `0002_rls_policies.sql` are the
   whole schema — read the comments in both before running them somewhere that
   matters, especially the RLS file's known gaps noted above.
3. **Env vars.** Copy `.env.example` to `.env.local`, fill in your project's URL and
   anon key from Settings → API.
4. **Install & run:**
   ```
   npm install
   npm run dev
   ```
5. **Enable Anonymous Sign-ins** in your Supabase project (Authentication →
   Providers → Anonymous) — every identity in the app now depends on this,
   host and player alike, per the twelfth revision. No SMTP setup needed
   anymore; the earlier email magic-link flow (and the SMTP configuration it
   required) is retired.
6. **Sign in, then apply to host.** Go to `/continue`, enter any name and
   phone — this creates your `profiles` row with `role: 'player'`. From
   there, tap "Apply to host" (or run the SQL below once, faster for local
   testing): `role` becomes `'host'`, `approved` starts `false` (the Admin
   screen that would normally do the approving isn't built yet). Run this
   once in the SQL Editor to approve yourself:
   ```sql
   update profiles set approved = true where role = 'host';
   ```

## Deploying

- **Two Supabase projects, not one** — a staging project your local dev and Vercel
  preview deployments point at, and a separate production project only the real
  deploy touches. Don't develop against production data.
- **Vercel:** import this repo, set `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
  per environment (Preview → staging project, Production → production project).
  Every branch/PR gets a free preview URL automatically — use it before merging.
- **PWA:** `npm run build` generates the manifest and service worker via
  `vite-plugin-pwa` — test "Add to Home Screen" on an actual current iOS Safari and
  Android Chrome before considering this launch-ready; there are real,
  device-specific quirks that don't show up in desktop devtools.

## Continuing the build

Claude Code is a good fit for grinding through the remaining stubbed screens — each
one has a full spec already written in `PAGE_PROMPTS.md`, and the five real screens
here establish the query/mutation/realtime pattern to repeat.
