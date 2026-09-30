export const STABILIZATION_TIME_MS = 120_000
export const MEASUREMENT_SAMPLES = 10
export const MEASUREMENT_INTERVAL_MS = 2_000

export type MeasurementLocation = 'INTERNO' | 'EXTERNO'

export type SavedMeasurement = {
  location: MeasurementLocation
  temperature: number
  humidity: number
  pressure: number
  voc: number
  vocIndex: number
  receivedAt: number
}

export type MeasurementState = 'idle' | 'stabilizing' | 'ready' | 'sampling' | 'saved'
