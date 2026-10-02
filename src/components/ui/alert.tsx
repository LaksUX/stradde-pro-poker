import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const alertVariants = cva("relative w-full px-3 py-2 text-center text-sm font-medium", {
  variants: {
    variant: {
      default: "bg-canvas text-ink",
      destructive: "bg-error text-white",
    },
  },
  defaultVariants: { variant: "default" },
})

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      role="alert"
      data-slot="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  )
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="alert-description" className={cn(className)} {...props} />
}

export { Alert, AlertDescription, alertVariants }
