export type MeasurementLocation = 'INTERNO' | 'EXTERNO'

export type SerialConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error'

export type SerialControlType = 'ACK' | 'STATUS' | 'PONG' | 'PING_TIMEOUT' | 'SET_LOCAL_TIMEOUT' | 'TX_SENT' | 'COMMAND_ERROR'

export type SerialControlEvent =
  | { type: 'ACK'; location: MeasurementLocation; raw: string; receivedAt: number }
  | { type: 'STATUS'; location: MeasurementLocation; raw: string; receivedAt: number }
  | { type: 'PONG'; raw: string; receivedAt: number }
  | { type: 'PING_TIMEOUT'; raw?: string; receivedAt: number }
  | { type: 'SET_LOCAL_TIMEOUT'; location?: MeasurementLocation; receivedAt: number }
  | { type: 'TX_SENT'; raw: string; receivedAt: number }
  | { type: 'COMMAND_ERROR'; error: string; raw?: string; receivedAt: number }

export type SerialLineKind = 'control' | 'data' | 'info' | 'command_error'

export type SensorFrame = {
  location: MeasurementLocation
  temperature: number
  humidity: number
  pressure: number
  voc: number
  vocReal: number
  vocCorrigido: number
  tempInterno: number
  humInterno: number
  pressInterno: number
  vocInterno: number
  vocInternoReal: number
  vocInternoCorrigido: number
  tempExterno: number
  humExterno: number
  pressExterno: number
  vocExterno: number
  vocExternoReal: number
  vocExternoCorrigido: number
  raw: string
  receivedAt: number
}

export type SerialRawLine = {
  text: string
  receivedAt: number
  direction?: 'tx' | 'rx'
  kind?: SerialLineKind
}

export type ConnectionStatus = {
  state: SerialConnectionState
  portPath?: string
  error?: string
  lastReceivedAt?: number
}

