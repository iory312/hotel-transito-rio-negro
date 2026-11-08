import type { TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils.ts'

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'min-h-24 w-full rounded-md border border-line bg-white px-3 py-2 text-base text-ink outline-none focus-visible:border-navy-700 focus-visible:ring-2 focus-visible:ring-navy-700/25 disabled:bg-paper',
        className,
      )}
      {...props}
    />
  )
}
