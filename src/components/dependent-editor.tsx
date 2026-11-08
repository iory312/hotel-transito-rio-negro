import { Field } from '@/components/field.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Input } from '@/components/ui/input.tsx'

export interface DependentRow {
  key: string
  fullName: string
  birthDate: string
}

export function DependentEditor({
  rows,
  onChange,
  disabled,
}: {
  rows: DependentRow[]
  onChange: (rows: DependentRow[]) => void
  disabled?: boolean
}) {
  return (
    <div className="flex flex-col gap-3">
      {rows.map((dependent, index) => (
        <div key={dependent.key} className="grid gap-2 rounded-md border border-line p-3 sm:grid-cols-[1fr_11rem_auto]">
          <Field id={`dep-name-${dependent.key}`} label="Nome">
            <Input
              id={`dep-name-${dependent.key}`}
              value={dependent.fullName}
              disabled={disabled}
              onChange={(event) =>
                onChange(rows.map((row) => (row.key === dependent.key ? { ...row, fullName: event.target.value } : row)))
              }
            />
          </Field>
          <Field id={`dep-birth-${dependent.key}`} label="Nascimento">
            <Input
              id={`dep-birth-${dependent.key}`}
              type="date"
              value={dependent.birthDate}
              disabled={disabled}
              onChange={(event) =>
                onChange(rows.map((row) => (row.key === dependent.key ? { ...row, birthDate: event.target.value } : row)))
              }
            />
          </Field>
          <Button
            type="button"
            variant="outline"
            className="sm:self-end"
            disabled={disabled}
            onClick={() => onChange(rows.filter((row) => row.key !== dependent.key))}
          >
            Remover {index + 1}
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        data-testid="dependent-add"
        disabled={disabled}
        onClick={() => onChange([...rows, { key: crypto.randomUUID(), fullName: '', birthDate: '' }])}
      >
        Adicionar dependente
      </Button>
    </div>
  )
}
