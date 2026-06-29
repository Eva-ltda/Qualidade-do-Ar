export {}

declare global {
  type NotificationSettings = {
    enabled: boolean
    phoneNumber: string
    chatId?: string
    heartbeatIntervalMinutes: number
    staleTimeoutSeconds: number
  }

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

  type SerialRawLine = {
    text: string
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

  type NotificationActionResult = { ok: true } | { ok: false; error?: string }
  type NotificationRuntimeState = {
    lastSentAt?: number
    lastSentKind?: 'inicio' | 'intervalo' | 'parada' | 'reativacao' | 'teste'
    lastErrorAt?: number
    lastErrorMessage?: string
    nextNotificationAt?: number
    collectionState: 'aguardando' | 'coletando' | 'parada'
  }

  type Unsubscribe = () => void

  interface Window {
    eva: {
      listPorts(): Promise<SerialPortInfo[]>
      getStatus(): Promise<ConnectionStatus>
      getLastPort(): Promise<string | undefined>
      getNotificationSettings(): Promise<NotificationSettings>
      getNotificationRuntimeState(): Promise<NotificationRuntimeState>
      saveNotificationSettings(settings: NotificationSettings): Promise<NotificationSettings>
      testNotification(settings: NotificationSettings): Promise<NotificationActionResult>
      connect(portPath: string): Promise<boolean>
      disconnect(): Promise<boolean>
      exportCsv(csvText: string): Promise<ExportResult>
      backupCsv(csvText: string): Promise<ExportResult>
      onFrame(handler: (frame: SensorFrame) => void): Unsubscribe
      onRawLine(handler: (line: SerialRawLine) => void): Unsubscribe
      onStatus(handler: (status: ConnectionStatus) => void): Unsubscribe
      onNotificationRuntimeState(handler: (state: NotificationRuntimeState) => void): Unsubscribe
      onNotificationSettings(handler: (settings: NotificationSettings) => void): Unsubscribe
    }
  }
}
