import { cn } from "cn"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "./item"

// The app's one list shape, built on shadcn's Item: avatar left, bold title +
// muted subtitle, right-aligned trailing column. ListGroup is the bordered
// card that holds a run of rows; ListRow is the prop-based shorthand for a
// single Item. Anything list-like should come through here (or compose Item
// directly) so every list stays visually identical.
function ListGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <ItemGroup
      className={cn(
        "divide-y divide-hairline-soft overflow-hidden rounded-lg border border-hairline bg-canvas",
        className
      )}
      {...props}
    />
  )
}

function ListRow({
  avatar,
  title,
  subtitle,
  trailing,
  className,
  onClick,
  ...props
}: {
  avatar?: React.ReactNode
  title: React.ReactNode
  subtitle?: React.ReactNode
  trailing?: React.ReactNode
} & Omit<React.ComponentProps<"div">, "title">) {
  return (
    <Item
      interactive={!!onClick}
      className={className}
      onClick={onClick}
      {...props}
    >
      {avatar && <ItemMedia>{avatar}</ItemMedia>}
      <ItemContent>
        <ItemTitle>{title}</ItemTitle>
        {subtitle && <ItemDescription>{subtitle}</ItemDescription>}
      </ItemContent>
      {trailing && <ItemActions>{trailing}</ItemActions>}
    </Item>
  )
}

// A row's date, when it's meant to lead — a full-width strip above the row.
function ListDate({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="list-date"
      className={cn("px-3 pt-2.5 text-xs font-semibold text-muted", className)}
      {...props}
    />
  )
}

export { ListGroup, ListRow, ListDate }
