export type AirQualityLabel = 'Excelente' | 'Boa' | 'Moderada' | 'Ruim'

export type AirQuality = {
  label: AirQualityLabel
  percent: number
}

export function getAirQualityFromVoc(voc: number): AirQuality {
  if (!Number.isFinite(voc)) return { label: 'Ruim', percent: 0 }
  if (voc > 100) return { label: 'Excelente', percent: 87 }
  if (voc > 60) return { label: 'Boa', percent: 72 }
  if (voc > 30) return { label: 'Moderada', percent: 52 }
  return { label: 'Ruim', percent: 20 }
}

export function getQualityTone(label: AirQualityLabel) {
  if (label === 'Excelente') return { stroke: 'stroke-emerald-500', text: 'text-emerald-700' }
  if (label === 'Boa') return { stroke: 'stroke-green-500', text: 'text-green-700' }
  if (label === 'Moderada') return { stroke: 'stroke-amber-500', text: 'text-amber-700' }
  return { stroke: 'stroke-red-500', text: 'text-red-700' }
}

export function getStatusMessage(internal: AirQualityLabel, external: AirQualityLabel) {
  const score = (label: AirQualityLabel) => {
    if (label === 'Excelente') return 4
    if (label === 'Boa') return 3
    if (label === 'Moderada') return 2
    return 1
  }

  const min = Math.min(score(internal), score(external))
  if (min >= 3) return 'Ambientes ideais para atividades e boa qualidade de vida.'
  if (min === 2) return 'Qualidade moderada: considere ventilação e verifique possíveis fontes de VOC.'
  return 'Qualidade baixa: recomenda-se ventilação imediata e inspeção de fontes de gases/VOC.'
}
