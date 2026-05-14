export {}

declare global {
  type SerialConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error'

  type ConnectionStatus = {
    state: SerialConnectionState
    portPath?: string
    error?: string
    lastReceivedAt?: number
  }

  type SensorFrame = {
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

  type SerialPortInfo = {
    path: string
    manufacturer?: string
    serialNumber?: string
    vendorId?: string
    productId?: string
    friendlyName?: string
  }

  type ExportResult =
    | { ok: true; filePath: string }
    | { ok: false; canceled: true }
    | { ok: false; error?: string }

  type Unsubscribe = () => void

  interface Window {
    eva: {
      listPorts(): Promise<SerialPortInfo[]>
      getStatus(): Promise<ConnectionStatus>
      getLastPort(): Promise<string | undefined>
      connect(portPath: string): Promise<boolean>
      disconnect(): Promise<boolean>
      exportCsv(csvText: string): Promise<ExportResult>
      onFrame(handler: (frame: SensorFrame) => void): Unsubscribe
      onStatus(handler: (status: ConnectionStatus) => void): Unsubscribe
    }
  }
}
