import { Avatar as AvatarPrimitive } from "@base-ui/react/avatar"
import { cn } from "cn"

function Avatar({ className, ...props }: AvatarPrimitive.Root.Props) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn(
        "relative flex h-8 w-8 shrink-0 overflow-hidden rounded-full",
        className
      )}
      {...props}
    />
  )
}

// Colored deltas everywhere else in this app (badges, figures) already use
// primary/win/error at a translucent tint against the dark canvas — the
// fallback used the same near-black surface tone as the cards it sits on
// (bg-surface-strong on bg-card), so it barely registered as its own
// element. This tint is the one that's visually distinct from every card/
// row background in the app while still reading as neutral (not a status
// color), so it stays legible across every context an avatar appears in.

function AvatarImage({ className, ...props }: AvatarPrimitive.Image.Props) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn("aspect-square size-full", className)}
      {...props}
    />
  )
}

function AvatarFallback({ className, ...props }: AvatarPrimitive.Fallback.Props) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        "flex size-full items-center justify-center rounded-full bg-primary/20 text-sm font-bold text-primary",
        className
      )}
      {...props}
    />
  )
}

// The one call shape every row on the app actually needs — a name in,
// initials out — rather than every page re-deriving initials() and
// wiring up Root/Fallback itself (see Settlement.tsx before this).
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase()
  return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase()
}

function NamedAvatar({
  name,
  className,
}: {
  name: string
  className?: string
}) {
  return (
    <Avatar className={className}>
      <AvatarFallback>{initialsOf(name)}</AvatarFallback>
    </Avatar>
  )
}

export { Avatar, AvatarImage, AvatarFallback, NamedAvatar, initialsOf }
