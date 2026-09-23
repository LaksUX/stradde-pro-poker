import { DayPicker, type DayPickerProps } from "react-day-picker"
import { cn } from "cn"

// react-day-picker v10 ships no base stylesheet opinionated enough to match
// this app's dark theme — every part is styled directly via `classNames`
// instead, same as shadcn's own Calendar recipe does for the library.
function Calendar({ className, classNames, showOutsideDays = true, ...props }: DayPickerProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col gap-4",
        month: "flex flex-col gap-3",
        month_caption: "flex items-center justify-center pt-1",
        caption_label: "text-sm font-semibold text-ink",
        nav: "flex items-center justify-between absolute inset-x-1 top-3",
        button_previous:
          "h-7 w-7 flex items-center justify-center rounded-sm text-muted hover:bg-surface-strong hover:text-ink disabled:opacity-30",
        button_next:
          "h-7 w-7 flex items-center justify-center rounded-sm text-muted hover:bg-surface-strong hover:text-ink disabled:opacity-30",
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday: "w-9 text-center text-[11px] font-bold uppercase text-muted",
        week: "mt-1 flex w-full",
        day: "relative h-9 w-9 p-0 text-center text-sm",
        day_button:
          "flex h-9 w-9 items-center justify-center rounded-full text-ink transition-colors hover:bg-surface-strong",
        today: "[&>button]:font-bold [&>button]:text-primary",
        selected: "[&>button]:bg-primary [&>button]:text-on-primary [&>button]:hover:bg-primary",
        outside: "text-muted-soft opacity-50",
        disabled: "text-muted-soft opacity-30 pointer-events-none",
        hidden: "invisible",
        ...classNames,
      }}
      {...props}
    />
  )
}

export { Calendar }
