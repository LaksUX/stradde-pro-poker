import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { cn } from "cn"

function Tabs({
  className,
  ...props
}: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

function TabsList({
  className,
  ...props
}: TabsPrimitive.List.Props) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        // segmented-tab, DESIGN-dashboard.md "components" — 48px, fully
        // rounded stadium shape, not the smaller rounded-rect tab bar
        // shadcn ships by default.
        "relative inline-flex h-12 w-full items-center gap-1 rounded-full bg-surface-strong p-1",
        className
      )}
      {...props}
    />
  )
}

function TabsTrigger({
  className,
  ...props
}: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        // active/inactive colors per segmented-tab: solid primary fill on
        // the active tab (on-primary text), muted text otherwise — not a
        // subtle canvas tint.
        "flex-1 rounded-full px-3 py-1.5 text-sm font-semibold text-muted transition-colors outline-none",
        "data-[active]:bg-primary data-[active]:text-on-primary",
        "focus-visible:ring-2 focus-visible:ring-ring/40",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("outline-none", className)}
      {...props}
    />
  )
}

// Secondary tier: an underline bar, visibly below the segmented primary
// tabs. Replaces the old pill filter chips.
function SubTabsList({ className, ...props }: TabsPrimitive.List.Props) {
  return (
    <TabsPrimitive.List
      data-slot="sub-tabs-list"
      className={cn("flex w-full gap-6 border-b border-hairline", className)}
      {...props}
    />
  )
}

function SubTabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="sub-tabs-trigger"
      className={cn(
        "-mb-px border-b-2 border-transparent pb-2.5 text-sm font-semibold text-muted transition-colors outline-none",
        "hover:text-ink data-[active]:border-primary data-[active]:text-ink",
        "focus-visible:ring-2 focus-visible:ring-ring/40",
        className
      )}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, SubTabsList, SubTabsTrigger }
