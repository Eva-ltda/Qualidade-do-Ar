export type SerialConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error'

export type SensorFrame = {
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

export type ConnectionStatus = {
  state: SerialConnectionState
  portPath?: string
  error?: string
  lastReceivedAt?: number
}
