import { motion } from 'framer-motion'

export function SerialPanel() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="rounded-2xl bg-slate-950 p-5 text-slate-100 shadow-soft"
    >
      <div className="text-sm font-semibold">Formato Serial</div>
      <div className="mt-1 text-xs text-slate-300">
        Envio a cada 2s · 9600 baud · 1 sensor mede ambientes sequencialmente
      </div>

      <div className="mt-4 space-y-4 text-xs">
        <div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-cyan-300">
            Protocolo Bidirecional
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-xl bg-white/5 p-3 ring-1 ring-cyan-500/30">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-cyan-400">
                Dashboard → Arduino
              </div>
              <div className="space-y-1 font-mono text-[11px]">
                <div className="text-cyan-200">SET_LOCAL:INTERNO\n</div>
                <div className="text-cyan-200">SET_LOCAL:EXTERNO\n</div>
                <div className="text-cyan-200">STATUS\n</div>
                <div className="text-cyan-200">PING\n</div>
              </div>
            </div>
            <div className="rounded-xl bg-white/5 p-3 ring-1 ring-emerald-500/30">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
                Arduino → Dashboard
              </div>
              <div className="space-y-1 font-mono text-[11px]">
                <div className="text-emerald-200">ACK:INTERNO</div>
                <div className="text-emerald-200">ACK:EXTERNO</div>
                <div className="text-emerald-200">STATUS:INTERNO</div>
                <div className="text-emerald-200">STATUS:EXTERNO</div>
                <div className="text-emerald-200">PONG</div>
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-emerald-300">
            Formato dados (5 campos · pt-BR)
          </div>
          <div className="rounded-xl bg-white/5 px-3 py-2 font-mono ring-1 ring-emerald-500/30">
            LOCAL;TEMPERATURA;UMIDADE;PRESSAO;VOC_KOHM
          </div>
          <div className="mt-2 rounded-xl bg-white/5 px-3 py-2 font-mono ring-1 ring-white/10">
            INTERNO;25,60;61,30;955,40;54,20
          </div>
          <div className="mt-2 grid grid-cols-1 gap-2 text-[11px] text-slate-300">
            <div>1. LOCAL: INTERNO ou EXTERNO</div>
            <div>2. TEMPERATURA: °C (vírgula decimal)</div>
            <div>3. UMIDADE: % (vírgula decimal)</div>
            <div>4. PRESSAO: hPa (vírgula decimal)</div>
            <div>5. VOC_KOHM: KΩ (vírgula decimal)</div>
          </div>
        </div>

        <div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-amber-300">
            Compatibilidade temporária (legado 8/10 campos)
          </div>
          <div className="rounded-xl bg-white/5 px-3 py-2 font-mono ring-1 ring-white/10">
            tempInt,humInt,pressInt,vocIntReal,vocIntCorr,tempExt,humExt,pressExt,vocExtReal,vocExtCorr
          </div>
        </div>
      </div>
    </motion.div>
  )
}
