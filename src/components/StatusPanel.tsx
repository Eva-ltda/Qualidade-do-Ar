import { motion } from 'framer-motion'
import { getQualityTone, getStatusMessage } from '../lib/airQuality'

type Props = {
  internalLabel: 'Excelente' | 'Boa' | 'Moderada' | 'Ruim'
  externalLabel: 'Excelente' | 'Boa' | 'Moderada' | 'Ruim'
}

function StatusRow({ title, label }: { title: string; label: Props['internalLabel'] }) {
  const tone = getQualityTone(label)
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-white p-3 ring-1 ring-slate-200">
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <div className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 bg-slate-50 ${tone.text} ring-slate-200`}>
        {label}
      </div>
    </div>
  )
}

export function StatusPanel({ internalLabel, externalLabel }: Props) {
  const message = getStatusMessage(internalLabel, externalLabel)

  return (
    <motion.aside
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="rounded-2xl bg-white p-5 shadow-card ring-1 ring-slate-200"
    >
      <div className="text-sm font-semibold text-slate-900">Status dos Ambientes</div>
      <div className="mt-1 text-xs text-slate-500">Análise automática baseada em VOC</div>

      <div className="mt-4 space-y-3">
        <StatusRow title="Status interno" label={internalLabel} />
        <StatusRow title="Status externo" label={externalLabel} />
      </div>

      <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-700 ring-1 ring-slate-200">
        {message}
      </div>
    </motion.aside>
  )
}

