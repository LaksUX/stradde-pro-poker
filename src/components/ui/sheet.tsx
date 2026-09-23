import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { cn } from "cn"

function Sheet(props: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger(props: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetContent({ className, children, ...props }: DialogPrimitive.Popup.Props) {
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
          "fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-xl border-t border-hairline bg-canvas p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] outline-none transition-transform duration-200",
          "data-[starting-style]:translate-y-full data-[ending-style]:translate-y-full",
          className
        )}
        {...props}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-hairline" />
        {children}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sheet-header" className={cn("flex items-center gap-3", className)} {...props} />
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

export { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle }
