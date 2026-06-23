import { motion } from 'framer-motion'
import { formatTime } from '../lib/format'

type Props = {
  portPath?: string
  status: ConnectionStatus
  lines: Array<{ id: string; ts: number; text: string }>
}

export function StatusPanel({ portPath, status, lines }: Props) {
  return (
    <motion.aside
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="rounded-2xl bg-white p-5 shadow-card ring-1 ring-slate-200"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">Monitor serial</div>
          <div className="mt-1 text-xs text-slate-500">
            {portPath ? `${portPath} • ${status.state}` : 'Aguardando conexão serial'}
          </div>
        </div>
        <div className="rounded-full bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">
          {lines.length} linhas
        </div>
      </div>

      <div className="mt-4 h-[344px] overflow-y-auto rounded-xl bg-slate-950 p-3 font-mono text-xs text-emerald-300 ring-1 ring-slate-800">
        {lines.length === 0 ? (
          <div className="text-slate-400">Nenhuma linha recebida ainda...</div>
        ) : (
          <div className="space-y-2">
            {lines.map((line) => (
              <div key={line.id} className="break-all rounded-lg bg-white/5 px-2 py-1.5">
                <span className="mr-2 text-slate-400">[{formatTime(line.ts)}]</span>
                <span>{line.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.aside>
  )
}
