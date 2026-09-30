import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { vocToPPM, getAirQualityFromVoc } from '../lib/airQuality'
import {
  STABILIZATION_TIME_MS,
  MEASUREMENT_SAMPLES,
  MEASUREMENT_INTERVAL_MS,
  type MeasurementLocation,
  type MeasurementState,
} from '../lib/constants'

const MAX_HISTORY_POINTS = 200
const SET_LOCAL_TIMEOUT_MS = 5000

type HistoryPoint = {
  t: string
  ts: number
  interno?: number
  externo?: number
}

type SerialLogLine = {
  id: string
  ts: number
  text: string
  direction?: 'tx' | 'rx'
  kind?: SerialLineKind | 'mismatch' | 'system'
}

type FrameWithLocation = SensorFrame & { location: MeasurementLocation }

export function useSerial() {
  const [ports, setPorts] = useState<SerialPortInfo[]>([])
  const [selectedPort, setSelectedPort] = useState<string>('')
  const [status, setStatus] = useState<ConnectionStatus>({ state: 'disconnected' })
  const [lastFrame, setLastFrame] = useState<SensorFrame | null>(null)
  const [history, setHistory] = useState<HistoryPoint[]>([])
  const [serialLines, setSerialLines] = useState<SerialLogLine[]>([])

  const [currentLocation, setCurrentLocationState] = useState<MeasurementLocation>('INTERNO')
  const [requestedLocation, setRequestedLocation] = useState<MeasurementLocation | undefined>(undefined)
  const [confirmedLocation, setConfirmedLocation] = useState<MeasurementLocation | undefined>(undefined)
  const [arduinoState, setArduinoState] = useState<ArduinoConnectionState>('DESCONHECIDO')

  const [stabilizationEndsAt, setStabilizationEndsAt] = useState<number | undefined>()
  const [measurementState, setMeasurementState] = useState<MeasurementState>('idle')
  const [now, setNow] = useState<number>(() => Date.now())

  const recordsRef = useRef<FrameWithLocation[]>([])
  const lastFrameAtRef = useRef<number>(0)
  const pendingAckTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const apiRef = useRef((window as unknown as { eva?: Window['eva'] }).eva)

  const samplingProgress = 0
  const samplingTotal = MEASUREMENT_SAMPLES

  const pushSerialLine = useCallback((line: Omit<SerialLogLine, 'id' | 'ts'> & { ts?: number }) => {
    setSerialLines((prev) => {
      const entry: SerialLogLine = {
        id: `${line.ts ?? Date.now()}-${prev.length}-${Math.random().toString(36).slice(2, 7)}`,
        ts: line.ts ?? Date.now(),
        text: line.text,
        direction: line.direction,
        kind: line.kind,
      }
      return [...prev, entry].slice(-200)
    })
  }, [])

  const clearPendingAckTimer = useCallback(() => {
    if (pendingAckTimerRef.current) {
      clearTimeout(pendingAckTimerRef.current)
      pendingAckTimerRef.current = undefined
    }
  }, [])

  const hydrate = useCallback(async () => {
    const api = apiRef.current
    if (!api) return
    try {
      const settingsLoc = await api.setLastLocation(currentLocation)
      if (settingsLoc) {
        setCurrentLocationState(settingsLoc)
        if (!requestedLocation) setRequestedLocation(settingsLoc)
      }
    } catch {
      void 0 /* no-op */
    }
  }, [currentLocation, requestedLocation])

  const buildCsvTextAsync = useCallback(
    async (frames: FrameWithLocation[]) => {
      const delimiter = ';'

      const escapeCsv = (value: string) => {
        const needsQuotes =
          value.includes('"') || value.includes('\n') || value.includes('\r') || value.includes(delimiter)
        const escaped = value.replaceAll('"', '""')
        return needsQuotes ? `"${escaped}"` : escaped
      }

      const fmt1 = (n: number) => (Number.isFinite(n) ? n.toFixed(1).replace('.', ',') : '')
      const fmt0 = (n: number) => (Number.isFinite(n) ? Math.round(n).toString() : '')

      const ordered = frames.slice().sort((a, b) => a.receivedAt - b.receivedAt)
      const firstRow = ordered[0]
      const lastRow = ordered[ordered.length - 1]
      const metadata = [
        'sep=;',
        ['tipo', 'coleta_serial_completa'].join(delimiter),
        ['primeiro_dado_iso', escapeCsv(firstRow ? new Date(firstRow.receivedAt).toISOString() : '')].join(delimiter),
        ['ultimo_dado_iso', escapeCsv(lastRow ? new Date(lastRow.receivedAt).toISOString() : '')].join(delimiter),
        ['total_registros', String(ordered.length)].join(delimiter),
        '',
      ]

      const header = ['Data/hora', 'Local', 'Temperatura', 'Umidade', 'Pressao', 'Voc', 'ppm'].join(delimiter)

      const buildBody = (rows: FrameWithLocation[]) =>
        rows.map((frame) => {
          const voc = Number.isFinite(frame.vocCorrigido) ? frame.vocCorrigido : frame.voc
          const ppm = Number.isFinite(voc) ? vocToPPM(voc) : Number.NaN
          return [
            escapeCsv(new Date(frame.receivedAt).toLocaleString('pt-BR', { hour12: false })),
            frame.location,
            fmt1(frame.temperature),
            fmt0(frame.humidity),
            fmt1(frame.pressure),
            fmt1(voc),
            fmt0(ppm),
          ].join(delimiter)
        })

      const internoRows = ordered.filter((f) => f.location === 'INTERNO')
      const externoRows = ordered.filter((f) => f.location === 'EXTERNO')

      const body: string[] = []
      if (internoRows.length > 0) {
        body.push(...buildBody(internoRows))
      }
      if (internoRows.length > 0 && externoRows.length > 0) {
        body.push('')
        body.push('')
      }
      if (externoRows.length > 0) {
        body.push(...buildBody(externoRows))
      }

      return [...metadata, header, ...body].join('\r\n')
    },
    [],
  )

  const refreshPorts = useCallback(async () => {
    const api = apiRef.current
    if (!api) return
    try {
      const next = await api.listPorts()
      setPorts(next)
      if (!selectedPort) {
        const last = await api.getLastPort()
        if (last) setSelectedPort(last)
      }
    } catch {
      setPorts([])
    }
  }, [selectedPort])

  const connect = useCallback(
    async (portPath?: string) => {
      const api = apiRef.current
      if (!api) return
      const pathToUse = portPath ?? selectedPort
      if (!pathToUse) return
      await api.connect(pathToUse)
    },
    [selectedPort],
  )

  const disconnect = useCallback(async () => {
    const api = apiRef.current
    if (!api) return
    await api.disconnect()
  }, [])

  const clearSerialLines = useCallback(() => {
    setSerialLines([])
  }, [])

  const startStabilization = useCallback((location: MeasurementLocation) => {
    setCurrentLocationState(location)
    const endsAt = Date.now() + STABILIZATION_TIME_MS
    setStabilizationEndsAt(endsAt)
    setMeasurementState('stabilizing')
    pushSerialLine({
      text: `Iniciando estabilização 120s para ${location}`,
      direction: undefined,
      kind: 'system',
    })
  }, [pushSerialLine])

  const ping = useCallback(async () => {
    const api = apiRef.current
    if (!api) return { ok: false, error: 'API indisponível' }
    try {
      await api.ping()
      return { ok: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao enviar PING.'
      pushSerialLine({
        text: `Erro ao enviar PING: ${message}`,
        direction: undefined,
        kind: 'command_error',
      })
      return { ok: false, error: message }
    }
  }, [pushSerialLine])

  const requestStatus = useCallback(async () => {
    const api = apiRef.current
    if (!api) return { ok: false, error: 'API indisponível' }
    try {
      await api.requestStatus()
      return { ok: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao solicitar STATUS.'
      pushSerialLine({
        text: `Erro ao solicitar STATUS: ${message}`,
        direction: undefined,
        kind: 'command_error',
      })
      return { ok: false, error: message }
    }
  }, [pushSerialLine])

  const setLocation = useCallback(
    async (location: MeasurementLocation) => {
      clearPendingAckTimer()
      const normalized: MeasurementLocation = location === 'EXTERNO' ? 'EXTERNO' : 'INTERNO'
      setRequestedLocation(normalized)
      setCurrentLocationState(normalized)
      setArduinoState('AGUARDANDO_ACK')

      const api = apiRef.current
      if (!api) {
        startStabilization(normalized)
        setConfirmedLocation(normalized)
        setArduinoState('CONFIRMADO')
        return
      }

      try {
        const result = await api.requestSetLocation(normalized)
        if (result?.ok) {
          pendingAckTimerRef.current = setTimeout(() => {
            setArduinoState('NAO_RESPONDEU')
            pushSerialLine({
              text: `⚠️ Arduino não confirmou a mudança para ${normalized} em ${SET_LOCAL_TIMEOUT_MS / 1000}s.`,
              direction: undefined,
              kind: 'system',
            })
          }, SET_LOCAL_TIMEOUT_MS)
          return
        }
        pushSerialLine({
          text: `Falha ao solicitar mudança para ${normalized}: ${result?.error ?? 'Erro desconhecido'}`,
          direction: undefined,
          kind: 'command_error',
        })
        setArduinoState('NAO_RESPONDEU')
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro ao enviar comando ao Arduino.'
        pushSerialLine({
          text: `Erro ao enviar SET_LOCAL:${normalized} — ${message}`,
          direction: undefined,
          kind: 'command_error',
        })
        setArduinoState('NAO_RESPONDEU')
      }
    },
    [clearPendingAckTimer, pushSerialLine, startStabilization],
  )

  const clearSession = useCallback(() => {
    recordsRef.current = []
    setHistory([])
    lastFrameAtRef.current = 0
    startStabilization(currentLocation)
  }, [currentLocation, startStabilization])

  const exportCsv = useCallback(async () => {
    const api = apiRef.current
    if (!api) return { ok: false, error: 'API indisponível' } as ExportResult
    if (recordsRef.current.length === 0) {
      return { ok: false, error: 'Nenhum dado coletado ainda para exportar.' } as ExportResult
    }
    const csvText = await buildCsvTextAsync(recordsRef.current)
    return api.exportCsv(csvText)
  }, [buildCsvTextAsync])

  const backupCsv = useCallback(async () => {
    const api = apiRef.current
    if (!api) return { ok: false, error: 'API indisponível' } as ExportResult
    if (recordsRef.current.length === 0) {
      return { ok: false, error: 'Nenhum dado coletado ainda para backup.' } as ExportResult
    }
    const csvText = await buildCsvTextAsync(recordsRef.current)
    return api.backupCsv(csvText)
  }, [buildCsvTextAsync])

  useEffect(() => {
    const interval = setInterval(() => {
      const t = Date.now()
      setNow(t)
      if (measurementState !== 'stabilizing') return
      if (!stabilizationEndsAt) return
      if (t >= stabilizationEndsAt) {
        setMeasurementState(lastFrame ? 'ready' : 'idle')
        setStabilizationEndsAt(undefined)
        pushSerialLine({
          text: 'Estabilização concluída. Dados válidos iniciando.',
          direction: undefined,
          kind: 'system',
        })
      }
    }, 500)
    return () => clearInterval(interval)
  }, [measurementState, stabilizationEndsAt, lastFrame, pushSerialLine])

  useEffect(() => {
    const api = apiRef.current
    if (!api) return
    void hydrate()
    void refreshPorts()

    api
      .getStatus()
      .then((s) => {
        setStatus(s)
        if (s.portPath) setSelectedPort(s.portPath)
        if (s.state === 'connected') {
          void requestStatus()
        }
      })
      .catch(() => {
        // no-op
      })

    api
      .getLastPort()
      .then((p) => {
        if (p) setSelectedPort((current) => current || p)
      })
      .catch(() => {
        // no-op
      })

    const unsubStatus = api.onStatus((s) => {
      const prior = status.state
      setStatus(s)
      if (s.portPath) setSelectedPort(s.portPath)
      if (prior !== 'connected' && s.state === 'connected') {
        void requestStatus()
      }
    })
    const unsubRawLine = api.onRawLine((line) => {
      pushSerialLine({
        ts: line.receivedAt,
        text: line.text,
        direction: line.direction ?? 'rx',
        kind: line.kind ?? 'data',
      })
    })
    const unsubTxLine = api.onTxLine((line) => {
      pushSerialLine({
        ts: line.receivedAt,
        text: line.text,
        direction: line.direction ?? 'tx',
        kind: line.kind ?? 'control',
      })
    })
    const unsubControl = api.onControl((ev) => {
      if (ev.type === 'ACK') {
        if (ev.location === requestedLocation) {
          clearPendingAckTimer()
          setConfirmedLocation(ev.location)
          setArduinoState('CONFIRMADO')
          pushSerialLine({
            ts: ev.receivedAt,
            text: `✅ ACK recebido para ${ev.location} — estabilização iniciada.`,
            direction: 'rx',
            kind: 'control',
          })
          startStabilization(ev.location)
        } else {
          pushSerialLine({
            ts: ev.receivedAt,
            text: `ACK recebido (${ev.location}) não corresponde ao solicitado (${requestedLocation ?? '—'}).`,
            direction: 'rx',
            kind: 'control',
          })
          setArduinoState('INCOMPATIVEL')
        }
        return
      }

      if (ev.type === 'STATUS') {
        clearPendingAckTimer()
        setConfirmedLocation(ev.location)
        if (!requestedLocation) {
          setRequestedLocation(ev.location)
          setCurrentLocationState(ev.location)
        }
        if (arduinoState === 'DESCONHECIDO' || arduinoState === 'NAO_RESPONDEU') {
          setArduinoState('CONFIRMADO')
        }
        pushSerialLine({
          ts: ev.receivedAt,
          text: `STATUS recebido: Arduino está em ${ev.location}`,
          direction: 'rx',
          kind: 'control',
        })
        return
      }

      if (ev.type === 'PONG') {
        pushSerialLine({
          ts: ev.receivedAt,
          text: 'PONG recebido. Comunicação bidirecional OK.',
          direction: 'rx',
          kind: 'control',
        })
        return
      }

      if (ev.type === 'TX_SENT') {
        return
      }

      if (ev.type === 'COMMAND_ERROR') {
        pushSerialLine({
          ts: ev.receivedAt,
          text: `ERRO comando: ${ev.error} ${ev.raw ? ` (${ev.raw})` : ''}`,
          direction: undefined,
          kind: 'command_error',
        })
      }
    })
    const unsubFrame = api.onFrame((frame) => {
      const loc: MeasurementLocation = frame.location === 'EXTERNO' ? 'EXTERNO' : 'INTERNO'

      if (confirmedLocation && loc !== confirmedLocation) {
        pushSerialLine({
          ts: frame.receivedAt,
          text: `DADO IGNORADO — esperado ${confirmedLocation}, recebido ${loc}. Frame: ${frame.raw}`,
          direction: 'rx',
          kind: 'mismatch',
        })
        return
      }

      const located = { ...frame, location: loc }
      recordsRef.current.push(located)
      setLastFrame(frame)

      if (measurementState !== 'stabilizing') {
        const tsFrame = frame.receivedAt
        if (tsFrame - lastFrameAtRef.current >= MEASUREMENT_INTERVAL_MS) {
          lastFrameAtRef.current = tsFrame
          const voc = Number.isFinite(frame.vocCorrigido) ? frame.vocCorrigido : frame.voc
          const quality = Number.isFinite(voc) ? getAirQualityFromVoc(voc) : null
          setHistory((prev) => {
            const nextPoint: HistoryPoint = {
              t: new Date(tsFrame).toLocaleTimeString('pt-BR', { hour12: false }),
              ts: tsFrame,
              interno: loc === 'INTERNO' ? quality?.percent : undefined,
              externo: loc === 'EXTERNO' ? quality?.percent : undefined,
            }
            const next = [...prev, nextPoint]
            return next.slice(-MAX_HISTORY_POINTS)
          })
        }
      }
    })

    const interval = setInterval(() => void refreshPorts(), 4000)
    return () => {
      clearInterval(interval)
      clearPendingAckTimer()
      unsubStatus()
      unsubRawLine()
      unsubTxLine()
      unsubControl()
      unsubFrame()
    }
  }, [
    hydrate,
    refreshPorts,
    requestStatus,
    measurementState,
    requestedLocation,
    confirmedLocation,
    arduinoState,
    pushSerialLine,
    clearPendingAckTimer,
    startStabilization,
    status.state,
  ])

  const selectedPortInfo = useMemo(() => ports.find((p) => p.path === selectedPort), [ports, selectedPort])

  return {
    ports,
    selectedPort,
    setSelectedPort,
    selectedPortInfo,
    status,
    lastFrame,
    history,
    serialLines,
    clearSerialLines,
    refreshPorts,
    connect,
    disconnect,
    ping,
    requestStatus,
    exportCsv,
    backupCsv,
    currentLocation,
    requestedLocation,
    confirmedLocation,
    arduinoState,
    setLocation,
    measurementState,
    stabilizationEndsAt,
    now,
    samplingProgress,
    samplingTotal,
    savedInternal: undefined,
    savedExternal: undefined,
    beginSampling: () => void 0,
    clearSession,
    hasAnySaved: false,
  }
}
