import { contextBridge, ipcRenderer } from 'electron'
import type { ConnectionStatus, SensorFrame, SerialRawLine } from './serial/types.js'
import type { NotificationSettings } from './settings.js'

type PortInfo = {
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

const api = {
  listPorts(): Promise<PortInfo[]> {
    return ipcRenderer.invoke('serial:listPorts')
  },
  getStatus(): Promise<ConnectionStatus> {
    return ipcRenderer.invoke('serial:getStatus')
  },
  getLastPort(): Promise<string | undefined> {
    return ipcRenderer.invoke('serial:getLastPort')
  },
  getNotificationSettings(): Promise<NotificationSettings> {
    return ipcRenderer.invoke('notifications:getSettings')
  },
  getNotificationRuntimeState(): Promise<NotificationRuntimeState> {
    return ipcRenderer.invoke('notifications:getRuntimeState')
  },
  saveNotificationSettings(settings: NotificationSettings): Promise<NotificationSettings> {
    return ipcRenderer.invoke('notifications:saveSettings', settings)
  },
  testNotification(settings: NotificationSettings): Promise<NotificationActionResult> {
    return ipcRenderer.invoke('notifications:testNotification', settings)
  },
  connect(portPath: string): Promise<boolean> {
    return ipcRenderer.invoke('serial:connect', portPath)
  },
  disconnect(): Promise<boolean> {
    return ipcRenderer.invoke('serial:disconnect')
  },
  exportCsv(csvText: string): Promise<ExportResult> {
    return ipcRenderer.invoke('data:exportCsv', csvText)
  },
  backupCsv(csvText: string): Promise<ExportResult> {
    return ipcRenderer.invoke('data:backupCsv', csvText)
  },
  onFrame(handler: (frame: SensorFrame) => void): Unsubscribe {
    const listener = (_e: unknown, payload: SensorFrame) => handler(payload)
    ipcRenderer.on('serial:frame', listener)
    return () => ipcRenderer.removeListener('serial:frame', listener)
  },
  onRawLine(handler: (line: SerialRawLine) => void): Unsubscribe {
    const listener = (_e: unknown, payload: SerialRawLine) => handler(payload)
    ipcRenderer.on('serial:rawLine', listener)
    return () => ipcRenderer.removeListener('serial:rawLine', listener)
  },
  onStatus(handler: (status: ConnectionStatus) => void): Unsubscribe {
    const listener = (_e: unknown, payload: ConnectionStatus) => handler(payload)
    ipcRenderer.on('serial:status', listener)
    return () => ipcRenderer.removeListener('serial:status', listener)
  },
  onNotificationRuntimeState(handler: (state: NotificationRuntimeState) => void): Unsubscribe {
    const listener = (_e: unknown, payload: NotificationRuntimeState) => handler(payload)
    ipcRenderer.on('notifications:runtimeState', listener)
    return () => ipcRenderer.removeListener('notifications:runtimeState', listener)
  },
  onNotificationSettings(handler: (settings: NotificationSettings) => void): Unsubscribe {
    const listener = (_e: unknown, payload: NotificationSettings) => handler(payload)
    ipcRenderer.on('notifications:settings', listener)
    return () => ipcRenderer.removeListener('notifications:settings', listener)
  },
}

contextBridge.exposeInMainWorld('eva', api)
