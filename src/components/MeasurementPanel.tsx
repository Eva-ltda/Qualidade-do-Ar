import { motion } from 'framer-motion'
import { Thermometer, Droplets, Gauge, Wind, Loader2, CheckCircle2, Timer, AlertTriangle } from 'lucide-react'
import { useMemo } from 'react'
import { SensorCard } from './SensorCard'
import { formatDuration, formatNumber, formatInt } from '../lib/format'
import { getAirQualityFromVoc, vocToPPM } from '../lib/airQuality'

type Props = {
  location: MeasurementLocation
  lastFrame: SensorFrame | null | undefined
  measurementState: MeasurementState
  stabilizationEndsAt: number | undefined
  now: number
  arduinoState?: ArduinoConnectionState
  confirmedLocation?: MeasurementLocation
}

const STABILIZATION_HINT_DEFAULT =
  'Aguarde o BME680 ajustar a temperatura do componente. Isso garante leituras VOC consistentes durante a coleta.'

const STATE_LABEL: Record<MeasurementState, { label: string; tone: string; icon: typeof Loader2 }> = {
  idle: { label: 'Aguardando primeiro dado', tone: 'text-slate-500 bg-slate-100 ring-slate-200', icon: Timer },
  stabilizing: { label: 'Estabilizando sensor…', tone: 'text-amber-700 bg-amber-50 ring-amber-200', icon: Loader2 },
  ready: { label: 'Coletando dados', tone: 'text-emerald-700 bg-emerald-50 ring-emerald-200', icon: CheckCircle2 },
  sampling: { label: 'Coletando amostras…', tone: 'text-indigo-700 bg-indigo-50 ring-indigo-200', icon: Loader2 },
  saved: { label: 'Coletando dados', tone: 'text-sky-700 bg-sky-50 ring-sky-200', icon: CheckCircle2 },
}

export function MeasurementPanel({
  location,
  lastFrame,
  measurementState,
  stabilizationEndsAt,
  now,
  arduinoState,
  confirmedLocation,
}: Props) {
  const state = STATE_LABEL[measurementState]
  const StateIcon = state.icon

  const stabilizationRemaining = useMemo(() => {
    if (measurementState !== 'stabilizing' || !stabilizationEndsAt) return 0
    return Math.max(0, stabilizationEndsAt - now)
  }, [measurementState, stabilizationEndsAt, now])

  const values = useMemo(() => {
    const temperature = lastFrame?.temperature
    const humidity = lastFrame?.humidity
    const pressure = lastFrame?.pressure
    const voc = Number.isFinite(lastFrame?.vocCorrigido ?? NaN) ? lastFrame!.vocCorrigido : lastFrame?.voc
    const quality = typeof voc === 'number' && Number.isFinite(voc) ? getAirQualityFromVoc(voc) : null
    return { temperature, humidity, pressure, voc, quality }
  }, [lastFrame])

  const hint = useMemo(() => {
    if (measurementState === 'stabilizing') {
      return `Aproximadamente ${formatDuration(stabilizationRemaining)} até o sensor estabilizar no ambiente ${location.toLowerCase()}.`
    }
    if (measurementState === 'ready' || measurementState === 'saved') {
      return `Sensor estabilizado no ambiente ${location.toLowerCase()}. Dados sendo coletados continuamente para histórico e exportação.`
    }
    return STABILIZATION_HINT_DEFAULT
  }, [measurementState, stabilizationRemaining, location])

  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="rounded-2xl bg-white p-5 shadow-card ring-1 ring-slate-200"
    >
      <header className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Sensor atual
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold text-slate-900">
              Ambiente {location === 'INTERNO' ? 'Interno' : 'Externo'}
            </h2>
            <span
              className={[
                'inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ring-1',
                state.tone,
              ].join(' ')}
            >
              <StateIcon className={state.label.includes('…') ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
              {state.label}
            </span>
            {measurementState === 'stabilizing' ? (
              <span className="rounded-full bg-slate-50 px-3 py-1 text-xs font-semibold tabular-nums text-slate-700 ring-1 ring-slate-200">
                {formatDuration(stabilizationRemaining)}
              </span>
            ) : null}
          </div>
        </div>
      </header>

      <p className="mt-4 flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-600 ring-1 ring-slate-100">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-amber-500" />
        <span>{hint}</span>
      </p>

      {arduinoState && arduinoState !== 'CONFIRMADO' ? (
        <div
          className={[
            'mt-4 flex items-center gap-3 rounded-xl px-3 py-2 text-xs font-semibold ring-1',
            arduinoState === 'AGUARDANDO_ACK'
              ? 'bg-amber-50 text-amber-800 ring-amber-200'
              : arduinoState === 'NAO_RESPONDEU'
                ? 'bg-rose-50 text-rose-800 ring-rose-200'
                : arduinoState === 'INCOMPATIVEL'
                  ? 'bg-fuchsia-50 text-fuchsia-800 ring-fuchsia-200'
                  : 'bg-slate-50 text-slate-700 ring-slate-200',
          ].join(' ')}
        >
          <Loader2 className={arduinoState === 'AGUARDANDO_ACK' ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
          <span>
            Arduino: {arduinoState}
            {confirmedLocation ? ` · ${confirmedLocation}` : ''}
          </span>
        </div>
      ) : null}

      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SensorCard
          title="Temperatura"
          value={formatNumber(values.temperature ?? NaN, 1)}
          unit="°C"
          icon={<Thermometer className="h-5 w-5 text-rose-600" strokeWidth={2} />}
          iconClassName=""
          barClassName="bg-gradient-to-r from-rose-400 to-red-500"
        />
        <SensorCard
          title="Umidade"
          value={formatInt(values.humidity ?? NaN)}
          unit="%"
          icon={<Droplets className="h-5 w-5 text-sky-600" strokeWidth={2} />}
          iconClassName=""
          barClassName="bg-gradient-to-r from-sky-400 to-blue-500"
        />
        <SensorCard
          title="Pressão"
          value={formatNumber(values.pressure ?? NaN, 1)}
          unit="hPa"
          icon={<Gauge className="h-5 w-5 text-violet-600" strokeWidth={2} />}
          iconClassName=""
          barClassName="bg-gradient-to-r from-violet-400 to-indigo-500"
        />
        <SensorCard
          title={`VOC ${values.quality ? `· ${values.quality.label}` : ''}`}
          value={formatNumber(values.voc ?? NaN, 1)}
          unit="kΩ"
          icon={<Wind className="h-5 w-5 text-emerald-700" strokeWidth={2} />}
          iconClassName={values.quality ? `text-${values.quality.tone} !bg-transparent` : ''}
          barClassName={values.quality?.bar ?? 'bg-gradient-to-r from-emerald-400 to-teal-500'}
        />
      </div>

      {values.quality ? (
        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-100">
            <div className="text-xs font-medium text-slate-500">Índice VOC estimado</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-semibold tracking-tight text-slate-900">
                {formatInt(vocToPPM(values.voc ?? NaN))}
              </span>
              <span className="text-xs font-semibold text-slate-500">ppm</span>
            </div>
          </div>
          <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-100">
            <div className="text-xs font-medium text-slate-500">Qualidade</div>
            <div className={`mt-1 text-2xl font-semibold tracking-tight ${values.quality.text}`}>
              {values.quality.label}
            </div>
          </div>
        </div>
      ) : null}
    </motion.section>
  )
}
