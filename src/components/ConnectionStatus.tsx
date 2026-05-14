import { AlertTriangle, CheckCircle2, Loader2, Unplug } from 'lucide-react'

export function ConnectionStatus({ status }: { status: ConnectionStatus }) {
  const ui =
    status.state === 'connected'
      ? { label: 'Conectado', Icon: CheckCircle2, cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' }
      : status.state === 'connecting'
        ? { label: 'Conectando', Icon: Loader2, cls: 'bg-slate-50 text-slate-700 ring-slate-200' }
        : status.state === 'error'
          ? { label: 'Erro', Icon: AlertTriangle, cls: 'bg-red-50 text-red-700 ring-red-200' }
          : { label: 'Desconectado', Icon: Unplug, cls: 'bg-slate-50 text-slate-600 ring-slate-200' }

  return (
    <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ring-1 ${ui.cls}`}>
      <ui.Icon className={ui.label === 'Conectando' ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
      <span>{ui.label}</span>
    </div>
  )
}

