import type { ReactNode } from 'react'

export function EmptyState({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-line bg-card px-4 py-5" data-testid="empty-state">
      <p className="text-sm font-semibold text-ink">{title}</p>
      <p className="mt-1 max-w-xl text-sm leading-6 text-muted">{detail}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  )
}
