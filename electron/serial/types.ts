export type SerialConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error'

export type SensorFrame = {
  tempInterno: number
  humInterno: number
  pressInterno: number
  vocInterno: number
  tempExterno: number
  humExterno: number
  pressExterno: number
  vocExterno: number
  raw: string
  receivedAt: number
}

export type ConnectionStatus = {
  state: SerialConnectionState
  portPath?: string
  error?: string
  lastReceivedAt?: number
}
