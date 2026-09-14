// NOT YET IMPLEMENTED — this is a stub explaining the real shape of the fix.
//
// Problem: Supabase Anonymous Sign-in mints a new auth.uid() per device.
// The player track needs "same phone = same identity, across any device,
// with no OTP" (REQUIREMENTS.md "Joining a game"). Client-side code cannot
// safely satisfy that — it would either violate the profiles.phone unique
// constraint, or (if that constraint were loosened) silently create
// disconnected per-device identities, breaking the cross-device history
// promise.
//
// This function is the correct place to do it, because only server-side
// code holding the service-role key can mint a session for an arbitrary
// existing user id — the Admin API is never safe to call from the client.
//
// Intended shape, once implemented:
//
//   1. Receive { name, phone } from the client (src/hooks/useAuth.ts's
//      joinAsPlayer would call this instead of doing the work locally).
//   2. Look up `profiles` by phone using the service-role client.
//   3a. If found: mint a session for that EXISTING user id — e.g. via
//       `supabase.auth.admin.generateLink({ type: 'magiclink', ... })` or
//       equivalent — and return it to the client so the device's local
//       session becomes that existing identity. This is the "Continue as
//       {name}, rejoining from a new device" path.
//   3b. If not found: create a new anonymous user (or use
//       `auth.admin.createUser` with no email/password) and a matching
//       profiles row, same as the current client-side fallback.
//   4. Return { access_token, refresh_token } (or however you're
//      structuring sessions) for the client to adopt.
//
// Security note this function must get right before shipping: because
// there's still no phone verification (see REQUIREMENTS.md's accepted
// "self-join has no identity verification" gap), step 3a means *anyone who
// types a phone number they don't own can obtain a session as that
// identity*. That's the same trust level as the rest of self-join today,
// but concentrated into one function — worth a deliberate second look
// before this leaves prototype status, not an oversight to paper over.
//
// deno-lint-ignore-file no-unused-vars
import { serve } from 'https://deno.land/std/http/server.ts'

serve(async (_req: Request) => {
  return new Response(
    JSON.stringify({
      error:
        'join-as-player is not implemented yet — see the comment at the top of this file for the intended design.',
    }),
    { status: 501, headers: { 'Content-Type': 'application/json' } }
  )
})
