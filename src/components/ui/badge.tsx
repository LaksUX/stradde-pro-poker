import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

// Variants beyond shadcn's default set (win/error) map directly onto
// DESIGN-dashboard.md's "delta-badge-positive"/"delta-badge-negative" — the
// small colored signal that sits NEXT TO a figure, which itself always
// stays text-ink (see .type-figure-hero/.type-figure-md in src/index.css).
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center gap-1 rounded-full border border-transparent px-2 py-0.5 text-xs font-semibold whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "bg-primary text-on-primary",
        secondary: "bg-surface-strong text-ink",
        outline: "border-hairline text-muted",
        win: "bg-win/15 text-win",
        error: "bg-error/15 text-error",
        muted: "bg-surface-strong text-muted",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant, className }))}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
