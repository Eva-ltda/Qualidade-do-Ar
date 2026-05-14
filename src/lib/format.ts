export function formatNumber(value: number, decimals = 1) {
  if (Number.isNaN(value) || !Number.isFinite(value)) return '--'
  return value.toFixed(decimals)
}

export function formatInt(value: number) {
  if (Number.isNaN(value) || !Number.isFinite(value)) return '--'
  return Math.round(value).toString()
}

export function formatTime(ts: number | undefined) {
  if (!ts) return '--:--:--'
  return new Date(ts).toLocaleTimeString('pt-BR', { hour12: false })
}
