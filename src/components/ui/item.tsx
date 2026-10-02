import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

function ItemGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      role="list"
      data-slot="item-group"
      className={cn("flex w-full flex-col", className)}
      {...props}
    />
  )
}

function ItemSeparator({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      role="separator"
      data-slot="item-separator"
      className={cn("h-px w-full bg-hairline-soft", className)}
      {...props}
    />
  )
}

const itemVariants = cva(
  "flex w-full items-center gap-3 px-3 py-3 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        outline: "rounded-lg border border-hairline",
        muted: "rounded-lg bg-surface-strong/50",
      },
      size: {
        default: "py-3",
        sm: "py-2",
      },
      interactive: {
        true: "cursor-pointer hover:bg-surface-strong/60",
        false: "",
      },
    },
    defaultVariants: { variant: "default", size: "default", interactive: false },
  }
)

function Item({
  className,
  variant,
  size,
  interactive,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof itemVariants>) {
  return (
    <div
      role="listitem"
      data-slot="item"
      className={cn(itemVariants({ variant, size, interactive }), className)}
      {...props}
    />
  )
}

function ItemMedia({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="item-media" className={cn("shrink-0", className)} {...props} />
}

function ItemContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="item-content" className={cn("min-w-0 flex-1", className)} {...props} />
}

function ItemTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="item-title"
      className={cn("text-[15px] font-semibold text-ink", className)}
      {...props}
    />
  )
}

function ItemDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="item-description"
      className={cn("mt-0.5 text-sm text-muted", className)}
      {...props}
    />
  )
}

function ItemActions({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="item-actions"
      className={cn("flex shrink-0 flex-col items-end gap-1 text-right", className)}
      {...props}
    />
  )
}

function ItemHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="item-header"
      className={cn("flex w-full items-center justify-between gap-2", className)}
      {...props}
    />
  )
}

function ItemFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="item-footer"
      className={cn("flex w-full items-center justify-between gap-2", className)}
      {...props}
    />
  )
}

export {
  Item,
  ItemGroup,
  ItemSeparator,
  ItemMedia,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemActions,
  ItemHeader,
  ItemFooter,
  itemVariants,
}
