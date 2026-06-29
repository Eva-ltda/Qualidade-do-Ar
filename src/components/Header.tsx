import { useEffect, useMemo, useState } from 'react'
import { Download, RefreshCw } from 'lucide-react'
import { ConnectionStatus } from './ConnectionStatus'
import { formatTime } from '../lib/format'

const evaLogoUrl = new URL('../../Logo.png', import.meta.url).toString()

async function removeNearBlackBackground(src: string) {
  const img = new Image()
  img.decoding = 'async'

  const loaded = await new Promise<HTMLImageElement>((resolve, reject) => {
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Falha ao carregar logo'))
    img.src = src
  })

  const w = loaded.naturalWidth
  const h = loaded.naturalHeight
  if (!w || !h) return src

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return src

  ctx.drawImage(loaded, 0, 0)
  const imageData = ctx.getImageData(0, 0, w, h)
  const data = imageData.data

  const threshold = 42
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const a = data[i + 3]
    if (a === 0) continue
    if (r < threshold && g < threshold && b < threshold) {
      data[i + 3] = 0
    }
  }

  ctx.putImageData(imageData, 0, 0)
  return canvas.toDataURL('image/png')
}

type Props = {
  ports: SerialPortInfo[]
  selectedPort: string
  onSelectPort: (portPath: string) => void
  onRefreshPorts: () => void
  onExport: () => void
  onBackup: () => void
  onConnect: (portPath?: string) => void
  status: ConnectionStatus
  lastReceivedAt?: number
  lastRaw?: string
  updateValue: number
  onUpdateValueChange: (value: number) => void
  updateUnit: 'seconds' | 'minutes' | 'hours'
  onUpdateUnitChange: (value: 'seconds' | 'minutes' | 'hours') => void
}

export function Header({
  ports,
  selectedPort,
  onSelectPort,
  onRefreshPorts,
  onExport,
  onBackup,
  onConnect,
  status,
  lastReceivedAt,
  lastRaw,
  updateValue,
  onUpdateValueChange,
  updateUnit,
  onUpdateUnitChange,
}: Props) {
  const [clock, setClock] = useState(() => Date.now())
  const [logoSrc, setLogoSrc] = useState<string>(evaLogoUrl)

  useEffect(() => {
    const t = setInterval(() => setClock(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    let cancelled = false
    removeNearBlackBackground(evaLogoUrl)
      .then((processed) => {
        if (!cancelled) setLogoSrc(processed)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const portLabel = useMemo(() => {
    const currentPort = selectedPort || status.portPath || ''
    if (!currentPort) return 'Selecionar COM'
    const p = ports.find((x) => x.path === currentPort)
    if (!p) return currentPort
    return p.friendlyName ? `${p.path} — ${p.friendlyName}` : p.manufacturer ? `${p.path} — ${p.manufacturer}` : p.path
  }, [ports, selectedPort, status.portPath])

  const updateLabel = useMemo(() => {
    const unitLabel = updateUnit === 'seconds' ? 'segundos' : updateUnit === 'minutes' ? 'minutos' : 'horas'
    return `${updateValue} ${unitLabel}`
  }, [updateUnit, updateValue])

  const selectValue = selectedPort || status.portPath || ''

  const portOptions = useMemo(() => {
    const map = new Map<string, SerialPortInfo>()
    for (const port of ports) map.set(port.path, port)

    if (selectValue && !map.has(selectValue)) {
      map.set(selectValue, { path: selectValue })
    }

    return Array.from(map.values())
  }, [ports, selectValue])

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/85 backdrop-blur">
      <div className="mx-auto max-w-[1400px] px-6 py-4">
        <div className="flex items-start justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl bg-white shadow-card ring-1 ring-slate-200">
              <img src={logoSrc} alt="Eva LTDA" className="h-full w-full object-contain" />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold text-slate-900">Eva LTDA</div>
              <div className="text-xl font-semibold text-slate-900">Dashboard Qualidade do Ar</div>
              <div className="text-sm text-slate-500">Monitoramento com Arduino + 2 Sensores BME680</div>
            </div>
          </div>

          <div className="flex w-[560px] flex-col items-end gap-3">
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={onBackup}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-card transition hover:bg-emerald-500"
              >
                <Download className="h-4 w-4" />
                Backup
              </button>
              <button
                type="button"
                onClick={onExport}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-card transition hover:bg-slate-800"
              >
                <Download className="h-4 w-4" />
                Exportar
              </button>

              <ConnectionStatus status={status} />

              <div className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-card ring-1 ring-slate-200">
                {new Date(clock).toLocaleTimeString('pt-BR', { hour12: false })}
              </div>
            </div>

            <div className="grid w-full grid-cols-12 gap-2">
              <div className="col-span-7 rounded-xl bg-white px-3 py-2 shadow-card ring-1 ring-slate-200">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[11px] font-medium text-slate-500">Porta COM</div>
                    <div className="truncate text-sm font-semibold text-slate-900">{portLabel}</div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={onRefreshPorts}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-50 text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-100"
                      aria-label="Atualizar portas"
                      title="Atualizar portas"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </button>

                    <select
                      value={selectValue}
                      onChange={(e) => {
                        const value = e.target.value
                        onSelectPort(value)
                        if (value) onConnect(value)
                      }}
                      className="h-9 w-[180px] rounded-lg bg-white px-2 text-sm font-medium text-slate-900 ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900/20"
                    >
                      <option value="">Selecionar...</option>
                      {portOptions.map((p) => (
                        <option key={p.path} value={p.path}>
                          {p.path}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="col-span-5 rounded-xl bg-white px-3 py-2 shadow-card ring-1 ring-slate-200">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-[11px] font-medium text-slate-500">Atualização</div>
                    <div className="text-sm font-semibold text-slate-900">{updateLabel}</div>
                  </div>
                  <div>
                    <div className="text-[11px] font-medium text-slate-500">Últimos dados</div>
                    <div className="text-sm font-semibold text-slate-900">{formatTime(lastReceivedAt)}</div>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2 rounded-lg bg-slate-50 px-2 py-2 ring-1 ring-slate-200">
                  <input
                    type="number"
                    min={1}
                    value={updateValue}
                    onChange={(e) => onUpdateValueChange(Number(e.target.value) || 1)}
                    className="w-14 bg-transparent text-right text-xs font-semibold text-slate-900 outline-none"
                  />
                  <select
                    value={updateUnit}
                    onChange={(e) => onUpdateUnitChange(e.target.value as 'seconds' | 'minutes' | 'hours')}
                    className="min-w-0 flex-1 bg-transparent text-xs font-semibold text-slate-900 outline-none"
                  >
                    <option value="seconds">Segundos</option>
                    <option value="minutes">Minutos</option>
                    <option value="hours">Horas</option>
                  </select>
                </div>
                <div className="mt-2 truncate text-[11px] text-slate-500">{lastRaw ?? 'Aguardando dados CSV...'}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
