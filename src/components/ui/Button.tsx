import type { ButtonHTMLAttributes } from 'react'
import { cn } from 'cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const variantClasses: Record<Variant, string> = {
  primary:
    'bg-primary text-on-primary hover:bg-primary-active disabled:bg-primary-disabled disabled:cursor-not-allowed disabled:text-ink/50',
  secondary: 'bg-canvas text-ink border border-hairline hover:bg-surface-strong',
  ghost: 'bg-transparent text-ink border border-hairline hover:bg-canvas',
  danger: 'bg-canvas text-error border border-error/40 hover:bg-error/10',
}

export function Button({
  variant = 'primary',
  block,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; block?: boolean }) {
  return (
    <button
      // cn() so a caller's own h-*/px-*/rounded-* override actually wins —
      // a plain template-string concat leaves both this base h-12 and a
      // caller's h-8 present in the class list, and Tailwind then picks
      // whichever rule its OWN internal stylesheet emits later (governed by
      // its numeric scale order, not by className/DOM order), which isn't
      // reliably the caller's override. Found via a real button rendering
      // at 48px despite an explicit h-8/h-9/h-10 override at several call
      // sites across the app.
      className={cn(
        'h-12 rounded-sm px-6 text-[16px] font-medium transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 disabled:active:scale-100',
        block && 'w-full',
        variantClasses[variant],
        className
      )}
      {...props}
    />
  )
}
