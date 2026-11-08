export function parseDailyRate(input: string): number | null {
  let text = input.trim().replace(/\s/g, '')
  if (!text) return null
  if (text.endsWith(',')) text = text.slice(0, -1)
  if (!text) return null
  const normalized = text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null
  const value = Number(normalized)
  if (!Number.isFinite(value) || value > 100000) return null
  return Math.round(value * 100) / 100
}

export function parsePaymentAmount(input: string): number | null {
  const value = parseDailyRate(input)
  if (value === null || value <= 0) return null
  return value
}

export function formatMoney(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

export function formatRateInput(value: number): string {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function moneyTotal(dailyRate: number, nights: number, payers: number): number {
  const cents = Math.round(dailyRate * 100)
  return (cents * nights * payers) / 100
}

export function sumMoney(values: number[]): number {
  const cents = values.reduce((total, value) => total + Math.round(value * 100), 0)
  return cents / 100
}
