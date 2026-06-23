export type AirQualityLabel = 'Excelente' | 'Boa' | 'Moderada' | 'Ruim' | 'Muito Ruim'

export type AirQuality = {
  label: AirQualityLabel
  percent: number
}

const VOC_TO_PPM_TABLE = [
  { voc: 10, ppm: 370 },
  { voc: 20, ppm: 274 },
  { voc: 30, ppm: 203 },
  { voc: 40, ppm: 150 },
  { voc: 50, ppm: 112 },
  { voc: 60, ppm: 83 },
  { voc: 70, ppm: 61 },
  { voc: 80, ppm: 45 },
  { voc: 100, ppm: 25 },
]

function mapRange(value: number, inMin: number, inMax: number, outMin: number, outMax: number) {
  if (inMax === inMin) return outMin
  const ratio = (value - inMin) / (inMax - inMin)
  return outMin + ratio * (outMax - outMin)
}

export function vocToPPM(voc: number) {
  if (!Number.isFinite(voc) || voc <= 0) return 0

  for (let i = 0; i < VOC_TO_PPM_TABLE.length - 1; i += 1) {
    const current = VOC_TO_PPM_TABLE[i]
    const next = VOC_TO_PPM_TABLE[i + 1]

    if (voc >= current.voc && voc <= next.voc) {
      return Math.max(0, Math.round(mapRange(voc, current.voc, next.voc, current.ppm, next.ppm)))
    }
  }

  const first = VOC_TO_PPM_TABLE[0]
  const second = VOC_TO_PPM_TABLE[1]
  if (voc < first.voc) {
    return Math.max(0, Math.round(mapRange(voc, first.voc, second.voc, first.ppm, second.ppm)))
  }

  const last = VOC_TO_PPM_TABLE[VOC_TO_PPM_TABLE.length - 1]
  const previous = VOC_TO_PPM_TABLE[VOC_TO_PPM_TABLE.length - 2]
  return Math.max(0, Math.round(mapRange(voc, previous.voc, last.voc, previous.ppm, last.ppm)))
}

function ppmToPercent(ppm: number) {
  if (!Number.isFinite(ppm) || ppm <= 0) return 100
  if (ppm <= 65) return Math.round(mapRange(ppm, 0, 65, 100, 81))
  if (ppm <= 150) return Math.round(mapRange(ppm, 65, 150, 80, 61))
  if (ppm <= 300) return Math.round(mapRange(ppm, 150, 300, 60, 41))
  if (ppm <= 500) return Math.round(mapRange(ppm, 300, 500, 40, 21))
  return Math.max(0, Math.round(mapRange(Math.min(ppm, 1000), 500, 1000, 20, 0)))
}

export function getAirQualityFromVoc(voc: number): AirQuality {
  if (!Number.isFinite(voc) || voc <= 0) return { label: 'Muito Ruim', percent: 0 }

  const ppm = vocToPPM(voc)
  const percent = ppmToPercent(ppm)

  if (ppm <= 65) return { label: 'Excelente', percent }
  if (ppm <= 150) return { label: 'Boa', percent }
  if (ppm <= 300) return { label: 'Moderada', percent }
  if (ppm <= 500) return { label: 'Ruim', percent }
  return { label: 'Muito Ruim', percent }
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
