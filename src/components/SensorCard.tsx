import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

type Props = {
  title: string
  value: string
  unit: string
  icon: ReactNode
  iconClassName: string
  barClassName: string
}

export function SensorCard({ title, value, unit, icon, iconClassName, barClassName }: Props) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="relative overflow-hidden rounded-2xl bg-white p-4 shadow-card ring-1 ring-slate-200"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-medium text-slate-500">{title}</div>
          <div className="mt-1 flex items-baseline gap-2">
            <motion.div
              key={value}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="text-2xl font-semibold tracking-tight text-slate-900"
            >
              {value}
            </motion.div>
            <div className="text-xs font-semibold text-slate-500">{unit}</div>
          </div>
        </div>

        <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 ring-1 ring-slate-200 ${iconClassName}`}>
          {icon}
        </div>
      </div>
      <div className={`absolute bottom-0 left-0 h-1.5 w-full ${barClassName}`} />
    </motion.div>
  )
}

