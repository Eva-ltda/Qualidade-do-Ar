export function formatNumber(value: number, decimals = 1) {
  if (Number.isNaN(value) || !Number.isFinite(value)) return '--'
  return value.toFixed(decimals).replace('.', ',')
}

export function formatInt(value: number) {
  if (Number.isNaN(value) || !Number.isFinite(value)) return '--'
  return Math.round(value).toString()
}

export function formatTime(ts: number | undefined) {
  if (!ts) return '--:--:--'
  return new Date(ts).toLocaleTimeString('pt-BR', { hour12: false })
}

export function formatDateTime(ts: number | undefined) {
  if (!ts) return '--'
  return new Date(ts).toLocaleString('pt-BR', { hour12: false })
}

export function formatDuration(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

