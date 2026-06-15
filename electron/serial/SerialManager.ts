import { EventEmitter } from 'node:events'
import { SerialPort } from 'serialport'
import { ReadlineParser } from '@serialport/parser-readline'
import type { ConnectionStatus, SensorFrame } from './types'

type SerialManagerEvents = {
  frame: (frame: SensorFrame) => void
  status: (status: ConnectionStatus) => void
}

export class SerialManager extends EventEmitter {
  private port: SerialPort | undefined
  private desiredPortPath: string | undefined
  private status: ConnectionStatus = { state: 'disconnected' }
  private reconnectTimer: NodeJS.Timeout | undefined
  private staleTimer: NodeJS.Timeout | undefined
  private userInitiatedDisconnect = false

  override on<E extends keyof SerialManagerEvents>(event: E, listener: SerialManagerEvents[E]): this {
    return super.on(event, listener)
  }

  override emit<E extends keyof SerialManagerEvents>(event: E, ...args: Parameters<SerialManagerEvents[E]>): boolean {
    return super.emit(event, ...args)
  }

  getStatus() {
    return this.status
  }

  async listPorts() {
    const ports = await SerialPort.list()
    return ports
      .filter((p) => p.path)
      .map((p) => ({
        path: p.path,
        manufacturer: p.manufacturer,
        serialNumber: p.serialNumber,
        vendorId: p.vendorId,
        productId: p.productId,
        friendlyName: (p as unknown as { friendlyName?: string }).friendlyName,
      }))
  }

  async connect(portPath: string, baudRate = 9600) {
    this.userInitiatedDisconnect = false
    this.desiredPortPath = portPath

    if (this.port?.isOpen && this.status.portPath === portPath) {
      return
    }

    await this.disconnectInternal()

    this.setStatus({ state: 'connecting', portPath })

    const port = new SerialPort({ path: portPath, baudRate, autoOpen: false })
    this.port = port

    port.on('error', (err) => {
      this.setStatus({ state: 'error', portPath, error: err?.message ?? 'Erro serial' })
    })

    port.on('close', () => {
      const lastPath = this.status.portPath
      this.port = undefined
      if (this.userInitiatedDisconnect) {
        this.setStatus({ state: 'disconnected', portPath: lastPath })
        return
      }
      this.setStatus({ state: 'disconnected', portPath: lastPath, error: 'Conexão encerrada' })
      this.scheduleReconnect()
    })

    const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }))
    parser.on('data', (line: string) => {
      const trimmed = String(line ?? '').trim()
      const frame = this.parseFrame(trimmed)
      if (!frame) return

      const now = Date.now()
      this.setStatus({ state: 'connected', portPath, lastReceivedAt: now })
      this.emit('frame', { ...frame, receivedAt: now })
    })

    await new Promise<void>((resolve, reject) => {
      port.open((err) => {
        if (err) reject(err)
        else resolve()
      })
    }).catch((err) => {
      this.setStatus({ state: 'error', portPath, error: err?.message ?? 'Falha ao abrir porta' })
      this.scheduleReconnect()
      throw err
    })

    this.setStatus({ state: 'connected', portPath, lastReceivedAt: this.status.lastReceivedAt })
    this.startStaleDetection()
  }

  async disconnect() {
    this.userInitiatedDisconnect = true
    this.desiredPortPath = undefined
    await this.disconnectInternal()
    this.setStatus({ state: 'disconnected', portPath: this.status.portPath })
  }

  private async disconnectInternal() {
    this.clearReconnect()
    this.stopStaleDetection()

    const port = this.port
    this.port = undefined

    if (!port) return
    if (!port.isOpen) return

    await new Promise<void>((resolve) => {
      port.close(() => resolve())
    })
  }

  private setStatus(next: ConnectionStatus) {
    const merged: ConnectionStatus = {
      ...this.status,
      ...next,
    }

    if (merged.state === 'connected') {
      merged.error = undefined
    }

    this.status = merged
    this.emit('status', this.status)
  }

  private scheduleReconnect() {
    this.clearReconnect()

    const desired = this.desiredPortPath
    if (!desired) return

    this.reconnectTimer = setTimeout(() => {
      const stillDesired = this.desiredPortPath
      if (!stillDesired) return
      this.connect(stillDesired).catch(() => {})
    }, 1500)
  }

  private clearReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = undefined
  }

  private startStaleDetection() {
    this.stopStaleDetection()
    this.staleTimer = setInterval(() => {
      if (this.status.state !== 'connected') return
      if (!this.status.lastReceivedAt) return
      const age = Date.now() - this.status.lastReceivedAt
      if (age < 6500) return
      const portPath = this.status.portPath
      this.setStatus({ state: 'error', portPath, error: 'Sem dados (timeout)' })
    }, 1000)
  }

  private stopStaleDetection() {
    if (this.staleTimer) clearInterval(this.staleTimer)
    this.staleTimer = undefined
  }

  private parseFrame(rawLine: string): Omit<SensorFrame, 'receivedAt'> | null {
    if (!rawLine) return null

    const parts = rawLine.split(',').map((s) => s.trim())
    if (parts.length < 8) return null

    const take = parts.length >= 10 ? 10 : 8
    const nums = parts.slice(0, take).map((p) => Number(p))
    if (nums.some((n) => Number.isNaN(n))) return null

    const hasCorrectedVoc = nums.length >= 10
    const vocInternoReal = hasCorrectedVoc ? nums[3] : nums[3]
    const vocInternoCorrigido = hasCorrectedVoc ? nums[4] : nums[3]
    const tempExterno = hasCorrectedVoc ? nums[5] : nums[4]
    const humExterno = hasCorrectedVoc ? nums[6] : nums[5]
    const pressExterno = hasCorrectedVoc ? nums[7] : nums[6]
    const vocExternoReal = hasCorrectedVoc ? nums[8] : nums[7]
    const vocExternoCorrigido = hasCorrectedVoc ? nums[9] : nums[7]

    return {
      tempInterno: nums[0],
      humInterno: nums[1],
      pressInterno: nums[2],
      vocInterno: vocInternoCorrigido,
      vocInternoReal,
      vocInternoCorrigido,
      tempExterno,
      humExterno,
      pressExterno,
      vocExterno: vocExternoCorrigido,
      vocExternoReal,
      vocExternoCorrigido,
      raw: rawLine,
    }
  }
}
