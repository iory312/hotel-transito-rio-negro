import type { InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils.ts'

export const controlClass =
  'h-12 w-full rounded-md border border-line bg-white px-3 text-base text-ink outline-none focus-visible:border-navy-700 focus-visible:ring-2 focus-visible:ring-navy-700/25 disabled:bg-paper disabled:text-muted'

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(controlClass, className)} {...props} />
}
