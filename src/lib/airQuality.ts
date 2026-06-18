export type AirQualityLabel = 'Excelente' | 'Boa' | 'Moderada' | 'Ruim' | 'Muito Ruim'

export type AirQuality = {
  label: AirQualityLabel
  percent: number
}

export function vocToPPM(voc: number) {
  if (!Number.isFinite(voc) || voc <= 0) return 0
  return Math.round(1000 / Math.pow(voc / 10, 0.8))
}

export function getAirQualityFromVoc(voc: number): AirQuality {
  if (!Number.isFinite(voc) || voc <= 0) return { label: 'Muito Ruim', percent: 0 }
  if (voc > 100) return { label: 'Excelente', percent: 92 }
  if (voc > 60) return { label: 'Boa', percent: 74 }
  if (voc > 30) return { label: 'Moderada', percent: 52 }
  if (voc > 10) return { label: 'Ruim', percent: 28 }
  return { label: 'Muito Ruim', percent: 12 }
}

export function getQualityTone(label: AirQualityLabel) {
  if (label === 'Excelente') return { stroke: 'stroke-emerald-500', text: 'text-emerald-700' }
  if (label === 'Boa') return { stroke: 'stroke-green-500', text: 'text-green-700' }
  if (label === 'Moderada') return { stroke: 'stroke-amber-500', text: 'text-amber-700' }
  if (label === 'Ruim') return { stroke: 'stroke-orange-500', text: 'text-orange-700' }
  return { stroke: 'stroke-red-500', text: 'text-red-700' }
}

export function getStatusMessage(internal: AirQualityLabel, external: AirQualityLabel) {
  const score = (label: AirQualityLabel) => {
    if (label === 'Excelente') return 4
    if (label === 'Boa') return 3
    if (label === 'Moderada') return 2
    if (label === 'Ruim') return 1
    return 0
  }

  const min = Math.min(score(internal), score(external))
  if (min >= 3) return 'Ambientes ideais para atividades e boa qualidade de vida.'
  if (min === 2) return 'Qualidade moderada: considere ventilação e verifique possíveis fontes de VOC.'
  if (min === 1) return 'Qualidade ruim: aumente a ventilação e acompanhe o nível de gases/VOC.'
  return 'Qualidade muito ruim: recomenda-se ação imediata e inspeção das fontes de contaminação.'
}
