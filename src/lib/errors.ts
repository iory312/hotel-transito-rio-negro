import { DomainError } from '@/lib/domain.ts'

const SAFE_PREFIXES = [
  'A saída',
  'O período',
  'Quarto ',
  'Reserva ',
  'Não é',
  'Informe ',
  'Preencha ',
  'Dependente ',
  'Data de ',
  'Limite ',
  'Este quarto',
  'NIP ',
  'Transição ',
  'Forma ',
  'Pagamento ',
  'Hóspede ',
  'Acesso ',
  'Sessão ',
  'Bloqueio ',
  'Gravação ',
  'Há campos',
  'Dados inválidos',
  'Já existe',
  'A idade',
]

export function publicError(message: string | undefined, fallback: string): string {
  if (!message) return fallback
  const firstLine = message.split('\n')[0]?.replace(/^[A-Z0-9]{5}:\s*/, '').trim() ?? ''
  if (!firstLine || /jwt|password|stack|relation |syntax error|secret|service_role/i.test(firstLine)) return fallback
  if (SAFE_PREFIXES.some((prefix) => firstLine.startsWith(prefix))) return firstLine
  if (/failed to fetch|networkerror|load failed/i.test(message)) return 'Sem conexão com o banco.'
  return fallback
}

export function toUserMessage(error: unknown, fallback: string): string {
  if (error instanceof DomainError) return error.message
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return publicError(error.message, fallback)
  }
  return fallback
}
