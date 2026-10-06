// A real, fetchable web app manifest per player card. Chrome, Samsung
// Internet and Edge only offer "Install" reliably when the manifest is a
// normal URL (not a blob), and each card needs its own start_url and id so
// every card installs as its own app that opens straight to that card.
//
//   /api/card-manifest?t=<card token>&n=<display name>
export default function handler(req, res) {
  const q = req.query || {}
  const token = String(q.t || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 128)
  // Reflected only inside JSON string values, with control characters removed.
  const name = String(q.n || 'Straddle').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 40) || 'Straddle'

  if (!token) {
    res.status(400).json({ error: 'missing card' })
    return
  }

  const manifest = {
    id: `/c/${token}`,
    name,
    short_name: name.slice(0, 12),
    description: 'Your private game night card.',
    start_url: `/c/${token}`,
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    theme_color: '#e5383b',
    background_color: '#eef1f5',
    icons: [
      { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }

  res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=300')
  res.status(200).send(JSON.stringify(manifest))
}
