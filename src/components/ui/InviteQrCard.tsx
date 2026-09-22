import { QRCodeSVG } from 'qrcode.react'
import { toast } from '../../lib/toast'

// A QR code floating bare on the page reads as "here's a barcode." Wrapping
// it with context above (who/what this invites into) and a copy action
// below, inside one structured card, reads as "this is a ticket" instead —
// see the Eventbrite/Nike ticket-card reference this was built from. One
// shared component since the same shape appears on every invite surface in
// the app (Share Table, Live Game, Scheduled Game, a host's permanent link).
export function InviteQrCard({
  eyebrow,
  title,
  subtitle,
  url,
  size = 160,
}: {
  eyebrow: string
  title: string
  subtitle?: string
  url: string
  size?: number
}) {
  return (
    <div className="mx-auto w-full max-w-[260px] overflow-hidden rounded-lg border border-hairline bg-canvas">
      <div className="p-3 text-center">
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted">{eyebrow}</p>
        <p className="mt-0.5 text-sm font-semibold text-ink">{title}</p>
        {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      </div>
      <div className="flex justify-center border-y border-hairline-soft bg-white p-4">
        <QRCodeSVG value={url} size={size} />
      </div>
      <button
        onClick={() => {
          navigator.clipboard.writeText(url)
          toast.success('Link copied')
        }}
        className="block w-full p-2.5 text-center text-xs font-medium text-primary underline"
      >
        Copy link
      </button>
    </div>
  )
}
