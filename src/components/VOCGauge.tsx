import { animate, motion, useMotionValue, useTransform } from 'framer-motion'
import { useEffect } from 'react'
import { getQualityTone, vocToPPM } from '../lib/airQuality'
import { formatNumber } from '../lib/format'

type Props = {
  title: string
  vocCalibrado: number
  quality: { label: 'Excelente' | 'Boa' | 'Moderada' | 'Ruim' | 'Muito Ruim'; percent: number }
}

export function VOCGauge({ title, vocCalibrado, quality }: Props) {
  const size = 180
  const stroke = 14
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const p = Math.max(0, Math.min(100, quality.percent))
  const offset = c - (p / 100) * c
  const tone = getQualityTone(quality.label)
  const ppm = vocToPPM(vocCalibrado)

  const percentMv = useMotionValue(0)
  const percentText = useTransform(percentMv, (v) => `${Math.round(v)}%`)

  useEffect(() => {
    const controls = animate(percentMv, p, { duration: 0.7, ease: 'easeOut' })
    return () => controls.stop()
  }, [p, percentMv])

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="rounded-2xl bg-white p-5 shadow-card ring-1 ring-slate-200"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-slate-900">{title}</div>
          <div className="mt-1 text-xs text-slate-500">Indicador baseado em VOC calibrado</div>
        </div>
        <div className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${tone.text} ring-slate-200 bg-slate-50`}>
          {quality.label}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-12 items-center gap-6">
        <div className="col-span-6 flex items-center justify-center">
          <div className="relative">
            <svg width={size} height={size} className="block">
              <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} className="fill-none stroke-slate-100" />
              <motion.circle
                cx={size / 2}
                cy={size / 2}
                r={r}
                strokeWidth={stroke}
                strokeLinecap="round"
                className={`fill-none ${tone.stroke}`}
                style={{ rotate: -90, transformOrigin: '50% 50%', strokeDasharray: c }}
                initial={{ strokeDashoffset: c }}
                animate={{ strokeDashoffset: offset }}
                transition={{ type: 'spring', stiffness: 120, damping: 20 }}
              />
            </svg>

            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <motion.div className="text-4xl font-semibold tracking-tight text-slate-900">{percentText}</motion.div>
              <div className="mt-1 text-xs font-medium text-slate-500">Qualidade</div>
            </div>
          </div>
        </div>

        <div className="col-span-6">
          <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
            <div className="text-xs font-medium text-slate-500">VOC Calibrado</div>
            <div className="mt-1 flex items-baseline gap-2">
              <motion.div
                key={vocCalibrado}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
                className="text-2xl font-semibold text-slate-900"
              >
                {formatNumber(vocCalibrado, 2)}
              </motion.div>
              <div className="text-xs font-semibold text-slate-500">KΩ</div>
            </div>

            <div className="mt-4">
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                <div className="grid h-full w-full grid-cols-5">
                  <div className="bg-emerald-500" />
                  <div className="bg-green-500" />
                  <div className="bg-amber-400" />
                  <div className="bg-orange-500" />
                  <div className="bg-red-500" />
                </div>
              </div>
              <div className="mt-3 rounded-xl bg-white/70 p-3 text-[11px] text-slate-600 ring-1 ring-slate-200">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Legenda de Qualidade
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-2 py-1 leading-4">
                    <span className="font-semibold">0–65 ppm</span>
                    <span>Excelente</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-2 py-1 leading-4">
                    <span className="font-semibold">66–150 ppm</span>
                    <span>Boa</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-2 py-1 leading-4">
                    <span className="font-semibold">151–300 ppm</span>
                    <span>Moderada</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-2 py-1 leading-4">
                    <span className="font-semibold">301–500 ppm</span>
                    <span>Ruim</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-2 py-1 leading-4">
                    <span className="font-semibold">&gt;500 ppm</span>
                    <span>Muito ruim</span>
                  </div>
                </div>
              </div>
              <div className="mt-3 text-[11px] text-slate-500">PPM calculado internamente: {ppm} ppm</div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
