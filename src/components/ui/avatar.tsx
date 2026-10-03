import { Avatar as AvatarPrimitive } from "@base-ui/react/avatar"
import { User } from "lucide-react"
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

// Neutral slate fallback: primary is red and win/loss are colored, so the
// avatar stays a quiet grey that reads as its own element on white cards.

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
        "flex size-full items-center justify-center rounded-full bg-surface-strong text-sm font-bold text-muted",
        className
      )}
      {...props}
    />
  )
}

// The one call shape every row on the app actually needs — a name in, a
// fallback avatar out — rather than every page wiring up Root/Fallback
// itself (see Settlement.tsx before this). Used to render initials, but two
// different players can share initials at the same table (there's no
// disambiguation beyond a first name in a home game), which read as the
// same person at a glance — a plain icon never implies an identity the row
// doesn't actually have.
function NamedAvatar({
  name: _name,
  className,
}: {
  name: string
  className?: string
}) {
  return (
    <Avatar className={className}>
      <AvatarFallback>
        <User className="h-1/2 w-1/2" />
      </AvatarFallback>
    </Avatar>
  )
}

function AvatarBadge({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="avatar-badge"
      className={cn(
        "absolute bottom-0 right-0 size-2.5 rounded-full bg-win ring-2 ring-canvas",
        className
      )}
      {...props}
    />
  )
}

function AvatarGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="avatar-group"
      className={cn(
        "flex -space-x-2 *:data-[slot=avatar]:ring-2 *:data-[slot=avatar]:ring-canvas",
        className
      )}
      {...props}
    />
  )
}

export { Avatar, AvatarImage, AvatarFallback, AvatarBadge, AvatarGroup, NamedAvatar }
