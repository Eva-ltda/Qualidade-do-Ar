import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getAirQualityFromVoc } from '../lib/airQuality'

type QualityPoint = {
  t: string
  ts: number
  interno: number
  externo: number
}

type SerialLogLine = {
  id: string
  ts: number
  text: string
}

export function useSerial(sampleIntervalMs = 2000) {
  const [ports, setPorts] = useState<SerialPortInfo[]>([])
  const [selectedPort, setSelectedPort] = useState<string>('')
  const [status, setStatus] = useState<ConnectionStatus>({ state: 'disconnected' })
  const [lastFrame, setLastFrame] = useState<SensorFrame | null>(null)
  const [history, setHistory] = useState<QualityPoint[]>([])
  const [serialLines, setSerialLines] = useState<SerialLogLine[]>([])

  const recordsRef = useRef<SensorFrame[]>([])
  const lastSampleAtRef = useRef<number>(0)
  const api = (window as unknown as { eva?: Window['eva'] }).eva

  const refreshPorts = useCallback(async () => {
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
  }, [api, selectedPort])

  const connect = useCallback(
    async (portPath?: string) => {
      if (!api) return
      const pathToUse = portPath ?? selectedPort
      if (!pathToUse) return
      await api.connect(pathToUse)
    },
    [api, selectedPort],
  )

  const disconnect = useCallback(async () => {
    if (!api) return
    await api.disconnect()
  }, [api])

  const exportCsv = useCallback(async () => {
    if (!api) return { ok: false, error: 'API indisponível' } as ExportResult
    const rows = recordsRef.current
    const delimiter = ';'

    const escapeCsv = (value: string) => {
      const needsQuotes = value.includes('"') || value.includes('\n') || value.includes('\r') || value.includes(delimiter)
      const escaped = value.replaceAll('"', '""')
      return needsQuotes ? `"${escaped}"` : escaped
    }

    const fmt1 = (n: number) => (Number.isFinite(n) ? n.toFixed(1).replace('.', ',') : '')
    const fmt0 = (n: number) => (Number.isFinite(n) ? Math.round(n).toString() : '')

    const header = [
      'timestamp_iso',
      'tempInterno_c',
      'humInterno_pct',
      'pressInterno_hpa',
      'vocInternoReal_kohm',
      'vocInterno_kohm',
      'tempExterno_c',
      'humExterno_pct',
      'pressExterno_hpa',
      'vocExternoReal_kohm',
      'vocExterno_kohm',
      'raw',
    ].join(delimiter)

    const lines = rows.map((r) =>
      [
        escapeCsv(new Date(r.receivedAt).toISOString()),
        fmt1(r.tempInterno),
        fmt0(r.humInterno),
        fmt0(r.pressInterno),
        fmt1(r.vocInternoReal),
        fmt1(r.vocInterno),
        fmt1(r.tempExterno),
        fmt0(r.humExterno),
        fmt0(r.pressExterno),
        fmt1(r.vocExternoReal),
        fmt1(r.vocExterno),
        escapeCsv(String(r.raw ?? '')),
      ].join(delimiter),
    )

    const csvText = ['sep=;', header, ...lines].join('\r\n')
    return api.exportCsv(csvText)
  }, [api])

  useEffect(() => {
    if (!api) return
    refreshPorts()

    api
      .getStatus()
      .then((s) => {
        setStatus(s)
        if (s.portPath) setSelectedPort(s.portPath)
      })
      .catch(() => {})

    api
      .getLastPort()
      .then((p) => {
        if (p) setSelectedPort((current) => current || p)
      })
      .catch(() => {})

    const unsubStatus = api.onStatus((s) => {
      setStatus(s)
      if (s.portPath) setSelectedPort(s.portPath)
    })
    const unsubRawLine = api.onRawLine((line) => {
      setSerialLines((prev) =>
        [...prev, { id: `${line.receivedAt}-${prev.length}`, ts: line.receivedAt, text: line.text }].slice(-200),
      )
    })
    const unsubFrame = api.onFrame((frame) => {
      recordsRef.current = [...recordsRef.current, frame].slice(-5000)

      const now = frame.receivedAt
      const lastSampleAt = lastSampleAtRef.current
      if (Number.isFinite(sampleIntervalMs) && sampleIntervalMs > 0 && now - lastSampleAt < sampleIntervalMs) {
        return
      }
      lastSampleAtRef.current = now

      setLastFrame(frame)

      const qi = getAirQualityFromVoc(frame.vocInternoCorrigido)
      const qe = getAirQualityFromVoc(frame.vocExternoCorrigido)
      const t = new Date(frame.receivedAt).toLocaleTimeString('pt-BR', { hour12: false })

      setHistory((prev) => [...prev, { t, ts: frame.receivedAt, interno: qi.percent, externo: qe.percent }].slice(-30))
    })

    const interval = setInterval(refreshPorts, 4000)
    return () => {
      clearInterval(interval)
      unsubStatus()
      unsubRawLine()
      unsubFrame()
    }
  }, [api, refreshPorts, sampleIntervalMs])

  const selectedPortInfo = useMemo(
    () => ports.find((p) => p.path === selectedPort),
    [ports, selectedPort],
  )

  return {
    ports,
    selectedPort,
    setSelectedPort,
    selectedPortInfo,
    status,
    lastFrame,
    history,
    serialLines,
    refreshPorts,
    connect,
    disconnect,
    exportCsv,
  }
}
