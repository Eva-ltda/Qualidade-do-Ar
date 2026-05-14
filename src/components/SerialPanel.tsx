import { motion } from 'framer-motion'

export function SerialPanel() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="rounded-2xl bg-slate-950 p-5 text-slate-100 shadow-soft"
    >
      <div className="text-sm font-semibold">Formato Serial (CSV)</div>
      <div className="mt-1 text-xs text-slate-300">Envio de dados a cada 2 segundos</div>

      <div className="mt-4 grid grid-cols-1 gap-2 text-sm">
        <div className="rounded-xl bg-white/5 px-3 py-2 ring-1 ring-white/10">1: Temperatura Interna (°C)</div>
        <div className="rounded-xl bg-white/5 px-3 py-2 ring-1 ring-white/10">2: Umidade Interna (%)</div>
        <div className="rounded-xl bg-white/5 px-3 py-2 ring-1 ring-white/10">3: Pressão Interna (hPa)</div>
        <div className="rounded-xl bg-white/5 px-3 py-2 ring-1 ring-white/10">4: VOC Interno (KΩ)</div>
        <div className="rounded-xl bg-white/5 px-3 py-2 ring-1 ring-white/10">5: Temperatura Externa (°C)</div>
        <div className="rounded-xl bg-white/5 px-3 py-2 ring-1 ring-white/10">6: Umidade Externa (%)</div>
        <div className="rounded-xl bg-white/5 px-3 py-2 ring-1 ring-white/10">7: Pressão Externa (hPa)</div>
        <div className="rounded-xl bg-white/5 px-3 py-2 ring-1 ring-white/10">8: VOC Externo (KΩ)</div>
      </div>
    </motion.div>
  )
}

