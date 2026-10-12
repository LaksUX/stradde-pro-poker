// Serves the app shell for /c/<token> with Open Graph tags filled in, so a
// card link pasted into WhatsApp / iMessage / Telegram unfurls as a titled
// card ("Mo · Friday Night") instead of a bare URL. Only the player's first
// name and the group name are used; never any results. Any failure falls back
// to the plain app shell.
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

export default async function handler(req, res) {
  const proto = req.headers['x-forwarded-proto'] || 'https'
  const origin = `${proto}://${req.headers['x-forwarded-host'] || req.headers.host}`
  const token = String((req.query && req.query.t) || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128)

  let html
  try {
    html = await (await fetch(`${origin}/index.html`)).text()
  } catch {
    res.redirect(302, '/')
    return
  }

  try {
    const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
    const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
    if (token && url && key) {
      const r = await fetch(`${url}/rest/v1/rpc/get_player_card`, {
        method: 'POST',
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_token: token }),
      })
      const card = r.ok ? await r.json() : null
      if (card && card.name) {
        const first = String(card.name).trim().split(/\s+/)[0]
        const title = esc(card.group ? `${first} · ${card.group}` : `${first}'s card`)
        const desc = 'Your private card. Your nights, all in one place.'
        const tags =
          `<meta property="og:type" content="website">` +
          `<meta property="og:site_name" content="Straddle">` +
          `<meta property="og:title" content="${title}">` +
          `<meta property="og:description" content="${desc}">` +
          `<meta property="og:image" content="${origin}/pwa-512x512.png">` +
          `<meta property="og:url" content="${origin}/c/${token}">` +
          `<meta name="twitter:card" content="summary">` +
          `<meta name="twitter:title" content="${title}">` +
          `<meta name="twitter:description" content="${desc}">`
        html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${title}</title>`).replace('</head>', `${tags}</head>`)
      }
    }
  } catch {
    // fall through with the plain shell
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600')
  res.status(200).send(html)
}
