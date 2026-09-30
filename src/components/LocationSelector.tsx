import { motion } from 'framer-motion'
import { Loader2 } from 'lucide-react'

type Props = {
  current: MeasurementLocation
  onChange: (next: MeasurementLocation) => void
  disabled?: boolean
  arduinoState?: ArduinoConnectionState
  confirmedLocation?: MeasurementLocation
}

export function LocationSelector({ current, onChange, disabled, arduinoState, confirmedLocation }: Props) {
  const items: Array<{ key: MeasurementLocation; label: string; hint: string }> = [
    {
      key: 'INTERNO',
      label: 'Interno',
      hint: 'Ambiente interno',
    },
    {
      key: 'EXTERNO',
      label: 'Externo',
      hint: 'Ambiente externo',
    },
  ]

  const hintFor = (key: MeasurementLocation) => {
    if (arduinoState === 'AGUARDANDO_ACK' && current === key) {
      return 'Solicitando mudança… Arduino ainda não confirmou'
    }
    if (arduinoState === 'NAO_RESPONDEU' && current === key) {
      return 'Arduino não respondeu. Verifique a conexão e tente novamente.'
    }
    if (confirmedLocation === key && arduinoState === 'CONFIRMADO') {
      return 'Confirmado pelo Arduino'
    }
    return items.find((i) => i.key === key)?.hint ?? ''
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {items.map((item) => {
        const active = current === item.key
        return (
          <motion.button
            key={item.key}
            type="button"
            whileTap={disabled ? undefined : { scale: 0.985 }}
            whileHover={disabled ? undefined : { y: -1 }}
            disabled={disabled}
            onClick={() => onChange(item.key)}
            className={[
              'group relative flex items-center gap-3 rounded-2xl border p-4 text-left transition',
              active
                ? 'border-transparent bg-white shadow-card ring-2 ring-slate-900/10'
                : 'border-slate-200 bg-white/60 hover:bg-white hover:ring-1 hover:ring-slate-200',
              disabled ? 'cursor-not-allowed opacity-60' : '',
            ].join(' ')}
          >
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-base font-semibold text-slate-900">{item.label}</span>
                {active && arduinoState === 'AGUARDANDO_ACK' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />
                ) : null}
              </div>
              <div className="mt-1 text-xs text-slate-500">{hintFor(item.key)}</div>
            </div>
            <div
              className={[
                'h-3.5 w-3.5 rounded-full ring-2 ring-offset-2 ring-offset-white transition',
                active ? 'bg-emerald-500 ring-emerald-300' : 'bg-slate-200 ring-slate-100',
              ].join(' ')}
            />
          </motion.button>
        )
      })}
    </div>
  )
}

