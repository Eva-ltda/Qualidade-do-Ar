import { EventEmitter } from 'node:events'
import { SerialPort } from 'serialport'
import { ReadlineParser } from '@serialport/parser-readline'
import type {
  ConnectionStatus,
  MeasurementLocation,
  SensorFrame,
  SerialControlEvent,
  SerialRawLine,
} from './types.js'

type SerialManagerEvents = {
  frame: (frame: SensorFrame) => void
  rawLine: (line: SerialRawLine) => void
  control: (event: SerialControlEvent) => void
  txLine: (line: SerialRawLine) => void
  status: (status: ConnectionStatus) => void
}

function toNumberPtBr(input: string): number {
  const cleaned = String(input ?? '').trim().replace(',', '.')
  if (!cleaned) return Number.NaN
  return Number(cleaned)
}

const DEFAULT_LOCATION: MeasurementLocation = 'INTERNO'

export class SerialManager extends EventEmitter {
  private port: SerialPort | undefined
  private desiredPortPath: string | undefined
  private status: ConnectionStatus = { state: 'disconnected' }
  private reconnectTimer: NodeJS.Timeout | undefined
  private staleTimer: NodeJS.Timeout | undefined
  private userInitiatedDisconnect = false
  private lastLocation: MeasurementLocation = DEFAULT_LOCATION

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

  async sendCommand(command: string): Promise<void> {
    const port = this.port
    if (!port || !port.isOpen) {
      const error = new Error('Porta serial não está aberta.')
      this.emit('control', { type: 'COMMAND_ERROR', error: error.message, raw: command, receivedAt: Date.now() })
      throw error
    }

    const trimmedCmd = String(command ?? '').trimEnd()
    if (!trimmedCmd) {
      const error = new Error('Comando vazio.')
      this.emit('control', { type: 'COMMAND_ERROR', error: error.message, raw: command, receivedAt: Date.now() })
      throw error
    }

    const payload = trimmedCmd + '\n'
    const now = Date.now()
    this.emit('txLine', { text: trimmedCmd, receivedAt: now, direction: 'tx', kind: 'control' })
    this.emit('control', { type: 'TX_SENT', raw: trimmedCmd, receivedAt: now })

    await new Promise<void>((resolve, reject) => {
      port.write(payload, (err) => {
        if (err) {
          this.emit('control', {
            type: 'COMMAND_ERROR',
            error: err?.message ?? 'Erro ao escrever na serial.',
            raw: trimmedCmd,
            receivedAt: Date.now(),
          })
          reject(err)
          return
        }
        port.drain((drainErr) => {
          if (drainErr) {
            this.emit('control', {
              type: 'COMMAND_ERROR',
              error: drainErr?.message ?? 'Erro ao drenar buffer serial.',
              raw: trimmedCmd,
              receivedAt: Date.now(),
            })
            reject(drainErr)
            return
          }
          resolve()
        })
      })
    })
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
      if (!trimmed) return

      const now = Date.now()
      const controlEvent = this.parseControl(trimmed, now)
      if (controlEvent) {
        this.emit('rawLine', { text: trimmed, receivedAt: now, direction: 'rx', kind: 'control' })
        this.emit('control', controlEvent)
        if (controlEvent.type === 'ACK' || controlEvent.type === 'STATUS') {
          this.lastLocation = controlEvent.location
        }
        return
      }

      this.emit('rawLine', { text: trimmed, receivedAt: now, direction: 'rx', kind: 'data' })

      const frame = this.parseFrame(trimmed)
      if (!frame) return

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

    setTimeout(() => {
      this.sendCommand('STATUS').catch(() => {})
    }, 250)
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

  setLastLocation(location: MeasurementLocation) {
    this.lastLocation = location
  }

  getLastLocation(): MeasurementLocation {
    return this.lastLocation
  }

  private parseControl(rawLine: string, receivedAt: number): SerialControlEvent | null {
    if (!rawLine) return null

    if (rawLine === 'PONG') {
      return { type: 'PONG', raw: rawLine, receivedAt }
    }

    if (rawLine.startsWith('ACK:')) {
      const rawLoc = rawLine.slice('ACK:'.length).trim().toUpperCase()
      const location: MeasurementLocation = rawLoc === 'EXTERNO' ? 'EXTERNO' : 'INTERNO'
      return { type: 'ACK', location, raw: rawLine, receivedAt }
    }

    if (rawLine.startsWith('STATUS:')) {
      const rawLoc = rawLine.slice('STATUS:'.length).trim().toUpperCase()
      const location: MeasurementLocation = rawLoc === 'EXTERNO' ? 'EXTERNO' : 'INTERNO'
      return { type: 'STATUS', location, raw: rawLine, receivedAt }
    }

    return null
  }

  private parseFrame(rawLine: string): Omit<SensorFrame, 'receivedAt'> | null {
    if (!rawLine) return null

    const hasSemicolon = rawLine.includes(';')
    if (hasSemicolon) return this.parseNewFormat(rawLine)
    return this.parseLegacyFormat(rawLine)
  }

  private parseNewFormat(rawLine: string): Omit<SensorFrame, 'receivedAt'> | null {
    const parts = rawLine.split(';').map((s) => s.trim())
    if (parts.length < 5) return null

    const rawLocation = (parts[0] ?? '').toUpperCase()
    const location: MeasurementLocation = rawLocation === 'EXTERNO' ? 'EXTERNO' : 'INTERNO'
    this.lastLocation = location

    const temperature = toNumberPtBr(parts[1])
    const humidity = toNumberPtBr(parts[2])
    const pressure = toNumberPtBr(parts[3])
    const voc = toNumberPtBr(parts[4])
    const vocReal = voc
    const vocCorrigido = voc

    if ([temperature, humidity, pressure, voc].some((n) => Number.isNaN(n))) return null

    const isInternal = location === 'INTERNO'

    return {
      location,
      temperature,
      humidity,
      pressure,
      voc,
      vocReal,
      vocCorrigido,
      tempInterno: isInternal ? temperature : Number.NaN,
      humInterno: isInternal ? humidity : Number.NaN,
      pressInterno: isInternal ? pressure : Number.NaN,
      vocInterno: isInternal ? vocCorrigido : Number.NaN,
      vocInternoReal: isInternal ? vocReal : Number.NaN,
      vocInternoCorrigido: isInternal ? vocCorrigido : Number.NaN,
      tempExterno: !isInternal ? temperature : Number.NaN,
      humExterno: !isInternal ? humidity : Number.NaN,
      pressExterno: !isInternal ? pressure : Number.NaN,
      vocExterno: !isInternal ? vocCorrigido : Number.NaN,
      vocExternoReal: !isInternal ? vocReal : Number.NaN,
      vocExternoCorrigido: !isInternal ? vocCorrigido : Number.NaN,
      raw: rawLine,
    }
  }

  private parseLegacyFormat(rawLine: string): Omit<SensorFrame, 'receivedAt'> | null {
    const parts = rawLine.split(',').map((s) => s.trim())
    if (parts.length < 8) return null

    const take = parts.length >= 10 ? 10 : 8
    const nums = parts.slice(0, take).map((p) => toNumberPtBr(p))
    if (nums.some((n) => Number.isNaN(n))) return null

    const hasCorrectedVoc = nums.length >= 10
    const tempInterno = nums[0]
    const humInterno = nums[1]
    const pressInterno = nums[2]
    const vocInternoReal = hasCorrectedVoc ? nums[3] : nums[3]
    const vocInternoCorrigido = hasCorrectedVoc ? nums[4] : nums[3]
    const tempExterno = hasCorrectedVoc ? nums[5] : nums[4]
    const humExterno = hasCorrectedVoc ? nums[6] : nums[5]
    const pressExterno = hasCorrectedVoc ? nums[7] : nums[6]
    const vocExternoReal = hasCorrectedVoc ? nums[8] : nums[7]
    const vocExternoCorrigido = hasCorrectedVoc ? nums[9] : nums[7]

    const location = this.lastLocation

    return {
      location,
      temperature: location === 'INTERNO' ? tempInterno : tempExterno,
      humidity: location === 'INTERNO' ? humInterno : humExterno,
      pressure: location === 'INTERNO' ? pressInterno : pressExterno,
      voc: location === 'INTERNO' ? vocInternoCorrigido : vocExternoCorrigido,
      vocReal: location === 'INTERNO' ? vocInternoReal : vocExternoReal,
      vocCorrigido: location === 'INTERNO' ? vocInternoCorrigido : vocExternoCorrigido,
      tempInterno,
      humInterno,
      pressInterno,
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

