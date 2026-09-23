import { cn } from "cn"

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn(
        "type-label-caption flex items-center gap-1 text-muted select-none",
        className
      )}
      {...props}
    />
  )
}

export { Label }
