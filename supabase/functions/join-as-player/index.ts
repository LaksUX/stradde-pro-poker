// Deployed and tested live against the real project. The phone-lookup +
// magic-link-token generation below is confirmed working via curl; the
// CORS bug that blocked it from an actual browser (no
// Access-Control-Allow-Origin, so the preflight OPTIONS request failed
// before this code ever ran) is fixed below. The client's
// supabase.auth.verifyOtp step in useAuth.ts is the remaining piece to
// confirm end-to-end after this redeploy.
//
// Problem this solves: Supabase Anonymous Sign-in mints a new auth.uid()
// per browser/session. When someone "continues" with a phone number that
// already has a profile tied to a DIFFERENT auth.uid() (cleared browser, a
// different device, a fresh incognito window), the client has no safe way
// to prove it's really them and get back into that existing account — see
// useAuth.ts's continueWithPhone for the client-side half of this.
//
// Approach: Supabase's Admin API can mint a real session for an existing
// user via a magic-link token — but that API needs an email, and our
// anonymous users don't have one. So each profile gets a synthetic,
// internal-only email derived from its phone number (never sent anywhere,
// never shown to anyone) purely so the Admin API has something to generate
// a link against. This function:
//   1. Looks up the profile by phone (service-role, bypasses RLS safely —
//      this is the one place that's appropriate, since it's server-side and
//      never exposes the service-role key to the client).
//   2. Ensures that profile's auth user has its synthetic email set.
//   3. Generates a magic-link token for that email and returns the
//      "hashed_token" (not the emailed link — nothing is emailed).
//   4. The client calls supabase.auth.verifyOtp({ token_hash, type:
//      'magiclink' }) with that token, which establishes a real session for
//      the EXISTING user id, all without ever sending mail.
//
// Security note worth restating plainly: this does NOT add phone
// verification. Anyone who types a phone number they don't own can still
// request this and get signed in as that identity — same trust level as
// the rest of self-join today, per REQUIREMENTS.md's accepted gap. This
// function fixes the cross-device *mechanism*, not the underlying
// unverified-phone trust model.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Every browser call to a Supabase Edge Function is cross-origin (the app
// runs on vercel.app, the function on supabase.co), so the browser sends a
// CORS preflight OPTIONS request before the real POST — and without an
// Access-Control-Allow-Origin header on both the preflight response and the
// real one, the browser blocks the whole call before it ever reaches this
// code. Verified live: this function worked fine over curl (no preflight)
// but failed with a CORS error from an actual browser until this was added.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function syntheticEmail(phoneE164: string): string {
  // Internal-only, never sent anywhere, never shown to a user. Just needs
  // to be a stable, valid-looking email unique per phone.
  const digits = phoneE164.replace(/[^0-9]/g, '')
  return `p${digits}@phone.pokernight.internal`
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ error: 'POST only' }, 405)
  }

  let phone: string
  try {
    const body = await req.json()
    phone = body.phone
    if (!phone || typeof phone !== 'string') throw new Error('bad phone')
  } catch {
    return json({ error: 'Expected { phone: string }' }, 400)
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, phone')
    .eq('phone', phone)
    .maybeSingle()

  if (profileError) {
    return json({ error: profileError.message }, 500)
  }
  if (!profile) {
    // No existing profile for this phone — the caller should fall back to
    // the normal client-side signInAnonymously + upsert path instead.
    return json({ exists: false })
  }

  const email = syntheticEmail(phone)

  // Only write the synthetic email if it isn't already set — a profile
  // created before this function existed won't have one yet, but every
  // subsequent call for the same phone was unconditionally re-writing the
  // same value. Verified live: this caused real, repeatable "Error
  // updating user" 500s from admin.auth.admin.updateUserById, most likely
  // concurrent writes to the same auth.users row racing each other (this
  // function gets called on every sign-in attempt for an already-linked
  // phone, including retries) — skipping the redundant write removes that
  // contention entirely rather than papering over it with more retries.
  const { data: existingUser, error: getUserError } = await admin.auth.admin.getUserById(
    profile.id
  )
  if (getUserError) {
    return json({ error: getUserError.message }, 500)
  }
  if (existingUser.user.email !== email) {
    const { error: updateError } = await admin.auth.admin.updateUserById(profile.id, {
      email,
      email_confirm: true,
    })
    if (updateError) {
      return json({ error: updateError.message }, 500)
    }
  }

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })
  if (linkError || !linkData?.properties?.hashed_token) {
    return json({ error: linkError?.message ?? 'Could not generate a session token' }, 500)
  }

  return json({ exists: true, hashed_token: linkData.properties.hashed_token })
})

// --- How to deploy and test this yourself ---
//
// 1. Deploy: `supabase functions deploy join-as-player` (needs the Supabase
//    CLI logged into your account — I can't run this from here).
// 2. The function needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY as
//    secrets — Supabase sets these automatically for Edge Functions, you
//    shouldn't need to configure them manually, but confirm in the
//    dashboard under Edge Functions → join-as-player → Secrets if it fails.
// 3. Test directly with curl, bypassing the app entirely first:
//      curl -X POST https://<project-ref>.supabase.co/functions/v1/join-as-player \
//        -H "Authorization: Bearer <anon key>" \
//        -H "Content-Type: application/json" \
//        -d '{"phone":"+15550142"}'
//    Use a phone number you know already has a profile. You should get
//    back { exists: true, hashed_token: "..." }, not an error.
// 4. Only once that curl test works should you trust the client-side
//    integration in useAuth.ts's continueWithPhone.
