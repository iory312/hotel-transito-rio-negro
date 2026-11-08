import { cn } from '@/lib/utils.ts'

export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={cn('h-10 w-10 shrink-0', className)} aria-hidden="true">
      <rect width="48" height="48" rx="4" className="fill-navy-950" />
      <rect x="4" y="4" width="40" height="40" rx="2" fill="none" stroke="#a68445" strokeWidth="1.5" />
      <path
        fill="#f3e6c8"
        d="M13 34V15h8.4c5 0 8 2.8 8 6.8s-3 6.8-8 6.8H17.2V34H13zm4.2-8.6h3.8c2.8 0 4.4-1.2 4.4-3.2s-1.6-3.2-4.4-3.2h-3.8v6.4z"
      />
      <path fill="#a68445" d="M32.5 15H36v19h-3.5z" />
    </svg>
  )
}
