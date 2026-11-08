import { formatMoney } from '@/lib/money.ts'
import type { Bill } from '@/lib/types.ts'

export function BillingCard({ bill }: { bill: Bill }) {
  const balanceLabel = bill.balance > 0 ? 'Saldo pendente' : bill.balance < 0 ? 'Crédito do hóspede' : 'Quitado'
  return (
    <section className="rounded-lg border border-line bg-card p-4 shadow-sm" aria-live="polite">
      <h2 className="font-display text-2xl text-navy-900">Conta da estada</h2>
      <p className="mt-1 text-sm leading-5 text-muted">
        O titular sempre paga. Dependente com mais de {bill.exemptionAge} anos na data de entrada também paga. Com{' '}
        {bill.exemptionAge} anos ou menos, é isento.
      </p>
      {bill.pendingMessage ? <p className="mt-3 text-sm text-navy-800">{bill.pendingMessage}</p> : null}
      <ul className="mt-3 divide-y divide-line border-y border-line">
        {bill.lines.map((line, index) => (
          <li key={`${line.role}-${index}`} className="flex items-start justify-between gap-3 py-2 text-sm">
            <span>
              <span className="font-semibold">{line.name}</span>
              <span className="block text-muted">
                {line.role === 'titular' ? 'Titular' : line.age === null ? 'Dependente' : `Dependente · ${line.age} anos`}
              </span>
            </span>
            <span className={line.pays ? 'font-semibold text-navy-800' : 'text-ok'}>{line.pays ? 'Pagante' : 'Isento'}</span>
          </li>
        ))}
      </ul>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-muted">Noites</dt>
          <dd className="font-semibold">{bill.nights}</dd>
        </div>
        <div>
          <dt className="text-muted">Pagantes</dt>
          <dd className="font-semibold">{bill.payers}</dd>
        </div>
        <div>
          <dt className="text-muted">Diária</dt>
          <dd className="font-semibold">{bill.ready ? formatMoney(bill.dailyRate) : '—'}</dd>
        </div>
        <div>
          <dt className="text-muted">Recebido</dt>
          <dd className="font-semibold">{formatMoney(bill.paid)}</dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-muted">Total = diária × noites × pagantes</p>
      <p className="mt-1 font-display text-4xl text-navy-950" data-testid="billing-total">
        {formatMoney(bill.total)}
      </p>
      <p className={bill.balance > 0 ? 'text-sm font-semibold text-danger' : 'text-sm font-semibold text-ok'} data-testid="billing-balance">
        {balanceLabel}
        {bill.ready ? ` · ${formatMoney(Math.abs(bill.balance))}` : ''}
      </p>
    </section>
  )
}
