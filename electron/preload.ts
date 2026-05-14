import { contextBridge, ipcRenderer } from 'electron'
import type { ConnectionStatus, SensorFrame } from './serial/types'

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
  connect(portPath: string): Promise<boolean> {
    return ipcRenderer.invoke('serial:connect', portPath)
  },
  disconnect(): Promise<boolean> {
    return ipcRenderer.invoke('serial:disconnect')
  },
  exportCsv(csvText: string): Promise<ExportResult> {
    return ipcRenderer.invoke('data:exportCsv', csvText)
  },
  onFrame(handler: (frame: SensorFrame) => void): Unsubscribe {
    const listener = (_e: unknown, payload: SensorFrame) => handler(payload)
    ipcRenderer.on('serial:frame', listener)
    return () => ipcRenderer.removeListener('serial:frame', listener)
  },
  onStatus(handler: (status: ConnectionStatus) => void): Unsubscribe {
    const listener = (_e: unknown, payload: ConnectionStatus) => handler(payload)
    ipcRenderer.on('serial:status', listener)
    return () => ipcRenderer.removeListener('serial:status', listener)
  },
}

contextBridge.exposeInMainWorld('eva', api)
