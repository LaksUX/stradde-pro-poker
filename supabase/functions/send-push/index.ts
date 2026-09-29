// Called only by the pg_net triggers in 0015_push_notifications.sql — never
// directly by the app. See that migration's header comment for the two
// placeholders (project ref, PUSH_TRIGGER_SECRET) it needs filled in before
// any of this fires.
//
// Sends real Web Push messages (the browser delivers them even when the
// tab/app is closed, via the OS's push service) using the VAPID protocol —
// see src/sw.ts for the client-side 'push' event handler that turns a
// delivered message into an actual notification.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const TRIGGER_SECRET = Deno.env.get('PUSH_TRIGGER_SECRET')!
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT')!

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

type RequestBody = {
  profile_ids: string[]
  title: string
  body: string
  url?: string
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return json({ error: 'POST only' }, 405)
  }
  // Not a user-facing auth check (no JWT involved — pg_net calls this with
  // no user session) — a shared secret only the trigger and this function
  // know, so a leaked function URL alone can't be used to spam arbitrary
  // push messages at real users.
  if (req.headers.get('X-Trigger-Secret') !== TRIGGER_SECRET) {
    return json({ error: 'unauthorized' }, 401)
  }

  let payload: RequestBody
  try {
    payload = await req.json()
    if (!Array.isArray(payload.profile_ids) || payload.profile_ids.length === 0) {
      throw new Error('profile_ids must be a non-empty array')
    }
    if (!payload.title || !payload.body) throw new Error('title and body are required')
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Expected {profile_ids, title, body, url?}' }, 400)
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: subs, error } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .in('profile_id', payload.profile_ids)

  if (error) return json({ error: error.message }, 500)
  if (!subs || subs.length === 0) return json({ sent: 0, stale_removed: 0 })

  const message = JSON.stringify({ title: payload.title, body: payload.body, url: payload.url })
  const staleIds: string[] = []

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          message
        )
      } catch (e: unknown) {
        // 404/410 means the browser's push service has permanently
        // discarded this subscription (uninstalled, permission revoked,
        // endpoint expired) — clean it up so it isn't retried forever.
        // Anything else (a transient 5xx from the push service) is left
        // in place for the next event to retry naturally.
        const status = (e as { statusCode?: number })?.statusCode
        if (status === 404 || status === 410) {
          staleIds.push(s.id)
        } else {
          console.error(`push failed for subscription ${s.id}:`, e)
        }
      }
    })
  )

  if (staleIds.length > 0) {
    await admin.from('push_subscriptions').delete().in('id', staleIds)
  }

  return json({ sent: subs.length - staleIds.length, stale_removed: staleIds.length })
})

// --- How to deploy and test this yourself ---
//
// 1. Generate a VAPID key pair (needs Node + the web-push CLI once, locally):
//      npx web-push generate-vapid-keys
//    This prints a Public Key and a Private Key — keep both.
// 2. Set this function's secrets (needs the Supabase CLI logged into your
//    account — I can't run this from here):
//      supabase secrets set VAPID_PUBLIC_KEY=<public key from step 1>
//      supabase secrets set VAPID_PRIVATE_KEY=<private key from step 1>
//      supabase secrets set VAPID_SUBJECT=mailto:<your email>
//      supabase secrets set PUSH_TRIGGER_SECRET=<any random string you pick>
//    SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set automatically.
// 3. Put the SAME public key from step 1 into the app's env as
//    VITE_VAPID_PUBLIC_KEY (Vercel project settings → Environment Variables)
//    — this is the one piece the client needs, and it's meant to be public.
// 4. Deploy: `supabase functions deploy send-push --no-verify-jwt` (no-verify-jwt
//    because pg_net calls this with no user JWT, only the X-Trigger-Secret
//    header above).
// 5. Fill in the two placeholders in 0015_push_notifications.sql (project
//    ref, and the SAME PUSH_TRIGGER_SECRET from step 2) and run that
//    migration in the SQL editor.
// 6. Test directly with curl, bypassing the app and the trigger entirely:
//      curl -X POST https://<project-ref>.supabase.co/functions/v1/send-push \
//        -H "X-Trigger-Secret: <your PUSH_TRIGGER_SECRET>" \
//        -H "Content-Type: application/json" \
//        -d '{"profile_ids":["<a real profile id with a push subscription>"],"title":"Test","body":"Hello"}'
//    You need at least one row in push_subscriptions first — that only
//    gets created once someone taps "Enable notifications" in the app
//    (see src/lib/push.ts) and grants the browser permission prompt.
