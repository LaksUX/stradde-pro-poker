import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const variantClasses: Record<Variant, string> = {
  primary:
    'bg-primary text-on-primary hover:bg-primary-active disabled:bg-primary-disabled disabled:cursor-not-allowed',
  secondary: 'bg-canvas text-ink border border-ink hover:bg-surface-soft',
  ghost: 'bg-canvas text-ink border border-hairline hover:bg-surface-soft',
  danger: 'bg-canvas text-error border border-error hover:bg-red-50',
}

export function Button({
  variant = 'primary',
  block,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; block?: boolean }) {
  return (
    <button
      className={`h-12 rounded-sm px-6 text-[16px] font-medium transition-colors ${
        block ? 'w-full' : ''
      } ${variantClasses[variant]} ${className}`}
      {...props}
    />
  )
}
