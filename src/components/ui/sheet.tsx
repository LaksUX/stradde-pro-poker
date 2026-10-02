import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { cn } from "cn"
import { X } from "lucide-react"

function Sheet(props: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger(props: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose(props: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="sheet-close" {...props} />
}

type Side = "top" | "bottom" | "left" | "right"

const slideStyles: Record<Side, string> = {
  top: "inset-x-0 top-0 rounded-b-xl border-b data-[starting-style]:-translate-y-full data-[ending-style]:-translate-y-full",
  bottom: "inset-x-0 bottom-0 rounded-t-xl border-t data-[starting-style]:translate-y-full data-[ending-style]:translate-y-full",
  left: "inset-y-0 left-0 w-3/4 max-w-sm rounded-r-xl border-r data-[starting-style]:-translate-x-full data-[ending-style]:-translate-x-full",
  right: "inset-y-0 right-0 w-3/4 max-w-sm rounded-l-xl border-l data-[starting-style]:translate-x-full data-[ending-style]:translate-x-full",
}

function SheetContent({
  className,
  children,
  side = "bottom",
  showClose = false,
  ...props
}: DialogPrimitive.Popup.Props & { side?: Side; showClose?: boolean }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop
        className={cn(
          "fixed inset-0 z-50 bg-black/60 transition-opacity duration-200",
          "data-[starting-style]:opacity-0 data-[ending-style]:opacity-0"
        )}
      />
      <DialogPrimitive.Popup
        data-slot="sheet-content"
        className={cn(
          "fixed z-50 overflow-y-auto border-hairline bg-canvas p-5 outline-none transition-transform duration-200",
          side === "bottom" && "max-h-[85vh] pb-[calc(1.25rem+env(safe-area-inset-bottom))]",
          side === "top" && "max-h-[85vh]",
          (side === "left" || side === "right") && "h-full",
          slideStyles[side],
          className
        )}
        {...props}
      >
        {side === "bottom" && (
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-hairline" />
        )}
        {children}
        {showClose && (
          <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
            <X className="size-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sheet-header" className={cn("flex items-center gap-3", className)} {...props} />
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  )
}

function SheetTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="sheet-title"
      className={cn("text-sm font-semibold text-ink", className)}
      {...props}
    />
  )
}

function SheetDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
