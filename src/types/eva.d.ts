export {}

declare global {
  type MeasurementLocation = 'INTERNO' | 'EXTERNO'

  type SavedMeasurement = {
    location: MeasurementLocation
    temperature: number
    humidity: number
    pressure: number
    voc: number
    vocIndex: number
    receivedAt: number
  }

  type MeasurementState = 'idle' | 'stabilizing' | 'ready' | 'sampling' | 'saved'

  type SerialControlType = 'ACK' | 'STATUS' | 'PONG' | 'PING_TIMEOUT' | 'SET_LOCAL_TIMEOUT' | 'TX_SENT' | 'COMMAND_ERROR'

  type SerialControlEvent =
    | { type: 'ACK'; location: MeasurementLocation; raw: string; receivedAt: number }
    | { type: 'STATUS'; location: MeasurementLocation; raw: string; receivedAt: number }
    | { type: 'PONG'; raw: string; receivedAt: number }
    | { type: 'PING_TIMEOUT'; raw?: string; receivedAt: number }
    | { type: 'SET_LOCAL_TIMEOUT'; location?: MeasurementLocation; receivedAt: number }
    | { type: 'TX_SENT'; raw: string; receivedAt: number }
    | { type: 'COMMAND_ERROR'; error: string; raw?: string; receivedAt: number }

  type SerialLineKind = 'control' | 'data' | 'info' | 'command_error' | 'mismatch' | 'system'

  type ArduinoConnectionState = 'DESCONHECIDO' | 'CONFIRMADO' | 'AGUARDANDO_ACK' | 'NAO_RESPONDEU' | 'INCOMPATIVEL'

  type NotificationSettings = {
    enabled: boolean
    phoneNumber: string
    chatId?: string
    chatIds?: string[]
    chatIntervals?: Record<string, number>
    chatBackupIntervals?: Record<string, number>
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

  type SerialRawLine = {
    text: string
    receivedAt: number
    direction?: 'tx' | 'rx'
    kind?: SerialLineKind
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

  type SetLocationResult = { ok: true; location: MeasurementLocation } | { ok: false; error?: string }

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
      getSavedMeasurements(): Promise<{ interno?: SavedMeasurement; externo?: SavedMeasurement }>
      setLastLocation(location: MeasurementLocation): Promise<MeasurementLocation>
      saveMeasurement(measurement: SavedMeasurement): Promise<{ interno?: SavedMeasurement; externo?: SavedMeasurement }>
      clearSavedMeasurements(): Promise<{ interno?: SavedMeasurement; externo?: SavedMeasurement }>
      connect(portPath: string): Promise<boolean>
      disconnect(): Promise<boolean>
      sendCommand(command: string): Promise<boolean>
      requestStatus(): Promise<boolean>
      ping(): Promise<boolean>
      requestSetLocation(location: MeasurementLocation): Promise<SetLocationResult>
      exportCsv(csvText: string): Promise<ExportResult>
      backupCsv(csvText: string): Promise<ExportResult>
      notifyPrintCaptureReady(): void
      onFrame(handler: (frame: SensorFrame) => void): Unsubscribe
      onRawLine(handler: (line: SerialRawLine) => void): Unsubscribe
      onControl(handler: (event: SerialControlEvent) => void): Unsubscribe
      onTxLine(handler: (line: SerialRawLine) => void): Unsubscribe
      onStatus(handler: (status: ConnectionStatus) => void): Unsubscribe
      onNotificationRuntimeState(handler: (state: NotificationRuntimeState) => void): Unsubscribe
      onNotificationSettings(handler: (settings: NotificationSettings) => void): Unsubscribe
      onPrintCaptureRequest(handler: (frame?: SensorFrame) => void): Unsubscribe
      onPrintCaptureFinished(handler: () => void): Unsubscribe
    }
  }
}

