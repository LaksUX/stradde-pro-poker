import type { ButtonHTMLAttributes } from 'react'

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
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; block?: boolean }) {
  return (
    <button
      className={`h-12 rounded-sm px-6 text-[16px] font-medium transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 disabled:active:scale-100 ${
        block ? 'w-full' : ''
      } ${variantClasses[variant]} ${className}`}
      {...props}
    />
  )
}
