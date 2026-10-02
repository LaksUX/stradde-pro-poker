import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-sm font-medium transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:active:scale-100 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-on-primary hover:bg-primary-active disabled:bg-primary-disabled disabled:cursor-not-allowed disabled:text-ink/50",
        secondary: "bg-canvas text-ink border border-hairline hover:bg-surface-strong",
        ghost: "bg-transparent text-ink border border-hairline hover:bg-canvas",
        destructive: "bg-canvas text-error border border-error/40 hover:bg-error/10",
        outline: "border border-hairline bg-transparent text-ink hover:bg-surface-strong",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-12 px-6 text-[16px]",
        sm: "h-8 px-3 text-xs",
        lg: "h-14 px-8 text-[16px]",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant,
  size,
  block,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { block?: boolean }) {
  return (
    <button
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), block && "w-full", className)}
      {...props}
    />
  )
}

export { Button, buttonVariants }
