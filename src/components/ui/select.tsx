import { cn } from "cn"

// A styled native <select> rather than Base UI's popup-based Select — the
// one call site (Settlement's From/To editor) is a compact inline control
// where a native listbox is the right amount of machinery, styled to match
// Input so it doesn't look out of place next to shadcn components.
function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(
        "h-10 w-full min-w-0 rounded-md border border-hairline bg-surface-strong px-3 text-sm text-ink outline-none transition-colors",
        "focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Select }
